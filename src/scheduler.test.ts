import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./duckdb", () => ({
    getEventsAll: vi.fn(async () => []),
    getCalendarsAll: vi.fn(async () => [{ room_id: "!room", ics_url: "https://example.org/feed.ics" }]),
    updateEvent: vi.fn(),
}));

vi.mock("./requests", () => ({
    sendMessage: vi.fn(async () => { throw new Error("hub unavailable"); }),
}));

vi.mock("./events", () => ({
    tryGetEvent: vi.fn(async () => undefined),
}));

import { checkCalendars } from "./scheduler";
import { sendMessage } from "./requests";
import { tryGetCalendar } from "./ics";
import type { IcsCalendar } from "./ics";

vi.mock("./ics", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./ics")>();
    return { ...actual, tryGetCalendar: vi.fn(async () => undefined) };
});

const stubCalendar = (feed: IcsCalendar | undefined) => {
    vi.mocked(tryGetCalendar).mockImplementation(async () => feed);
};

// MILESTONES at minutes=5: each window [offset, offset+300s] is hit by exactly one tick.
const NOW = Temporal.Instant.from("2099-01-01T12:00:00Z");
const FIVE_MIN = 5 * 60;

function instantAfter(seconds: number) {
    return NOW.add({ seconds }).toString();
}

describe("calendar milestone reminders", () => {
    let nowSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        // scheduler reads native Temporal.Now.instant(); pin it to the test instant
        nowSpy = vi.spyOn(Temporal.Now, "instant").mockReturnValue(NOW);
    });

    afterEach(() => {
        nowSpy.mockRestore();
        vi.restoreAllMocks();
    });

    test("sends exactly one reminder per milestone window", async () => {
        const cases = [
            { seconds: 4 * 7 * 24 * 60 * 60, expected: "will take place in 4 weeks!" },
            { seconds: 3 * 7 * 24 * 60 * 60, expected: "will take place in 3 weeks!" },
            { seconds: 2 * 7 * 24 * 60 * 60, expected: "will take place in 2 weeks!" },
            { seconds: 1 * 7 * 24 * 60 * 60, expected: "will take place in 1 week!" },
            { seconds: 3 * 24 * 60 * 60, expected: "will take place in 3 days!" },
            { seconds: 2 * 24 * 60 * 60, expected: "will take place in 2 days!" },
            { seconds: 24 * 60 * 60, expected: "will take place tomorrow!" },
            { seconds: 60 * 60, expected: "is starting in one hour!" },
            { seconds: 0, expected: "is happening now!" },
        ];

        for (const { seconds, expected } of cases) {
            vi.mocked(sendMessage).mockClear();
            stubCalendar({
                name: "Test Calendar",
                occurrences: [{ name: "Big Event", startDate: instantAfter(seconds), url: "https://example.org/x.ics" }],
            });

            await checkCalendars();

            expect(vi.mocked(sendMessage)).toHaveBeenCalledTimes(1);
            expect(vi.mocked(sendMessage).mock.calls[0][0]).toBe("!room");
            expect(vi.mocked(sendMessage).mock.calls[0][1]).toBe(`Big Event ${expected} https://example.org/x.ics`);
        }
    });

    test("sends nothing between milestone windows and after the event starts", async () => {
        for (const seconds of [FIVE_MIN + 1, 24 * 60 * 60 + FIVE_MIN * 2, -60]) {
            vi.mocked(sendMessage).mockClear();
            stubCalendar({
                name: "Test Calendar",
                occurrences: [{ name: "Big Event", startDate: instantAfter(seconds), url: "https://example.org/x.ics" }],
            });

            await checkCalendars();

            expect(vi.mocked(sendMessage)).not.toHaveBeenCalled();
        }
    });

    test("one-week and two-week windows no longer overlap", async () => {
        // before the fix, oneWeekAway's upper bound used the 2-week offset, so its window
        // spanned [1w, 2w+5min] and an event 2w+100s away fired BOTH the 1-week and
        // 2-week reminders; now only the 2-week one fires.
        const start = instantAfter(2 * 7 * 24 * 60 * 60 + 100);
        stubCalendar({
            name: "Test Calendar",
            occurrences: [{ name: "Big Event", startDate: start, url: "https://example.org/x.ics" }],
        });

        await checkCalendars();

        expect(vi.mocked(sendMessage)).toHaveBeenCalledTimes(1);
        expect(vi.mocked(sendMessage).mock.calls[0][1]).toContain("in 2 weeks!");
    });

    test("multiple occurrences from one feed each get their own reminder", async () => {
        stubCalendar({
            name: "Test Calendar",
            occurrences: [
                { name: "Event A", startDate: instantAfter(0), url: "https://example.org/a" },
                { name: "Event B", startDate: instantAfter(60 * 60), url: "https://example.org/b" },
            ],
        });

        await checkCalendars();

        expect(vi.mocked(sendMessage)).toHaveBeenCalledTimes(2);
        expect(vi.mocked(sendMessage).mock.calls.map(call => call[1]).join(" ")).toContain("Event A");
        expect(vi.mocked(sendMessage).mock.calls.map(call => call[1]).join(" ")).toContain("Event B");
    });

    test("failing feed is skipped without throwing or unsubscribing", async () => {
        vi.mocked(tryGetCalendar).mockRejectedValue(new Error("feed down"));

        await expect(checkCalendars()).resolves.toBeUndefined();
        expect(sendMessage).not.toHaveBeenCalled();
    });
});
