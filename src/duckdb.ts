import { DuckDBConnection, DuckDBInstance } from "@duckdb/node-api";

let connection: DuckDBConnection;

export async function startDuckDB() {
    const eventsDuckDBFileName = "events_duckdb.db";

    const instance = await DuckDBInstance.create(eventsDuckDBFileName);
    connection = await instance.connect();

    const tables = [
        {
            name: "Events",
            creationCommand:
                "CREATE TABLE Events (room_id VARCHAR, event_url VARCHAR, past BOOLEAN);",
        }
    ]

    const existingTablesRows = await connection.run("SHOW TABLES;");
    const existingTables = await existingTablesRows.getRowObjects();

    tables.forEach(async (table) => {
        const tableExists = existingTables.filter((existingTable) => existingTable.name === table.name).length > 0;

        if (tableExists) {
            console.log(`${table.name} already exists`);
        } else {
            await connection.run(table.creationCommand);
            console.log(`${table.name} created`);
        }
    });
}

export async function getEventsAll() {
    const getEvents = `SELECT * FROM Events;`;
    const prepared = await connection.prepare(getEvents);
    const eventsRows = await prepared.run();
    const events = await eventsRows.getRowObjects();
    return events;
}

export async function getEventsByRoomId(roomId: string) {
    const getEvents = `SELECT * FROM Events WHERE room_id = $1;`;
    const prepared = await connection.prepare(getEvents);
    prepared.bindVarchar(1, roomId);
    const eventsRows = await prepared.run();
    const events = await eventsRows.getRowObjects();
    return events;
}

export async function insertEvent(roomId: string, url: string) {
    const insertEvent = `INSERT INTO Events values ($1, $2, $3);`;
    const prepared = await connection.prepare(insertEvent);
    prepared.bindVarchar(1, roomId);
    prepared.bindVarchar(2, url);
    prepared.bindBoolean(3, false);
    await prepared.run();
    return;
}

export async function removeEvent(roomId: string, url: string) {
    const deleteEvent = `DELETE FROM Events WHERE room_id=$1 AND event_url=$2;`;
    const prepared = await connection.prepare(deleteEvent);
    prepared.bindVarchar(1, roomId);
    prepared.bindVarchar(2, url);
    await prepared.run();
    return;
}

startDuckDB();