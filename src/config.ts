export type EventColors = Record<"WG" | "HC" | "TT" | "WC" | "PR", string>;

export const baseURL = new URL("https://persoonlijkrooster.ru.nl/ical");

export const defaultEventColors: EventColors = {
    WG: "darkorange",
    HC: "red",
    TT: "purple",
    WC: "yellow",
    PR: "yellow",
};

export const courseAbbreviations = {
    "Geografie, Planologie en Milieu": "GPM",
    "Theorising Spatial and Environmental Challenges":
        "Theorising S&E Challenges",
    "Leerproject 2: Veldwerk in het buitenland": "Leerproject 2",
} as const;

export const eventTypeAbbreviations = {
    Werkgroep: "WG",
    Hoorcollege: "HC",
    Werkcollege: "WC",
    Practicum: "PR",
    "Digitaal tentamen": "Tentamen",
    "Digitaal hertentamen": "Hertentamen",
} as const;
