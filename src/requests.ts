const { events_secret, dashboard_url } = process.env;

const baseUrl = dashboard_url?.includes("localhost") ? `http://${dashboard_url}` : `https://${dashboard_url}`;

export async function sendMessage(roomId: string, message: string) {
    return fetch(`${baseUrl}/api/send?roomId=${roomId}&toolId=events&secret=${events_secret}`, {
        method: "POST",
        body: JSON.stringify({
            message
        }),
        headers: {
            "Content-type": "application/json"
        }
    })
}

export async function getEvent(url: string) {
    return fetch(url);
}