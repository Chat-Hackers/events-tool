import { MatrixEvent } from "../types";
import { insertEvent } from "./duckdb";
import { tryGetEvent } from "./events";

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

const handleMessage = async (event: MatrixEvent) => {
  const message = event.content.body.toLowerCase();
  const roomId = event.room_id;

  if (message.includes("http") && (message.includes("luma.") || message.includes("eventbrite."))) {
    return parseForEventUrl(roomId, message);
  }
};

export default handleMessage;
