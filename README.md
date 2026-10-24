# SEO Agency Intelligence System — Phase 1 (MVP)

Stack: Node.js (Express + TypeScript) API, React (Vite + TypeScript) dashboard, SQLite (via `sql.js`, no native build tools required).

## Structure

```
server/   Express API + SQLite storage
client/   React dashboard (Vite)
```

## Running locally

```bash
# terminal 1 — API (http://localhost:4000)
cd server
npm install
npm run dev

# terminal 2 — dashboard (http://localhost:5173)
cd client
npm install
npm run dev
```

The client reads the API URL from `VITE_API_URL` (see `client/.env.example`); it defaults to `http://localhost:4000/api` if unset.

## Stage 1 status — Client & Website Management

Done:
- Add a client (name, contact email/phone, notes).
- Attach one or more websites to a client (URL, site type, country, language, goal) — each client's data stays independent.
- Client list with website counts; client profile page listing its websites.
- SQLite persistence (`server/data/app.db`, gitignored) survives restarts.

Not yet built (next stages per the contract's 8-stage scope):
2. Google OAuth (GSC + GA4) connection per client property, plus the site crawler.
3. Technical SEO audit report from crawler output.
4. AI diagnosis engine.
5. Keyword + SERP-based strategy.
6. Approval checkpoint UI.
7. AI content generation.
8. Content QA + export.

Everything outside these 8 stages (e-commerce SEO, advanced SERP/competitor engine, E-E-A-T/AEO/GEO content QA, automated 90-day plan, internal linking engine, media engine, multi-client scaling, content refresh loop, CMS publishing) is explicitly out of scope for this phase per the contract.
