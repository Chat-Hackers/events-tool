import "./App.css";
import { useSearchParams } from "react-router";
import { useEffect, useState } from "react";
import { getEvents, postEvent, deleteEvent } from "./requests";

export default function App() {
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get("roomId");
  const [events, setEvents] = useState<{ event_url: string; past: boolean }[]>(
    [],
  );
  const [url, setUrl] = useState("");

  async function loadEvents(roomId: string) {
    const events = await getEvents(roomId);
    console.log(events);
    setEvents(events.map((rainbow: { rainbow: string }) => rainbow.rainbow));
  }

  async function createEvent() {
    if (roomId) {
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
      <h1>Rainbow Tool dashboard</h1>
      <input
        type="text"
        placeholder="event url"
        onChange={(e) => setUrl(e.target.value)}
      ></input>
      <button onClick={createEvent}>Add new event</button>
      <h2>Past rainbows</h2>
      {events.map((event) => (
        <>
          <p>{event.event_url}</p>
          <button onClick={() => removeEvent(url)}>Delete</button>
        </>
      ))}
    </div>
  );
}
