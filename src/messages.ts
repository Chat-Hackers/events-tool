import { } from "./duckdb";

const parseForEventUrl = async (roomId, message) => {
  console.log(roomId, message)

  return {
    message: `New event added to group calendar`
  };
};

const handleMessage = async (event) => {
  const message = event.content.body.toLowerCase();
  const roomId = event.room_id;

  if (message.includes("luma") || message.includes("eventbrite")) {
    return parseForEventUrl(roomId, message);
  }
};

export default handleMessage;
