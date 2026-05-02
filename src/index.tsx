import { Hono } from "hono/tiny";
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
    dateText: string;
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
    const rawDate = c.req.query("date");

    if (!eventId || !user) {
        return c.text("Missing the 'id' or 'u' parameters", 400);
    }

    const titleText = rawTitle ? rawTitle.replace(/\\/g, "") : "this event";
    const dateText = rawDate ? rawDate : "";

    const cancelled =
        (await c.env.cancelledevents.get<string[]>(user, "json")) || [];
    const isCancelled = cancelled.includes(eventId);

    c.set("eventId", eventId);
    c.set("user", user);
    c.set("rawTitle", rawTitle);
    c.set("titleText", titleText);
    c.set("dateText", dateText);
    c.set("cancelled", cancelled);
    c.set("isCancelled", isCancelled);

    await next();
});

app.get("/c/:eventId", async (c) => {
    const { isCancelled, rawTitle, titleText, dateText } = c.var;

    return c.html(
        <ConfirmPrompt
            isCancelled={isCancelled}
            rawTitle={rawTitle}
            titleText={titleText}
            dateText={dateText}
        />,
    );
});

app.post("/c/:eventId", async (c) => {
    const {
        eventId,
        user,
        cancelled,
        isCancelled,
        rawTitle,
        titleText,
        dateText,
    } = c.var;

    const formData = await c.req.parseBody();
    const action = formData.action || (isCancelled ? "restore" : "cancel");

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
            dateText={dateText}
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

    const transformedCal = transformCalendar(
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

export function transformCalendar(
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

        const wgMatch = event.DESCRIPTION.match(
            /(?:^|\\n)WG\s*([0-9]+)(?:\\n|$)/,
        );
        const wgNumber = wgMatch ? wgMatch[1] : null;
        const eventTypeDisplay = wgNumber
            ? `${eventType}(${wgNumber})`
            : eventType;

        event.SUMMARY = `${eventTypeDisplay} ${courseName} | ${eventLocation}${isRecorded ? " 🔴" : "⭕"}`;
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

        const lines = event.DESCRIPTION.split("\\n");
        const formattedLines = lines
            .map((line) => {
                const trimmed = line.trim();
                if (!trimmed) return "";

                if (trimmed.startsWith("Type:"))
                    return `🎓 <b>Type:</b> ${trimmed.substring(5).trim()}`;
                if (trimmed.startsWith("Vakcode:"))
                    return `🏷️ <b>Vakcode:</b> <code>${trimmed.substring(8).trim()}</code>`;
                if (trimmed.startsWith("Locatie(s):"))
                    return `📍 <b>Locatie(s):</b>`;
                if (trimmed.startsWith("Docent(en):"))
                    return `👤 <b>Docent(en):</b> ${trimmed.substring(11).trim()}`;
                if (trimmed.startsWith("Groep(en):"))
                    return `👥 <b>Groep(en):</b> ${trimmed.substring(10).trim()}`;
                if (trimmed.match(/^WG\s*[0-9]+$/)) return "";
                if (trimmed.startsWith("Studiegids:")) {
                    const url = trimmed.substring(11).trim();
                    return `📖 <b>Studiegids:</b> <a href="${url}">${url}</a>`;
                }
                if (trimmed === "Deze activiteit zal worden opgenomen.")
                    return `🎥 <i>${trimmed}</i>`;
                if (trimmed.startsWith("Deze afspraak wordt beheerd"))
                    return `<hr>⚙️ <i><small>${trimmed}</small></i>`;
                if (trimmed.startsWith("Laatst gesynchroniseerd"))
                    return `🔄 <i><small>${trimmed}</small></i>`;

                return trimmed;
            })
            .filter((line) => line !== "");

        event.DESCRIPTION = formattedLines.join("<br>");

        const atIndex = event.UID.indexOf("@schedule.ru.nl");
        let eventId = "";
        if (atIndex !== -1) {
            eventId = event.UID.substring(0, atIndex);
        }

        let dateStr = "";
        const dtStartKey = Object.keys(event).find((k) =>
            k.startsWith("DTSTART"),
        );
        const dtEndKey = Object.keys(event).find((k) => k.startsWith("DTEND"));

        if (dtStartKey) {
            const startVal = Array.isArray(
                event[dtStartKey as keyof typeof event],
            )
                ? (
                      event[
                          dtStartKey as keyof typeof event
                      ] as unknown as string[]
                  )[0]
                : event[dtStartKey as keyof typeof event];
            const endVal = dtEndKey
                ? Array.isArray(event[dtEndKey as keyof typeof event])
                    ? (
                          event[
                              dtEndKey as keyof typeof event
                          ] as unknown as string[]
                      )[0]
                    : event[dtEndKey as keyof typeof event]
                : "";

            if (typeof startVal === "string" && startVal.length >= 8) {
                const year = startVal.substring(0, 4);
                const month = startVal.substring(4, 6);
                const day = startVal.substring(6, 8);
                dateStr = `${day}-${month}-${year}`;

                const startTime = startVal.match(/T(\d{2})(\d{2})/);
                if (startTime) {
                    dateStr += ` ${startTime[1]}:${startTime[2]}`;

                    const endTime =
                        typeof endVal === "string"
                            ? endVal.match(/T(\d{2})(\d{2})/)
                            : null;
                    if (endTime) {
                        dateStr += ` - ${endTime[1]}:${endTime[2]}`;
                    }
                }
            }
        }

        const encodedTitle = encodeURIComponent(event.SUMMARY);
        const encodedDate = encodeURIComponent(dateStr);

        const cancelUrl = `${requestOrigin}/c/${eventId}?u=${userToken}&title=${encodedTitle}&date=${encodedDate}`;
        const buttonStyle =
            "display: inline-block; padding: 6px 12px; background-color: #dc2626; color: white; text-decoration: none; font-weight: bold; border-radius: 4px;";
        event.DESCRIPTION += `<br><br><a href="${cancelUrl}" style="${buttonStyle}">❌ Cancel this event</a>`;

        const isCancelled = keyList.includes(eventId);

        if (isCancelled) {
            event.STATUS = "CANCELLED";
            event.COLOR = "lightgray";
        }
    }

    return clone;
}

export default app;
