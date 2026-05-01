export type JSONCalendar = {
    VCALENDAR: Array<{
        PRODID: string;
        VERSION: string;
        METHOD: string;
        CALSCALE: string;
        "X-WR-TIMEZONE": string;
        "X-WR-CALNAME": string;
        "X-WR-CALDESC": string;
        "REFRESH-INTERVAL"?: string;
        VTIMEZONE: Array<{
            TZID: string;
            "LAST-MODIFIED": string;
            TZURL: string;
            "X-LIC-LOCATION": string;
            DAYLIGHT: Array<{
                TZNAME: string;
                TZOFFSETFROM: string;
                TZOFFSETTO: string;
                DTSTART: string;
                RRULE: string;
            }>;
            STANDARD: Array<{
                TZNAME: string;
                TZOFFSETFROM: string;
                TZOFFSETTO: string;
                DTSTART: string;
                RRULE: string;
            }>;
        }>;
        VEVENT: Array<{
            DTSTAMP: string;
            "DTSTART;TZID=Europe/Brussels": string;
            "DTEND;TZID=Europe/Brussels": string;
            SUMMARY: string;
            LOCATION: string;
            STATUS: string;
            SEQUENCE: string;
            CREATED: string;
            "LAST-MODIFIED": string;
            UID: string;
            DESCRIPTION: string;
            TRANSP: string;
            COLOR?: string;
        }>;
    }>;
};
