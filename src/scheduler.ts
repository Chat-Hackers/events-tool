import { ToadScheduler, SimpleIntervalJob, Task } from 'toad-scheduler';
import { } from './duckdb';
import { sendMessage } from "./requests";

async function checkEvents() {

}

const beginSchedule = () => {
    const scheduler = new ToadScheduler();

    const task = new Task('simple task', () => {
        console.log('Checking events');

        checkEvents()
    });

    const job = new SimpleIntervalJob(
        { minutes: 5, runImmediately: true },
        task,
        { id: 'upcoming_events_check' }
    );

    //create and start jobs
    scheduler.addSimpleIntervalJob(job);
}

export default beginSchedule;