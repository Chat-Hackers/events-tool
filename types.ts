export type MatrixEvent = {
    content: {
        body: string;
    },
    sender: string;
    room_id: string;
}