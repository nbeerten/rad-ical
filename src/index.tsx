import { Hono } from "hono/tiny";
import type { Context } from "hono";
import { convert, revert } from "./ical2json";
import type { JSONCalendar } from "./types";
import { buildings, colors } from "./constants";
import { afkortingen, eventTypes } from "./abbreviations";
import { ConfirmPrompt, ActionResult } from "./views";

type Bindings = {
    cancelledevents: KVNamespace;
};

type Variables = {
    eventId: string;
    user: string;
    rawTitle: string | undefined;
    titleText: string;
    cancelled: string[];
    isCancelled: boolean;
};

type AppContext = { Bindings: Bindings; Variables: Variables };

const app = new Hono<AppContext>();

const baseURL = new URL("https://persoonlijkrooster.ru.nl/ical");

type EventColors = Record<"WG" | "HC" | "TT" | "WC" | "PR", string>;

app.use("/c/:eventId", async (c, next) => {
    const eventId = c.req.param("eventId");
    const user = c.req.query("u");
    const rawTitle = c.req.query("title");

    if (!eventId || !user) {
        return c.text("Missing the 'id' or 'u' parameters", 400);
    }

    const titleText = rawTitle ? rawTitle.replace(/\\/g, "") : "this event";

    const cancelled =
        (await c.env.cancelledevents.get<string[]>(user, "json")) || [];
    const isCancelled = cancelled.includes(eventId);

    c.set("eventId", eventId);
    c.set("user", user);
    c.set("rawTitle", rawTitle);
    c.set("titleText", titleText);
    c.set("cancelled", cancelled);
    c.set("isCancelled", isCancelled);

    await next();
});

app.get("/c/:eventId", async (c) => {
    const { isCancelled, rawTitle, titleText } = c.var;

    return c.html(
        <ConfirmPrompt
            isCancelled={isCancelled}
            rawTitle={rawTitle}
            titleText={titleText}
        />,
    );
});

app.post("/c/:eventId", async (c) => {
    const { eventId, user, cancelled, isCancelled, rawTitle, titleText } =
        c.var;

    const formData = await c.req.parseBody();
    const action = formData["action"] || (isCancelled ? "restore" : "cancel");

    let actionTaken = "";

    if (action === "cancel" && !isCancelled) {
        cancelled.push(eventId);
        await c.env.cancelledevents.put(user, JSON.stringify(cancelled));
        actionTaken = "cancelled";
    } else if (action === "restore" && isCancelled) {
        const newCancelled = cancelled.filter((id) => id !== eventId);
        await c.env.cancelledevents.put(user, JSON.stringify(newCancelled));
        actionTaken = "restored";
    } else {
        actionTaken = isCancelled ? "cancelled" : "restored";
    }

    return c.html(
        <ActionResult
            actionTaken={actionTaken}
            rawTitle={rawTitle}
            titleText={titleText}
        />,
    );
});

app.on("GET", ["/", "/json", "/text", "/ical"], async (c) => {
    const path = c.req.path;

    let expects: "text/calendar" | "application/json" | "text/plain" =
        "text/calendar";
    if (path === "/") expects = "text/calendar";
    else if (path === "/json") expects = "application/json";
    else if (path === "/text") expects = "text/plain";
    else if (path === "/ical") expects = "text/calendar";

    const euQuery = c.req.query("eu");
    const hQuery = c.req.query("h");

    if (!euQuery || !hQuery) {
        return c.text("Missing the 'eu' and/or 'h' query parameters", 400);
    }

    const eventColors = {
        WG: "darkorange",
        HC: "red",
        TT: "purple",
        WC: "yellow",
        PR: "yellow",
    } satisfies EventColors;

    const hccolor = c.req.query("hccolor");
    const wgcolor = c.req.query("wgcolor");
    const ttcolor = c.req.query("ttcolor");
    const wccolor = c.req.query("wccolor");
    const prcolor = c.req.query("prcolor");

    if (hccolor || wgcolor || ttcolor || wccolor || prcolor) {
        const searchParamColors = [hccolor, wgcolor, ttcolor, wccolor, prcolor];

        for (const color of searchParamColors) {
            if (color && !colors.includes(color)) {
                return c.text(
                    "One or more color(s) specified in the xxcolor query parameter is/are invalid. Must be one of the CSS Named Colors.",
                    400,
                );
            }
        }

        eventColors.HC = hccolor ?? eventColors.HC;
        eventColors.WG = wgcolor ?? eventColors.WG;
        eventColors.TT = ttcolor ?? eventColors.TT;
        eventColors.WC = wccolor ?? eventColors.WC;
        eventColors.PR = prcolor ?? eventColors.PR;
    }

    const timetableUrl = new URL(baseURL);
    timetableUrl.searchParams.set("eu", euQuery);
    timetableUrl.searchParams.set("h", hQuery);

    const ics = await fetch(timetableUrl);
    const icsText = await ics.text();
    const jsonCal = convert(icsText) as JSONCalendar;

    const cancelledIds =
        (await c.env.cancelledevents.get<string[]>(euQuery, "json")) || [];

    const requestOrigin = new URL(c.req.url).origin;

    const transformedCal = await transformCalendar(
        jsonCal,
        eventColors,
        cancelledIds,
        euQuery,
        requestOrigin,
    );

    const headers = new Headers(ics.headers);

    if (expects === "application/json") {
        headers.set("Content-Type", "application/json");
        return new Response(JSON.stringify(transformedCal, null, 2), {
            headers,
        });
    }

    const reverted = revert(transformedCal);

    if (expects === "text/calendar" || expects === "text/plain") {
        if (expects === "text/plain") headers.set("Content-Type", "text/plain");
        return new Response(reverted, { headers });
    }

    return new Response(null, { status: 500 });
});

