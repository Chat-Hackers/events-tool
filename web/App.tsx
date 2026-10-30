import "./App.css";
import { useSearchParams } from "react-router";
import { useEffect, useState } from "react";
import { getCalendars, getEvents, postEvent, deleteEvent, deleteCalendar } from "./requests";

export default function App() {
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get("roomId");
  const [events, setEvents] = useState<
    { name: string; startDate: string; url: string }[]
  >([]);
  const [calendars, setCalendars] = useState<
    { room_id: string; ics_url: string; name: string | null }[]
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

  async function loadCalendars(roomId: string) {
    const calendars = await getCalendars(roomId);
    console.log(calendars);
    setCalendars(calendars);
  }

  async function removeCalendar(url: string) {
    if (roomId) {
      await deleteCalendar(roomId, url);
      loadCalendars(roomId);
    }
  }

  useEffect(() => {
    if (roomId) {
      loadEvents(roomId);
      loadCalendars(roomId);
    }
  }, []);

  return (
    <>
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
      <h2>Subscribed Calendars</h2>
      {calendars.map((calendar) => (
        <>
          <h3>{calendar.name ?? calendar.ics_url}</h3>
          <a href={calendar.ics_url}>
            <p>Calendar feed</p>
          </a>
          {deleting === calendar.ics_url ? (
            <>
              <button onClick={() => setDeleting("")}>cancel</button>
              <button onClick={() => removeCalendar(calendar.ics_url)}>
                confirm delete
              </button>
            </>
          ) : (
            <button onClick={() => setDeleting(calendar.ics_url)}>delete</button>
          )}
        </>
      ))}
    </>
  );
}
