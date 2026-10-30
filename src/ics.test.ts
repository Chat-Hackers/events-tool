import { describe, test, expect, vi, afterEach } from "vitest";
import ical from "node-ical";
import { extractIcsUrl, tryGetCalendar } from "./ics";

const FUTURE = new Date("2099-01-01T00:00:00Z");
const FUTURE_PLUS = new Date("2099-03-01T00:00:00Z");

const ONE_EVENT_ICS = `BEGIN:VCALENDAR
VERSION:2.0
X-WR-CALNAME:Test Team Days
BEGIN:VEVENT
UID:b@x
DTSTAMP:20260101T000000Z
DTSTART;VALUE=DATE:20990115
SUMMARY:Planning day
URL:https://example.org/planning
END:VEVENT
END:VCALENDAR`;

const RECURRING_ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:c@x
DTSTAMP:20260101T000000Z
DTSTART;TZID=Europe/London:20990105T180000
DURATION:PT1H
RRULE:FREQ=WEEKLY;COUNT=6;BYDAY=MO
EXDATE;TZID=Europe/London:20990112T180000
SUMMARY:Weekly standup
END:VEVENT
END:VCALENDAR`;

// node-ical binds its fetch at module load, so stub at the parse boundary instead of
// stubbing global fetch (same approach the library's own API allows via fetchImpl).
function stubIcsBody(body: string) {
    return vi.spyOn(ical.async, "fromURL").mockImplementation(async () => await ical.async.parseICS(body));
}

describe("extractIcsUrl", () => {
    test("extracts plain url, url with query string, keeps case, ignores other text", () => {
        expect(extractIcsUrl("subscribe https://Example.org/Team/Calendar.ICS please")).toBe("https://Example.org/Team/Calendar.ICS");
        expect(extractIcsUrl("https://example.org/cal.ics?format=ical")).toBe("https://example.org/cal.ics?format=ical");
        expect(extractIcsUrl("check https://example.org/feed.ics, it's great")).toBe("https://example.org/feed.ics");
        expect(extractIcsUrl("no calendar here")).toBeUndefined();
        expect(extractIcsUrl("https://example.org/calendar.html")).toBeUndefined();
    });
});

describe("tryGetCalendar", () => {
    afterEach(() => vi.restoreAllMocks());

    test("maps VEVENTs to occurrences with ISO starts and event url", async () => {
        stubIcsBody(ONE_EVENT_ICS);
        const calendar = await tryGetCalendar("https://example.org/team.ics", FUTURE, FUTURE_PLUS);

        expect(calendar?.name).toBe("Test Team Days");
        expect(calendar?.occurrences).toEqual([
            { name: "Planning day", startDate: "2099-01-15T00:00:00.000Z", url: "https://example.org/planning" },
        ]);
    });

    test("falls back to url host for calendar name and calendar url for occurrence url", async () => {
        stubIcsBody(ONE_EVENT_ICS.replace("X-WR-CALNAME:Test Team Days\n", "").replace("URL:https://example.org/planning\n", ""));
        const calendar = await tryGetCalendar("https://example.org/team.ics", FUTURE, FUTURE_PLUS);

        expect(calendar?.name).toBe("example.org");
        expect(calendar?.occurrences[0].url).toBe("https://example.org/team.ics");
    });

    test("expands RRULE inside the window and excludes EXDATEs", async () => {
        stubIcsBody(RECURRING_ICS);
        const calendar = await tryGetCalendar("https://example.org/standup.ics", FUTURE, FUTURE_PLUS);

        expect(calendar?.occurrences.map(o => o.startDate)).toEqual([
            "2099-01-05T18:00:00.000Z",
            "2099-01-19T18:00:00.000Z",
            "2099-01-26T18:00:00.000Z",
            "2099-02-02T18:00:00.000Z",
            "2099-02-09T18:00:00.000Z",
        ]);
    });

    test("excludes occurrences outside the requested window", async () => {
        stubIcsBody(RECURRING_ICS);
        const narrowFrom = new Date("2099-01-01T00:00:00Z");
        const narrowTo = new Date("2099-01-31T00:00:00Z");
        const calendar = await tryGetCalendar("https://example.org/standup.ics", narrowFrom, narrowTo);

        expect(calendar?.occurrences.map(o => o.startDate)).toEqual([
            "2099-01-05T18:00:00.000Z",
            "2099-01-19T18:00:00.000Z",
            "2099-01-26T18:00:00.000Z",
        ]);
    });

    test("returns undefined for non-calendar content", async () => {
        stubIcsBody("<html><body>not a calendar</body></html>");
        expect(await tryGetCalendar("https://example.org/team.ics", FUTURE, FUTURE_PLUS)).toBeUndefined();
    });
});
