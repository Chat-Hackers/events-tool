const { origin, pathname } = window.location;
const BASE_URL = `${origin}${pathname}`;

export async function getEvents(roomId: string) {
    const eventsResponse = await fetch(`${BASE_URL}/api/events?roomId=${roomId}`);
    const eventsResult = await eventsResponse.json();

    return eventsResult;
}

export async function postEvent(roomId: string, url: string) {
    const eventsResponse = await fetch(`${BASE_URL}/api/event?roomId=${roomId}`, {
        method: "POST",
        body: JSON.stringify({ url }),
        headers: {
            "Content-Type": "application/json"
        }
    });
    const eventsResult = await eventsResponse.json();

    return eventsResult;
}

export async function deleteEvent(roomId: string, url: string) {
    const eventsResponse = await fetch(`${BASE_URL}/api/event?roomId=${roomId}`, {
        method: "DELETE",
        body: JSON.stringify({ url }),
        headers: {
            "Content-Type": "application/json"
        }
    });
    const eventsResult = await eventsResponse.json();

    return eventsResult;
}