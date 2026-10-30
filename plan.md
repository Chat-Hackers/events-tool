# Plan: Subscribe to .ics calendar feeds in events-tool

## Goal

When a chat message contains a link ending in `.ics`, the events-tool subscribes the room to
that calendar feed. The existing 5-minute scheduler then checks the feed for upcoming events
(including recurring ones) and posts the same milestone reminders it already posts for
luma/eventbrite links ("in 4 weeks" … "is happening now").

## Current architecture (what we're extending)

```
Matrix msg → tool-hub POST / → index.ts (POST /)
  → messages.ts handleMessage()      gate: "http" + luma./eventbrite.
      → events.ts tryGetEvent()      fetch page, parse ld+json → { name, startDate }
      → duckdb.ts insertEvent()      Events(room_id, event_url, past)
  → scheduler.ts checkEvents()       every 5 min: tryGetEvent per row → threshold → sendMessage
```

Key facts:

- Tool registers as `id: "events"` (port 5057); `events.json` is regenerated on startup from
  `toolRegistration` in `src/index.ts`. No tool-hub changes needed — it forwards any
  `m.room.message` for tools with `active: ["m.room.message"]` and posts our `response.message`
  back to the room.
- The `past` flag + threshold windows give natural "fire once" dedupe for single events: each
  milestone window (`toleranceSeconds` = 5 min, equal to the tick interval) is hit by exactly
  one tick.
- `startDate` is an ISO string consumed by `Temporal.Instant.from()` (Node 26 ships Temporal;
  verified locally, docker image is `node:26-slim`).
- Message sending goes through tool-hub: `requests.ts sendMessage()` →
  `POST {dashboard_url}/api/send?roomId=…&toolId=events&secret={events_secret}`.

## Convention audit (patterns this plan follows)

| Convention | Source | Followed by |
|---|---|---|
| DuckDB tables created at startup via `tables[]` array in `startDuckDB()`; prepared statements with `bindVarchar`/`bindBoolean`; `getX`, `insertX`, `updateX`, `removeX` naming | `src/duckdb.ts` | new `Calendars` table + accessors |
| Message gate + `parseForX` returning `{ message }` for tool-hub to echo into the room | `src/messages.ts` | new `parseForIcsUrl` |
| Fetch-and-normalize to `{ name, startDate }` with silent `undefined` on failure (404 / parse error) | `src/events.ts` | new `src/ics.ts` |
| Scheduler: ToadScheduler `SimpleIntervalJob` every 5 min, `runImmediately` | `src/scheduler.ts` | second job in same `beginSchedule` |
| `AsyncTask` + `preventOverrun` + error callback + `SIGTERM`/`SIGINT` stop | newer convention in `emails-tool/src/scheduler.ts`, `schedule-tool/src/scheduler.ts` | calendar job (and existing events job, see flag below) |
| Dashboard: `GET /api/<x>?roomId=`, `DELETE /api/<x>?roomId=` + `{ url }` body; React list with confirm-delete | `src/index.ts`, `web/App.tsx`, `web/requests.ts` | `/api/calendars` endpoints |
| vitest in `src/*.test.ts`, `vi.stubGlobal("fetch")` for HTTP stubbing, `npm test = vitest run` | `schedule-tool/src/schedule.test.ts`, `schedule-tool/package.json` | new tests (events-tool has none today) |
| README: intro + "Getting started" steps | `README.md` | add .ics mention |
| Docker deploys run `npm ci`, so `package-lock.json` must be committed with `package.json` | `chathackers-docker/Dockerfile` | lockfile updated |

## Design decision: one `Calendars` row per feed, expansion at check time

