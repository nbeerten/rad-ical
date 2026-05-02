# rad-ical

A Cloudflare Worker built with Hono to proxy and transform personal Radboud University (RU) iCal schedules. It cleans up event descriptions, adding emojis (icons), and adds the ability to cancel specific events in your calendar using Cloudflare KV and most importantly, removes the course code from the event title, replacing it by a title that's readable (i.e. `HC Course Name | Lin 1 🔴`)

> **Disclaimer:** This project was partially written by code supplied by AI. It is mostly a personal project, for my own convenience.

## Instructions

### Prerequisites

- [Node.js](https://nodejs.org/)
- [pnpm](https://pnpm.io/) package manager
- A [Cloudflare](https://dash.cloudflare.com/) account (for deployment)

### Local Development

1. Clone the repository and install dependencies:

```bash
pnpm install
```

2. Start the local development server (Cloudflare KV will be automatically mocked locally):

```bash
pnpm run dev
```

3. Configure to your liking by editing `src/config.ts`.
4. Create a Cloudflare KV and put it's id and name in `wrangler.jsonc`
5. Deploy on Cloudflare by importing your Github Repository in Cloudflare's Create Worker UI.
