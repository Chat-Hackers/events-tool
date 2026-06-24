import { ToadScheduler, SimpleIntervalJob, Task } from 'toad-scheduler';
import { getEventsAll, updateEvent } from './duckdb';
import { sendMessage } from "./requests";
import { tryGetEvent } from './events';

const MINUTES = 5;

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
    ).filter((event) => event !== null);

    events.forEach(event => {
        const start = Temporal.Instant.from(event.startDate);
        const now = Temporal.Now.instant();

        if (start.epochMilliseconds < now.epochMilliseconds) {
            updateEvent(event.roomId, event.url, true)
            return;
        }

        const diffSeconds = now.until(start).total("seconds");
        const toleranceSeconds = MINUTES * 60;

        const fourWeeksAway = diffSeconds - 4 * 7 * 24 * 60 * 60 <= toleranceSeconds;
        const threeWeeksAway = diffSeconds - 3 * 7 * 24 * 60 * 60 <= toleranceSeconds;
        const twoWeeksAway = diffSeconds - 2 * 7 * 24 * 60 * 60 <= toleranceSeconds;
        const oneWeekAway = diffSeconds - 2 * 7 * 24 * 60 * 60 <= toleranceSeconds;
        const threeDaysAway = diffSeconds - 3 * 24 * 60 * 60 <= toleranceSeconds;
        const twoDaysAway = diffSeconds - 2 * 24 * 60 * 60 <= toleranceSeconds;
        const oneDayAway = diffSeconds - 24 * 60 * 60 <= toleranceSeconds;
        const oneHourAway = diffSeconds - 60 * 60 <= toleranceSeconds;
        const happeningNow = diffSeconds <= toleranceSeconds;

        if (fourWeeksAway)
            sendMessage(event.roomId, `${event.name} will take place in 4 weeks! ${event.url}`);

        if (threeWeeksAway)
            sendMessage(event.roomId, `${event.name} will take place in 3 weeks! ${event.url}`);

        if (twoWeeksAway)
            sendMessage(event.roomId, `${event.name} will take place in 2 weeks! ${event.url}`);

        if (oneWeekAway)
            sendMessage(event.roomId, `${event.name} will take place in 1 week! ${event.url}`);

        if (threeDaysAway)
            sendMessage(event.roomId, `${event.name} will take place in 3 days! ${event.url}`);

        if (twoDaysAway)
            sendMessage(event.roomId, `${event.name} will take place in 2 days! ${event.url}`);

        if (oneDayAway)
            sendMessage(event.roomId, `${event.name} will take place tomorrow! ${event.url}`);

        if (oneHourAway)
            sendMessage(event.roomId, `${event.name} is starting in one hour! ${event.url}`);

        if (happeningNow)
            sendMessage(event.roomId, `${event.name} is happening now! ${event.url}`);

    })
}

const beginSchedule = () => {
    const scheduler = new ToadScheduler();

    const task = new Task('simple task', () => {
        console.log('Checking events');

        checkEvents()
    });

    const job = new SimpleIntervalJob(
        { minutes: MINUTES, runImmediately: true },
        task,
        { id: 'upcoming_events_check' }
    );

    //create and start jobs
    scheduler.addSimpleIntervalJob(job);
}

export default beginSchedule;