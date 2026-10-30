import { MatrixEvent } from "../types";
import { getCalendarByUrl, insertCalendar, insertEvent } from "./duckdb";
import { tryGetEvent } from "./events";
import { extractIcsUrl, tryGetCalendar } from "./ics";

const parseForEventUrl = async (roomId: string, message: string) => {
  const event = await tryGetEvent(message);
  console.log(event)

  if (event) {
    // store in database with roomid
    insertEvent(roomId, message);
    return {
      message: `New upcoming event added to group: ${event.name}`
    }
  }
};

const parseForIcsUrl = async (roomId: string, rawBody: string) => {
  const icsUrl = extractIcsUrl(rawBody);
  if (!icsUrl) return;

  const existing = await getCalendarByUrl(roomId, icsUrl);
  if (existing) {
    return {
      message: "Already subscribed to that calendar"
    }
  }

  const windowFrom = new Date();
  const windowTo = new Date(Date.now() + 4 * 7 * 24 * 60 * 60 * 1000 + 5 * 60 * 1000);
  const calendar = await tryGetCalendar(icsUrl, windowFrom, windowTo);
  console.log(calendar)

  if (calendar) {
    insertCalendar(roomId, icsUrl, calendar.name);
    return {
      message: `New calendar subscribed: ${calendar.name} — ${calendar.occurrences.length} upcoming event(s) found`
    }
  }
};

const handleMessage = async (event: MatrixEvent) => {
  const message = event.content.body.toLowerCase();
  const roomId = event.room_id;

  if (message.includes("http") && (message.includes("luma.") || message.includes("eventbrite."))) {
    return parseForEventUrl(roomId, message);
  }

  if (message.includes(".ics")) {
    return parseForIcsUrl(roomId, event.content.body);
  }
};

export default handleMessage;
