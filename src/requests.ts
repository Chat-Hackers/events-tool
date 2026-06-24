const { secret, wrapper_url } = process.env;

export async function sendMessage(roomId: string, message: string) {
    return fetch(`${wrapper_url}/api/send?roomId=${roomId}&toolId=events&secret=${secret}`, {
        method: "POST",
        body: JSON.stringify({
            message
        }),
        headers: {
            "Content-type": "application/json"
        }
    })
}