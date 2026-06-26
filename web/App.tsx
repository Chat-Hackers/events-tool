import "./App.css";
import { useSearchParams } from "react-router";
import { useEffect, useState } from "react";
import { getEvents, postEvent, deleteEvent } from "./requests";

export default function App() {
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get("roomId");
  const [events, setEvents] = useState<
    { name: string; startDate: string; url: string }[]
  >([]);
  const [url, setUrl] = useState("");
  const [deleting, setDeleting] = useState("");

  async function loadEvents(roomId: string) {
    const events = await getEvents(roomId);
    console.log(events);
    setEvents(events);
  }

  async function createEvent() {
    if (roomId && url) {
      await postEvent(roomId, url);
      loadEvents(roomId);
    }
  }

  async function removeEvent(url: string) {
    if (roomId) {
      await deleteEvent(roomId, url);
      loadEvents(roomId);
    }
  }

  useEffect(() => {
    if (roomId) {
      loadEvents(roomId);
    }
  }, []);

  return (
    <div>
      <h1>Event Reminders</h1>
      <input
        type="text"
        placeholder="event url"
        onChange={(e) => setUrl(e.target.value)}
      ></input>
      <button onClick={createEvent}>Add new event</button>
      <h2>Upcoming Events</h2>
      {events.map((event) => (
        <>
          <h3>{event.name}</h3>
          <a href={event.url}>
            <p>Event details</p>
          </a>
          <p>Starting at {new Date(event.startDate).toLocaleString("en-gb")}</p>
          {deleting === event.url ? (
            <>
              <button onClick={() => setDeleting("")}>cancel</button>
              <button onClick={() => removeEvent(event.url)}>
                confirm delete
              </button>
            </>
          ) : (
            <button onClick={() => setDeleting(event.url)}>delete</button>
          )}
        </>
      ))}
    </div>
  );
}