export async function transformCalendar(
    calendar: JSONCalendar,
    eventColors: EventColors,
    keyList: string[],
    userToken: string,
    requestOrigin: string,
) {
    const clone = structuredClone(calendar);

    const calName = clone.VCALENDAR[0]["X-WR-CALNAME"];
    const sNumber = calName.split(" ").at(-1);

    clone.VCALENDAR[0]["X-WR-CALNAME"] = sNumber
        ? `RU Rooster van ${sNumber}`
        : calName;
    clone.VCALENDAR[0]["X-WR-CALDESC"] =
        `${clone.VCALENDAR[0]["X-WR-CALDESC"]} | Getransformeerd met rad-ical.nilsbeerten.nl`;
    clone.VCALENDAR[0]["REFRESH-INTERVAL"] = "VALUE=DURATION:PT5M";

    const events = clone.VCALENDAR[0].VEVENT;

    for (const event of events) {
        const longEventType = event.DESCRIPTION.split("\\n")[0]
            .replace("Type: ", "")
            .trim();
        const eventType =
            eventTypes[longEventType as keyof typeof eventTypes] ??
            longEventType;
        const courseName = event.SUMMARY.split(" - ")
            .slice(1)
            .join(" - ")
            .replace("\\", "");
        const eventLocation = event.LOCATION;
        const isRecorded = event.DESCRIPTION.includes(
            "Deze activiteit zal worden opgenomen.",
        );

        event.SUMMARY = `${eventType} ${courseName} | ${eventLocation}${isRecorded ? " 🔴" : "⭕"}`;
        event.SUMMARY = event.SUMMARY.replaceAll(" (PC-zaal)", "");

        for (const [original, afkorting] of Object.entries(afkortingen)) {
            event.SUMMARY = event.SUMMARY.replace(original, afkorting);
        }

        if (eventType === eventTypes.Werkgroep) event.COLOR = eventColors.WG;
        if (eventType === eventTypes.Hoorcollege) event.COLOR = eventColors.HC;
        if (eventType === eventTypes.Werkcollege) event.COLOR = eventColors.WC;
        if (eventType === eventTypes.Practicum) event.COLOR = eventColors.WC;
        if (event.SUMMARY.toLowerCase().includes("tentamen"))
            event.COLOR = eventColors.TT;

        const buildingShortName = event.LOCATION.split(" ")[0];
        if (buildingShortName in buildings) {
            event.LOCATION = `${event.LOCATION}, ${buildings[buildingShortName].join(", ")}`;
        }

        const atIndex = event.UID.indexOf("@schedule.ru.nl");
        let eventId = "";
        if (atIndex !== -1) {
            eventId = event.UID.substring(0, atIndex);
        }
        const encodedTitle = encodeURIComponent(event.SUMMARY);
        event.DESCRIPTION += `<br><a href="${requestOrigin}/c/${eventId}?u=${userToken}&title=${encodedTitle}">Cancel</a>`;

        const isCancelled = keyList.includes(eventId);

        if (isCancelled) {
            event.STATUS = "CANCELLED";
            event.COLOR = "lightgray";
        }
    }

    return clone;
}

export default app;
