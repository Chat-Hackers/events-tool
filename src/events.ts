import { getEvent } from "./requests";
import { parse } from "node-html-parser";

export async function tryGetEvent(url: string) {
    let potentialEventResponse: Awaited<ReturnType<typeof getEvent>>;

    try {
        potentialEventResponse = await getEvent(url);
    } catch {
        return;
    }

    if (potentialEventResponse.status === 404) {
        return;
    }

    const potentialEventPage = await potentialEventResponse.text();
    const doc = parse(potentialEventPage);
    const scriptTags = doc.querySelectorAll('script[type="application/ld+json"]');

    if (scriptTags.length === 0) {
        return;
    }

    const event = scriptTags.reduce<{ [key: string]: string }>((acc, tag) => {
        try {
            const parsed = JSON.parse(tag.text);
            return { ...acc, ...parsed };
        } catch {
            return acc;
        }
    }, {});

    return event;
}