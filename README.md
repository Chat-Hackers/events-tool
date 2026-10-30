# Events Reminder

Events Reminder tool for Chathackers Matrix chat integration tools.

This tool creates event reminders within a group chat. It collect urls from luma and eventbrite posted in the chat and sends reminders when those events are closeby. It also subscribes to `.ics` calendar feeds posted in the chat, checking them for upcoming events on the same reminder schedule.

## Getting started

1. Clone the repo
1. Run the command `npm install`
1. Run the command `npm run dev`
1. Copy the `events.json` file and paste into the `registrations` folder of [the wrapper project](https://github.com/chat-hackers/tool-hub)
1. Send an event url to your whatsapp group
1. Send an `.ics` calendar link to your group to subscribe to that calendar
1. Marvel in delight at your newfound power
