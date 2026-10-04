@AGENTS.md

# Pulse — project conventions

Real-time world events dashboard (mini World Monitor). Next.js 16 App Router + Supabase + Leaflet, deployed on Vercel.
Note: Next 16 renamed `middleware.ts` → `proxy.ts`, and `cookies()`/`params` are async.

## Commands
- `npm run dev` / `npm run build`
- `npm run lint && npm run typecheck && npm test` — must pass before any commit

## Architecture
- `lib/types.ts` — **shared contract** (`NormalizedEvent`, `Category`, `Source`). Don't change it without coordinating; every module depends on it.
- `lib/categories.ts` — category labels/colors. Map, feed and stats must use these.
- `lib/supabase/{client,server,admin}.ts` — browser / per-request server / service-role clients. Never import `admin` in client code.
- `supabase/migrations/` — schema. New changes go in a new timestamped migration file, never edit applied ones.
- Ingestion: `lib/ingest/<source>.ts` implements `Ingester` (`fetchRaw` + pure `normalize`). `lib/ingest/run.ts` upserts on `(source, external_id)`. `POST /api/ingest` (Bearer `CRON_SECRET`) is called by Supabase pg_cron.

## Module ownership (for parallel agents — stay inside your folders)
| Agent | Owns |
|---|---|
| ingest-<source> (usgs, eonet, gdelt, rss, gdacs, who, sports) | `lib/ingest/<source>.ts`, `lib/ingest/<source>.test.ts`, `lib/ingest/__fixtures__/<source>.*` |
| ui-map | `components/map/**`, map half of `app/page.tsx` |
| ui-feed | `components/feed/**`, feed half of `app/page.tsx`, `lib/events/**` (queries + realtime hook) |
| ui-insights | `app/stats/**`, `app/brief/**`, `components/stats/**` |
| ai-brief | `lib/brief/**`, `app/api/brief/**` |
| auth | `app/login/**`, `app/auth/**`, `app/watchlists/**`, `components/auth/**`, `components/nav.tsx` |

If you truly need to touch a shared file (`lib/types.ts`, `package.json`, `app/layout.tsx`), keep the change minimal and mention it in your summary.

## Style
- Dark UI; use the theme tokens in `app/globals.css` (`bg-surface`, `border-border`, `text-muted`, `text-accent`), not raw hex.
- Server Components by default; add `"use client"` only where needed (the map must be client-only, load via `next/dynamic` with `ssr: false`).
- Map: MapLibre GL v6 globe + OpenFreeMap vector tiles (keyless), style in `components/map/pulse-style.ts`. Its worker is served from `public/maplibre/` (copied by `scripts/copy-maplibre-worker.mjs` in `predev`/`prebuild`; gitignored) — don't import the worker through the bundler.
- Validate external API payloads with zod inside `normalize`; skip bad items instead of throwing.
- Tests: Vitest, colocated `*.test.ts`, run against saved fixtures — no network in unit tests.
