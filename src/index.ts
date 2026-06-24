import 'dotenv/config';
import express from "express";
import * as fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import handleMessage from "./messages";
import { sendMessage } from './requests';
import { } from './duckdb';
import beginSchedule from "./scheduler";

const { secret } = process.env;

const port = 5056;

const moduleRegistration = {
  id: "events",
  uuid: uuidv4(),
  url: `http://localhost:${port}`,
  emoji: "🗓️",
  wake_word: "events",
  title: "Events Reminder",
  description: "Sends reminders of upcoming events to the group",
  secret,
  event_types: [
    "m.room.message"
  ]
}

function generateRegistrationFile() {
  fs.writeFileSync(`./${moduleRegistration.id}.json`, JSON.stringify(moduleRegistration));
}

async function start() {

  const app = express();
  app.use(express.json());

  app.get("/", async (req, res) => {
    const htmlPath = path.resolve(__dirname, "../../web/dist/index.html")

    res.sendFile(htmlPath);
  })

  app.post("/", async (req, res) => {
    const { event } = req.body;

    let response: { message?: string } | undefined = {};

    if (event.type === "m.room.message")
      response = await handleMessage(event);

    console.log(response)

    res.send({ success: true, response });
  });

  app.get("/api/events", async (req, res) => {
    const { roomId } = req.query;

    res.send();
  })

  app.post("/api/event", async (req, res) => {
    const { roomId } = req.query;
    const { url } = req.body;

    res.send({ success: true })
  })

  app.delete("api/event", async (req, res) => {
    const { roomId } = req.query;
    const { url } = req.body;

    res.send({ success: true })
  })

  app.listen(port);
};

generateRegistrationFile();
start();
setTimeout(beginSchedule, 2000)
