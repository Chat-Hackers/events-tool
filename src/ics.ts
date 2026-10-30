import ical, { type CalendarComponent, type CalendarResponse, type VEvent } from "node-ical";

const FETCH_TIMEOUT_MS = 5000;

export type IcsOccurrence = {
    name: string;
    startDate: string;
    url: string;
};

export type IcsCalendar = {
    name: string;
    occurrences: IcsOccurrence[];
};

export function extractIcsUrl(message: string): string | undefined {
    // match against the raw (non-lowercased) body: ics paths are case-sensitive
    const match = message.match(/https?:\/\/[^\s]+\.ics(?:\?[^\s]*)?/i);
    return match?.[0];
}

function summarise(value: VEvent["summary"]): string {
    if (typeof value === "string") return value;
    return String(value?.val ?? "");
}

function occurrenceUrl(eventUrl: string | undefined, calendarUrl: string): string {
    if (eventUrl && /^https?:\/\//i.test(eventUrl)) return eventUrl;
    return calendarUrl;
}

export async function tryGetCalendar(icsUrl: string, windowFrom: Date, windowTo: Date): Promise<IcsCalendar | undefined> {
    let parsed: CalendarResponse;

    try {
        parsed = await ical.async.fromURL(icsUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }) as unknown as CalendarResponse;
    } catch {
        return;
    }

    const events = Object.values(parsed).filter((component): component is VEvent => {
        return component?.type === "VEVENT";
    });

    const occurrences: IcsOccurrence[] = [];

    for (const event of events) {
        const instances = event.rrule
            ? ical.expandRecurringEvent(event, { from: windowFrom, to: windowTo })
            : [{ start: event.start, summary: event.summary, event }];

        for (const instance of instances) {
            if (!instance.start) continue;
            const startDate = instance.start.toISOString();
            if (startDate < windowFrom.toISOString() || startDate > windowTo.toISOString()) continue;

            occurrences.push({
                name: summarise(instance.summary ?? event.summary),
                startDate,
                url: occurrenceUrl(instance.event.url, icsUrl),
            });
        }
    }

    if (occurrences.length === 0) {
        return;
    }

    const calendarName = parsed.vcalendar?.["WR-CALNAME"];
    const name = calendarName || new URL(icsUrl).host;

    return {
        name,
        occurrences: occurrences.sort((a, b) => a.startDate.localeCompare(b.startDate)),
    };
}
