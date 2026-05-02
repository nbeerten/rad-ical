// test/index.spec.ts
import { describe, it, expect, beforeEach } from "vitest";
import app, { transformCalendar, parseEventDate, formatDescription } from "../src/index";
import { convert, revert } from "../src/ical2json";
import type { JSONCalendar } from "../src/types";

const mockKvStore = new Map<string, string>();

const env = {
	cancelledevents: {
		get: async (key: string, type?: string) => {
			const val = mockKvStore.get(key);
			if (!val) return null;
			if (type === "json") return JSON.parse(val);
			return val;
		},
		put: async (key: string, value: any) => {
			mockKvStore.set(key, String(value));
		},
		delete: async (key: string) => {
			mockKvStore.delete(key);
		},
	} as any,
};

describe("Ical2Json", () => {
	it("is the same", async () => {
		const icsFile = await fetch(
			"https://raw.githubusercontent.com/jens-maus/node-ical/master/test/test6.ics",
		).then((res) => res.text());
		const converted = convert(icsFile);

		const convertedAgain = convert(revert(converted));

		expect(converted).toStrictEqual(convertedAgain);
	});
});

describe("Worker Routing & Validation", () => {
	it("returns 400 if 'eu' or 'h' query parameters are missing on the main route", async () => {
		const response = await app.request("https://example.com/", undefined, env);
		expect(response.status).toBe(400);
		expect(await response.text()).toBe("Missing the 'eu' and/or 'h' query parameters");
	});

	it("returns 400 if invalid colors are provided", async () => {
		// 'notarealcolor' is not in the CSS named colors list
		const response = await app.request(
			"https://example.com/?eu=123&h=456&hccolor=notarealcolor",
			undefined,
			env
		);
		expect(response.status).toBe(400);
		expect(await response.text()).toContain(
			"One or more color(s) specified in the xxcolor query parameter is/are invalid"
		);
	});

	it("returns 400 on the cancellation route if missing 'u' parameter", async () => {
		const response = await app.request("https://example.com/c/12345", undefined, env);
		expect(response.status).toBe(400);
		expect(await response.text()).toBe("Missing the 'id' or 'u' parameters");
	});
});

describe("Cancellation Flow (KV Store)", () => {
	beforeEach(() => {
		mockKvStore.clear();
	});

	it("GET /c/:id shows cancel confirmation for a new event", async () => {
		const response = await app.request("https://example.com/c/math101?u=studentA", undefined, env);

		expect(response.status).toBe(200);
		const text = await response.text();
		expect(text).toContain("Confirm Cancellation");
		expect(text).toContain("Cancel Event");
	});

	it("POST /c/:id cancels the event and updates KV", async () => {
		const formData = new FormData();
		formData.append("action", "cancel");
		const response = await app.request("https://example.com/c/math101?u=studentA", {
			method: "POST",
			body: formData,
		}, env);

		expect(response.status).toBe(200);
		const text = await response.text();
		expect(text).toContain("Event Cancelled");

		// Verify the event was added to the student's isolated KV store
		const cancelled = await env.cancelledevents.get("studentA", "json");
		expect(cancelled).toEqual(["math101"]);
	});

	it("GET /c/:id shows restore confirmation for an already cancelled event", async () => {
		// Pre-populate the mock KV store
		await env.cancelledevents.put("studentB", JSON.stringify(["physics202"]));

		const response = await app.request("https://example.com/c/physics202?u=studentB", undefined, env);

		expect(response.status).toBe(200);
		const text = await response.text();
		expect(text).toContain("Confirm Restore");
		expect(text).toContain("Restore Event");
	});

	it("POST /c/:id restores the event and updates KV", async () => {
		// Pre-populate the mock KV store with multiple events
		await env.cancelledevents.put("studentC", JSON.stringify(["chem303", "bio404"]));

		const formData = new FormData();
		formData.append("action", "restore");
		const response = await app.request("https://example.com/c/chem303?u=studentC", {
			method: "POST",
			body: formData,
		}, env);

		expect(response.status).toBe(200);
		const text = await response.text();
		expect(text).toContain("Event Restored");

		// Verify the KV state (chem303 should be removed, bio404 remains)
		const cancelled = await env.cancelledevents.get("studentC", "json");
		expect(cancelled).toEqual(["bio404"]);
	});
});

