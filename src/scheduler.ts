import { ToadScheduler, SimpleIntervalJob, AsyncTask } from 'toad-scheduler';
import { getCalendarsAll, getEventsAll, updateEvent } from './duckdb';
import { sendMessage } from "./requests";
import { tryGetEvent } from './events';
import { tryGetCalendar } from './ics';

const MINUTES = 5;

type TrackedEvent = {
    name: string;
    startDate: string;
    roomId: string;
    url: string;
};

type Milestone = {
    label: string;
    offsetSeconds: number;
    text: (name: string) => string;
};

const MILESTONES: Milestone[] = [
    { label: "4 weeks", offsetSeconds: 4 * 7 * 24 * 60 * 60, text: (name) => `${name} will take place in 4 weeks!` },
    { label: "3 weeks", offsetSeconds: 3 * 7 * 24 * 60 * 60, text: (name) => `${name} will take place in 3 weeks!` },
    { label: "2 weeks", offsetSeconds: 2 * 7 * 24 * 60 * 60, text: (name) => `${name} will take place in 2 weeks!` },
    { label: "1 week", offsetSeconds: 1 * 7 * 24 * 60 * 60, text: (name) => `${name} will take place in 1 week!` },
    { label: "3 days", offsetSeconds: 3 * 24 * 60 * 60, text: (name) => `${name} will take place in 3 days!` },
    { label: "2 days", offsetSeconds: 2 * 24 * 60 * 60, text: (name) => `${name} will take place in 2 days!` },
    { label: "1 day", offsetSeconds: 24 * 60 * 60, text: (name) => `${name} will take place tomorrow!` },
    { label: "1 hour", offsetSeconds: 60 * 60, text: (name) => `${name} is starting in one hour!` },
    { label: "now", offsetSeconds: 0, text: (name) => `${name} is happening now!` },
];

async function sendReminders(event: TrackedEvent) {
    const now = Temporal.Now.instant();
    const start = Temporal.Instant.from(event.startDate);

    if (start.epochMilliseconds < now.epochMilliseconds) {
        updateEvent(event.roomId, event.url, true)
        return;
    }
    for (const milestone of MILESTONES) {
        const diffSeconds = now.until(start).total("seconds");
        const toleranceSeconds = MINUTES * 60;

        if (diffSeconds - milestone.offsetSeconds >= 0 && diffSeconds - milestone.offsetSeconds <= toleranceSeconds) {
            sendMessage(event.roomId, `${milestone.text(event.name)} ${event.url}`);
        }
    }
}

async function checkEvents() {
    const eventUrls = await getEventsAll();
    const upcomingEventUrls = eventUrls.filter(event => !event.past);

    const events = (
        await Promise.all(
            upcomingEventUrls.map(async (event) => {
                const eventDetails = await tryGetEvent(event.event_url as string);
                if (!eventDetails) return null;
                return {
                    name: eventDetails.name,
                    startDate: eventDetails.startDate,
                    roomId: event.room_id as string,
                    url: event.event_url as string
                };
            })
        )
    ).filter((event): event is TrackedEvent => event !== null);

    for (const event of events) {
        await sendReminders(event);
    }
}

export async function checkCalendars() {
    const calendars = await getCalendarsAll();

    const windowFrom = new Date();
    const windowTo = new Date(Date.now() + 4 * 7 * 24 * 60 * 60 * 1000 + MINUTES * 60 * 1000);

    for (const calendar of calendars) {
        try {
            const feed = await tryGetCalendar(calendar.ics_url as string, windowFrom, windowTo);
            if (!feed) continue;

            for (const occurrence of feed.occurrences) {
                await sendReminders({
                    name: occurrence.name,
                    startDate: occurrence.startDate,
                    roomId: calendar.room_id as string,
                    url: occurrence.url
                });
            }
        } catch (err) {
            console.error(`Failed to check calendar feed ${calendar.ics_url}:`, err);
        }
    }
}

const beginSchedule = () => {
    const scheduler = new ToadScheduler();

    const eventsTask = new AsyncTask(
        'check-upcoming-events',
        async () => {
            console.log('Checking events');
            await checkEvents();
        },
        (err) => {
            console.error('Upcoming events job failed:', err);
        }
    );

    const eventsJob = new SimpleIntervalJob(
        { minutes: MINUTES, runImmediately: true },
        eventsTask,
        { id: 'upcoming_events_check', preventOverrun: true }
    );

    const calendarsTask = new AsyncTask(
        'check-calendar-feeds',
        async () => {
            console.log('Checking calendar feeds');
            await checkCalendars();
        },
        (err) => {
            console.error('Calendar feeds job failed:', err);
        }
    );

    const calendarsJob = new SimpleIntervalJob(
        { minutes: MINUTES, runImmediately: true },
        calendarsTask,
        { id: 'upcoming_calendar_checks', preventOverrun: true }
    );

    //create and start jobs
    scheduler.addSimpleIntervalJob(eventsJob);
    scheduler.addSimpleIntervalJob(calendarsJob);

    process.on('SIGTERM', () => scheduler.stop());
    process.on('SIGINT', () => scheduler.stop());
}

export default beginSchedule;
