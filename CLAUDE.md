@AGENTS.md

# Bharat Pulse — project conventions

India situation monitor (fork of Pulse). Next.js 16 App Router + Supabase (PostGIS) + MapLibre, deployed on Vercel.
Note: Next 16 renamed `middleware.ts` → `proxy.ts`, and `cookies()`/`params` are async.

## Session protocol (one task per session — the user's usage limits depend on it)
1. **Start:** read `docs/ROADMAP.md`, pick the first `todo` task (or the one the user names). Read only the files that task lists; don't re-explore the codebase or re-research data sources (see `docs/INDIA_DATA_SOURCES.md`).
2. **Work:** stay inside the task. If you discover follow-up work, add it to the roadmap instead of doing it.
3. **Finish:** `npm run lint && npm run typecheck && npm test` (+ `npm run db:check` if SQL changed) → update the task's Status/Notes and "Gotchas learned" in `docs/ROADMAP.md` → commit → tell the user: **"✅ <task> done and committed — safe to `/clear` now; next up: <next task>."**
4. If context gets large mid-task, tell the user to run `/compact` (state is in files). Never leave a task half-done across a `/clear` without writing its progress into the roadmap first.
5. Don't put notes in `AGENTS.md` — `next dev` regenerates it.

## Commands
- `npm run dev` / `npm run build`
- `npm run lint && npm run typecheck && npm test` — must pass before any commit
- `npm run geo:build` (download + simplify boundaries) → `npm run geo:load` (into PostGIS)
- `npm run db:check` — migrations + whois/RLS/trigger checks on in-memory PostGIS (no Docker needed)

## Architecture
- `lib/types.ts` — **shared contract** (`NormalizedEvent`, `Category`, `Source`, `Job`, `MetricRow`). Don't change it without coordinating.
- `lib/india/` — states table (ISO 3166-2:IN, 2023 codes), generated gazetteer `places.json`, NAQI bands.
- `lib/categories.ts` — category labels (en + hi) and colours. Map, feed and stats must use these.
- `lib/supabase/{client,server,admin}.ts` — browser / per-request server / service-role clients. Never import `admin` in client code.
- `supabase/migrations/` — schema. New changes go in a new timestamped migration file, never edit applied ones.
- Ingestion: `lib/ingest/<source>.ts` implements `Ingester` (`fetchRaw` + pure `normalize`, optional `metrics`, `insertOnly`). Jobs that aren't events live in `lib/jobs/` (power, mandi, sansad, osm) with pure transforms. `lib/ingest/run.ts` dispatches both; `POST /api/ingest?source=…` (Bearer `CRON_SECRET`) is called by pg_cron.
- Location: ingesters set `state` when the source names it; otherwise a DB trigger fills `state`/`district` from PostGIS boundaries. `whois(lat,lng)` RPC powers "who represents this place".
- i18n: UI strings in `lib/i18n/dict.ts` (en/hi, `lang` cookie). Content translation: `lib/i18n/translate.ts` (Bhashini → Sarvam, cached in `translations`). Show headlines with `displayTitle(event, lang)`.
- Data sources and their quirks: `docs/INDIA_DATA_SOURCES.md`. Don't scrape MyNeta (ADR declined permission) — link to it.

## Module ownership (for parallel agents — stay inside your folders)
| Agent | Owns |
|---|---|
| ingest-<source> (sachet, ncs, firms, aqi, pib, news, sports) | `lib/ingest/<source>.ts`, its test, `lib/ingest/__fixtures__/<source>.*` |
| jobs | `lib/jobs/**` |
| geo | `scripts/*geo*`, `scripts/load-boundaries.mjs`, `lib/india/**`, `public/geo/**` |
| ui-map | `components/map/**`, `components/neta/**`, map half of `app/page.tsx` |
| ui-feed | `components/feed/**`, feed half of `app/page.tsx`, `lib/events/**`, `lib/metrics/**` |
| civic | `app/report/**`, `components/reports/**`, `lib/reports/**` |
| i18n | `lib/i18n/**`, `components/i18n/**`, `app/api/translate/**` |
| ui-insights | `app/stats/**`, `app/brief/**`, `components/stats/**` |
| ai-brief | `lib/brief/**`, `app/api/brief/**` |
| auth | `app/login/**`, `app/auth/**`, `app/watchlists/**`, `components/auth/**`, `components/nav.tsx` |

If you truly need to touch a shared file (`lib/types.ts`, `package.json`, `app/layout.tsx`), keep the change minimal and mention it in your summary.

## Style
- Dark UI; use the theme tokens in `app/globals.css` (`bg-surface`, `border-border`, `text-muted`, `text-accent`), not raw hex.
- Server Components by default; add `"use client"` only where needed (maps are client-only, loaded via `next/dynamic` with `ssr: false`).
- Map: MapLibre GL v6, Mercator, OpenFreeMap tiles, style in `components/map/india-style.ts`. OSM boundary layers are deliberately omitted; India's outline/state lines come from `public/geo/`. Worker served from `public/maplibre/` (copied by `scripts/copy-maplibre-worker.mjs`).
- Times shown to users are IST (`formatIst`, `IstClock`); stats buckets are IST hours/days.
- Validate external API payloads with zod inside `normalize`; skip bad items instead of throwing.
- Tests: Vitest, colocated `*.test.ts`, run against saved fixtures — no network in unit tests.