describe("transformCalendar", () => {
	const mockCalendar: JSONCalendar = {
		VCALENDAR: [
			{
				PRODID: "-//Mock//EN",
				VERSION: "2.0",
				METHOD: "PUBLISH",
				CALSCALE: "GREGORIAN",
				"X-WR-TIMEZONE": "Europe/Amsterdam",
				"X-WR-CALNAME": "Mock Calendar",
				"X-WR-CALDESC": "Mock Description",
				VTIMEZONE: [],
				VEVENT: [
					{
						DTSTAMP: "20240101T000000Z",
						"DTSTART;TZID=Europe/Brussels": "20240101T100000",
						"DTEND;TZID=Europe/Brussels": "20240101T120000",
						SUMMARY: "Type: Hoorcollege - Test Course - Extra",
						LOCATION: "SP 1.23",
						STATUS: "CONFIRMED",
						SEQUENCE: "0",
						CREATED: "20240101T000000Z",
						"LAST-MODIFIED": "20240101T000000Z",
						UID: "mockevent123@schedule.ru.nl",
						DESCRIPTION: "Type: Hoorcollege\\nDetails",
						TRANSP: "OPAQUE",
					},
				],
			},
		],
	};

	const mockColors = {
		WG: "darkorange",
		HC: "red",
		TT: "purple",
		WC: "yellow",
		PR: "yellow",
	};

	it("injects a cancel link into the event description", async () => {
		const result = await transformCalendar(mockCalendar, mockColors, [], "testUser123", "https://ru-rooster.nilsbeerten.nl");
		const event = result.VCALENDAR[0].VEVENT[0];
		expect(event.DESCRIPTION).toContain("https://ru-rooster.nilsbeerten.nl/c/mockevent123");
		expect(event.DESCRIPTION).toContain("u=testUser123");
	});

	it("cancels an event if its ID is in the cancelled list", async () => {
		const result = await transformCalendar(mockCalendar, mockColors, ["mockevent123"], "testUser123", "https://ru-rooster.nilsbeerten.nl");
		const event = result.VCALENDAR[0].VEVENT[0];
		expect(event.STATUS).toBe("CANCELLED");
		expect(event.COLOR).toBe("lightgray");
	});

	it("modifies the summary to match abbreviations and locations", async () => {
		const result = await transformCalendar(mockCalendar, mockColors, [], "testUser123", "https://ru-rooster.nilsbeerten.nl");
		const event = result.VCALENDAR[0].VEVENT[0];
		expect(event.SUMMARY).toContain("HC Test Course");
		expect(event.LOCATION).toContain("Spinozagebouw");
	});
});

describe("parseEventDate", () => {
	it("parses valid start and end dates correctly", () => {
		const event = {
			"DTSTART;TZID=Europe/Brussels": "20240101T100000",
			"DTEND;TZID=Europe/Brussels": "20240101T120000",
		};
		expect(parseEventDate(event)).toBe("01-01-2024 10:00 - 12:00");
	});

	it("handles arrays of values", () => {
		const event = {
			"DTSTART;TZID=Europe/Brussels": ["20240215T093000"],
			"DTEND;TZID=Europe/Brussels": ["20240215T113000"],
		};
		expect(parseEventDate(event)).toBe("15-02-2024 09:30 - 11:30");
	});

	it("handles missing end dates", () => {
		const event = {
			"DTSTART;TZID=Europe/Brussels": "20240310T140000",
		};
		expect(parseEventDate(event)).toBe("10-03-2024 14:00");
	});

	it("handles dates without time parameters", () => {
		const event = {
			"DTSTART;VALUE=DATE": "20240420",
		};
		expect(parseEventDate(event)).toBe("20-04-2024");
	});
});

describe("formatDescription", () => {
	it("formats standard description fields with emojis", () => {
		const raw = "Type: Hoorcollege\\nVakcode: NWI-IBC043\\nLocatie(s):\\nSP 1.23\\nDocent(en): John Doe\\nGroep(en): Group 1";
		const result = formatDescription(raw);

		expect(result).toContain("🎓 <b>Type:</b> Hoorcollege");
		expect(result).toContain("🏷️ <b>Vakcode:</b> <code>NWI-IBC043</code>");
		expect(result).toContain("📍 <b>Locatie(s):</b> SP 1.23");
		expect(result).toContain("👤 <b>Docent(en):</b> John Doe");
		expect(result).toContain("👥 <b>Groep(en):</b> Group 1");
	});

	it("formats links and recordings", () => {
		const raw = "Studiegids: https://example.com\\nDeze activiteit zal worden opgenomen.";
		const result = formatDescription(raw);

		expect(result).toContain('📖 <b>Studiegids:</b> <a href="https://example.com">https://example.com</a>');
		expect(result).toContain("🎥 <i>Deze activiteit zal worden opgenomen.</i>");
	});

	it("handles inline locations", () => {
		const raw = "Locatie(s): HG00.304";
		const result = formatDescription(raw);

		expect(result).toContain("📍 <b>Locatie(s):</b> HG00.304");
	});

	it("skips empty lines and strips standalone WG numbers", () => {
		const raw = "\\nWG 12\\nNormal text";
		const result = formatDescription(raw);

		expect(result).not.toContain("WG 12");
		expect(result).toContain("Normal text");
	});
});