A posted `.ics` link is usually a *feed* (a team calendar, an org's public calendar) containing
multiple events, frequently recurring ones (RRULE) — that is exactly why people share ICS
instead of a single luma/eventbrite page. Two shapes were considered:

1. **One `Events` row per VEVENT** (reuse everything unchanged): breaks on recurring events —
   reminders would fire only for the first occurrence; new events added to the feed later
   wouldn't appear without re-posting.
2. **One `Calendars` row per subscription; expand occurrences at each tick** — chosen. The
   scheduler fetches each subscribed feed every 5 minutes, expands occurrences in a forward
   window, and reuses the same milestone logic. Feed updates (new/changed events) are picked
   up automatically; unsubscribing removes the feed.

No extra dedupe state is needed: `node-ical`'s expansion is deterministic, so a given
occurrence has a stable ISO start instant, and — as with single events today — each milestone
window for that instant is crossed by exactly one tick.

## Changes, file by file

### 1. `package.json` / `package-lock.json`

- Add dependency `node-ical` (v0.27.3, Apache-2.0; CJS-compatible, works with
  `module: nodenext`).
- Add devDependency `vitest` + `"test": "vitest run"` script, matching schedule-tool.
- Commit the lockfile (required by `npm ci` in the Docker build).

### 2. `src/duckdb.ts`

Add to the `tables[]` array:

```sql
CREATE TABLE Calendars (room_id VARCHAR NOT NULL, ics_url VARCHAR NOT NULL, name VARCHAR);
```

- No `past` column: subscriptions don't age out (the expansion window handles that), unlike
  single events. Column names keep the tool's `*_url`/`room_id` style.
- New accessors, mirroring the Events ones:
  - `getCalendarsAll()`
  - `getCalendarsByRoomId(roomId)`
  - `getCalendarByUrl(roomId, icsUrl)` (for duplicate check)
  - `insertCalendar(roomId, icsUrl, name)`
  - `removeCalendar(roomId, icsUrl)`

### 3. `src/ics.ts` (new)

Fetch-and-normalize module, in the spirit of `events.ts`:

```ts
import ical from "node-ical";

export type IcsOccurrence = { name: string; startDate: string; url: string };
export type IcsCalendar   = { name: string; occurrences: IcsOccurrence[] };

export function extractIcsUrl(message: string): string | undefined
export async function tryGetCalendar(url: string, windowFrom: Date, windowTo: Date): Promise<IcsCalendar | undefined>
```

- `extractIcsUrl`: regex on the **raw** message body
  `/https?:\/\/\S+\.ics(?:\?\S*)?/i`. Rationale for not using the lowercased body: the
  existing luma/eventbrite path lowercases because those hosts are case-insensitive, but
  arbitrary ICS paths are not. The gate check in `messages.ts` still uses the lowercased
  body (`.includes(".ics")`), matching the existing style.
- `tryGetCalendar`:
  1. `ical.async.fromURL(url, { signal: AbortSignal.timeout(5000) })` — native fetch follows
     redirects; 5 s timeout so a dead feed can't stall the shared tick.
  2. Any throw (non-ICS content, HTTP error, timeout) → `undefined`, same silent contract as
     `tryGetEvent`.
  3. Collect VEVENTs; for recurring ones use `ical.expandRecurringEvent(event, { from, to })`
     (handles RRULE, EXDATE, RECURRENCE-ID); non-recurring events contribute their single
     instance. Window: `[now, now + 4 weeks + 5 min]` — the largest milestone plus tolerance,
     identical to the existing threshold set.
  4. Map each instance to `{ name: summary, startDate: start.toISOString(), url }`.
     `start` is a JS Date at the exact UTC instant (node-ical attaches `.tz` for TZID values
     and handles all-day `dateOnly` events), so `toISOString()` is lossless and
     `Temporal.Instant.from()` in the scheduler keeps working unchanged.
  5. Occurrence `url`: the VEVENT's `url` property when it's an `http(s)` URL (the parser
     returns junk like `URL:F` sometimes), else the calendar URL.
  6. Calendar display name: calendar-level `X-WR-CALNAME`/`NAME` when present, else the URL
     host. Feeds with zero VEVENTs → `undefined` (rejected at subscribe time).

### 4. `src/messages.ts`

```ts
if (message.includes("http") && (message.includes("luma.") || message.includes("eventbrite."))) {
  return parseForEventUrl(roomId, message);
}
if (message.includes(".ics")) {
  return parseForIcsUrl(roomId, event.content.body);
}
```

`parseForIcsUrl(roomId, rawBody)`:
1. `extractIcsUrl(rawBody)`; no URL → return (no reply).
2. `tryGetCalendar(url, now, now + 4w + 5min)`; `undefined` → return nothing, so garbage
   `.ics` mentions don't create subscriptions or room noise (same UX as a non-event link).
3. Duplicate guard: `getCalendarByUrl(roomId, url)` already exists → return
   `{ message: "Already subscribed to that calendar" }`.
4. `insertCalendar(roomId, url, calendar.name)` and return
   `{ message: "New calendar subscribed: ${calendar.name} — ${n} upcoming event(s) found" }`,
   mirroring the existing "New upcoming event added to group:" confirmation.

### 5. `src/scheduler.ts`

- Extract the threshold block into one shared helper so both paths stay in sync:

```ts
type Milestone = { label: string; offsetSeconds: number; text: string };
const MILESTONES: Milestone[] = [
  { label: "4 weeks",  offsetSeconds: 4 * 7 * 24 * 60 * 60, text: "will take place in 4 weeks!" },
  …
];
function dueMilestones(startISO: string, now: Temporal.Instant): string[]  // returns fired texts
```

  This removes the eight copy-pasted conditionals. **Note:** the `oneWeekAway` window bug
  (upper bound using the 2-week offset) is fixed in the local working tree (uncommitted on
  `ics-subscribe`, completing `c01e4c6`'s lower-bound fix); include that fix in the same
  commit/PR as the extraction so it ships together.
- `checkEvents()` keeps its flow, but formats messages from `dueMilestones()` output.
- New `checkCalendars()`: `getCalendarsAll()` → per row, `tryGetCalendar(row.ics_url, …)` in
  try/catch (failed feed = skip this tick, log; never marked `past`, never unsubscribed) →
  per occurrence, `dueMilestones()` → `sendMessage(row.room_id, `${o.name} ${text} ${o.url}`)`.
- `beginSchedule()`: add a second `SimpleIntervalJob` (same 5 min, `runImmediately`) wrapping
  `checkCalendars()` in an `AsyncTask` with `preventOverrun: true` and an error callback.
- **Flagged (recommended, same file):** upgrade the existing events job from plain `Task` to
  `AsyncTask` + `preventOverrun` + error callback + `SIGTERM`/`SIGINT` stop, matching the
  current emails-tool/schedule-tool convention; today an exception in `checkEvents` is
  unhandled and overlapping runs are possible.

### 6. `src/index.ts`

- `toolRegistration.introduction` → "Post links to events from eventbrite or luma, or .ics
  calendar feeds, to track them in the group." (`events.json` regenerates on next start.)
- New endpoints, mirroring the event ones:
  - `GET /api/calendars?roomId=` → `getCalendarsByRoomId` rows.
  - `DELETE /api/calendar?roomId=` + `{ url }` body → `removeCalendar` (unsubscribe).
- No `POST /api/calendar` needed: subscribing happens by posting the link in chat (the same
  way events are added; `/api/event` exists for the dashboard only).

### 7. `web/requests.ts` + `web/App.tsx`

- `getCalendars(roomId)` / `deleteCalendar(roomId, url)` fetch helpers, same style as
  existing ones.
- New "Subscribed Calendars" section under "Upcoming Events": name, link, confirm-delete
  button — copy of the existing delete UX.

### 8. `README.md`

- Intro sentence gains the .ics capability; getting-started gains "Send an .ics calendar link
  to your group".

## Edge cases handled

| Case | Behaviour |
|---|---|
| Recurring VEVENT (RRULE), incl. EXDATE / RECURRENCE-ID overrides | expanded per tick via `expandRecurringEvent` |
| All-day events (`VALUE=DATE`) | node-ical keeps exact instant + `dateOnly`; reminders fire like timed events |
| TZID / floating times | parser returns exact UTC instants (`.tz` metadata); thresholds run on instants |
| Feed temporarily down / 5xx / slow | skipped for that tick; retried next tick; subscription kept |
| Message mentions ".ics" without a URL, or URL isn't a calendar | no subscription, no reply |
| Same feed posted twice | "Already subscribed" reply, no duplicate rows |
| `.ics` link without extension (e.g. `?format=ical`) | out of scope — detection is by `.ics` suffix, per request |
| Bot restart between ticks | a milestone window crossed during downtime is missed (same as existing single-event behaviour; windows are 5 min and ticks are 5 min) |
| SSRF (bot fetches internal URLs) | accepted risk, identical to the existing luma/eventbrite fetch behaviour |

## Testing (vitest, `src/ics.test.ts` + `src/scheduler.test.ts`, mirroring schedule-tool style)

1. `extractIcsUrl`: plain URL, URL with query string, trailing punctuation/whitespace, no match.
2. `tryGetCalendar` with stubbed `fetch` (vi.stubGlobal): real fixture ICS text → occurrences
   mapped to ISO starts; HTML 200 response → `undefined`; non-200 → `undefined`.
3. Recurrence: RRULE + EXDATE fixture expands to the expected instances inside the window and
   excludes EXDATEs; events outside `[now, now+4w+5min]` excluded.
4. `dueMilestones`: each milestone fires exactly once for a fixed start (windows don't overlap
   after the one-week bug fix); past start fires nothing.
5. `checkCalendars` wiring with stubbed fetch + stubbed `sendMessage`: one feed with one
   upcoming event produces exactly the expected message; a failing feed sends nothing.
6. `parseForIcsUrl` duplicate guard: second post of the same URL returns the "Already
   subscribed" response and doesn't insert again (DuckDB pointed at a temp dir via
   `DUCKDB_DATA_DIR`, which `startDuckDB` already honours).

## Verification & rollout

1. `npm test` — new suite green.
2. `npm run build` — tsc clean.
3. Manual smoke (throwaway, no repo changes): `npm run dev`, then
   `curl -X POST localhost:5057/ -d '{"event":{"type":"m.room.message","room_id":"!r:x","sender":"@u:x","content":{"body":"https://…/calendar.ics"}}}'`
   with the fixture feed URL; expect the "New calendar subscribed" response, and observe a
   reminder fire by temporarily inserting an occurrence minutes in the future (or a local
   stub feed with a shifted DTSTART). `dashboard_url` pointed at a local stub receiver to
   capture the outgoing message.
4. Commit `package.json` **and** `package-lock.json` together (Docker `npm ci`).
5. Deploy via existing `deploy.sh` (git pull, npm i, build-web, build, pm2 restart events) or
   rebuild the docker image; no tool-hub or registration-UUID changes, so no re-registration
   in rooms is needed.

## Flagged decisions for review

1. **Calendar name stored at subscribe time** (one column) rather than re-fetched on every
   dashboard load — deviates slightly from the events list, which resolves names per request,
   but avoids fetching every feed on every dashboard view.
