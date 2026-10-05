# Roadmap — one task per Claude session

Each task below is sized to fit **one fresh session**. A session reads `CLAUDE.md` (auto-loaded)
and then only this file plus the files named in its task. When the task is done, the session:
updates the task's **Status/Notes** here, commits, and tells the user it's safe to `/clear`.

Status: `todo` · `in progress` · `blocked (needs …)` · `done (commit sha)`

---

## Done

- **P0 Fork + India rebuild** — done (`fa20e06`). Ingesters, jobs, PostGIS schema, whois, civic
  reports, India map, en/hi UI, translation, docs. 202 unit tests, `npm run db:check` passes.

## Next up (in order)

### T1 · Supabase project + first data load
- **Needs from user:** a new Supabase project (or OK to create one via the Supabase MCP), its URL,
  anon key, service-role key → `.env.local`; a 32+ char `CRON_SECRET`.
- **Do:** apply `supabase/migrations/*` (`npx supabase db push` or MCP `apply_migration`) →
  `npm run geo:load` → run `/api/ingest?source=` for sansad, sachet, ncs, aqi, power, pib, news,
  sports, osm (see README loop) → regenerate `lib/database.types.ts` from the real project.
- **Done when:** `select kind, count(*) from boundaries group by kind` = 36/641/543/4098; the map
  shows SACHET + NCS pins; clicking Bengaluru shows P C Mohan; `representatives` ≈ 540 rows.
- **Status:** todo

### T2 · Deploy to Vercel + pg_cron
- **Needs:** T1; Vercel account (MCP available).
- **Do:** create Vercel project, set env vars, deploy; add Vault secrets `bharat_app_url`,
  `bharat_cron_secret` (see `supabase/migrations/20261005130000_cron_jobs.sql`); set Supabase Auth
  site URL / redirect URLs to the Vercel domain.
- **Done when:** `cron.job_run_details` shows successful runs; events keep arriving without manual curls.
- **Status:** todo

### T3 · Verify data.gov.in (AQI + mandi) with a real key
- **Needs:** `DATA_GOV_IN_API_KEY`.
- **Do:** curl both resources (ids in `docs/INDIA_DATA_SOURCES.md`); replace the hand-made
  `lib/ingest/__fixtures__/cpcb.json` and `mandi.onion.json` with trimmed real responses; fix
  `lib/ingest/aqi.ts` / `lib/jobs/mandi.ts` field names if they differ; confirm whether
  `pollutant_avg` is a sub-index or a concentration (aqi.ts assumes sub-index).
- **Done when:** tests pass on real fixtures; the vitals panel shows CPCB cities and mandi prices.
- **Status:** todo

### T4 · Verify NASA FIRMS with a real key
- **Needs:** `FIRMS_MAP_KEY`. **Do:** replace synthetic `firms.csv` fixture with a trimmed real
  response; check header names; tune `severityForCell` (stubble-burning season floods Punjab).
- **Status:** todo

### T5 · Verify Bhashini / Sarvam translation live
- **Needs:** Bhashini userId + ULCA key (and/or `SARVAM_API_KEY`).
- **Do:** run `/api/ingest?source=translate`; check `lib/i18n/providers.ts` against the live
  responses (Bhashini pipeline id, response shape; Sarvam model name); add a unit test with a
  mocked fetch for each provider.
- **Done when:** SACHET Telugu/Hindi alerts show English + Hindi titles; `/brief` has `content_hi`.
- **Status:** todo

### T6 · E2E coverage for the new flows (needs T1)
- Playwright specs for: whois panel (click map → MP name), pincode lookup, report submit
  (logged-in user, photo upload, appears on map), language toggle. Files: `e2e/*`.
- **Status:** todo

## Later (v1.1 features, each its own session)

| Id | Feature | Notes / source |
|---|---|---|
| F1 | MLA names for assembly seats | No national API. Options: state CEO sites, Wikipedia "List of members of the X Legislative Assembly" (CC BY-SA). Store in `representatives` with `house='vs'`. Start with 2–3 big states. |
| F2 | Bengaluru wards + corporators pilot | OpenCity CKAN: "GBA Wards Delimitation 2025" (369 wards) → `boundaries kind='ward'`. Note: GBA councils may not have elected corporators yet. |
| F3 | IMD district warnings + nowcast | Needs IMD key + IP whitelisting (user applies at mausam.imd.gov.in). New ingester `lib/ingest/imd.ts`. |
| F4 | Delhi live buses | otd.delhi.gov.in GTFS-RT (free key on request), protobuf → map layer. |
| F5 | Women's health choropleth | NFHS-5 district indicators (data.gov.in) → static layer by district (menstrual hygiene, anaemia). |
| F6 | Flights over India | OpenSky anonymous, India bbox; count + map layer; mind credit limits. |
| F7 | Assam post-2023 assembly boundaries | Data gap: DataMeet AC for Assam is pre-delimitation. Georeference ECI maps or find newer GeoJSON. |
| F8 | Mobile layout + README screenshots | Use Playwright to capture `docs/screenshot-*.png` once real data flows (after T2). |

## Gotchas learned (keep adding — this is the project's memory)

- PIB: every Lang/Regid redirects to Hindi; no dates in items; **403 for bot-like User-Agents** → plain `Mozilla/5.0`.
- Overpass: `landuse=construction` is ~10× slower (skipped); public instances stall → 25 s per-state cap + mirror + rotation.
- `api.data.gov.in` was unreachable from the sandbox (www.data.gov.in fine) — verify from the user's machine (T3).
- sansad.in lists died/resigned MPs next to successors (`status`); 3 seats vacant as of 2026-10-05.
- `rm` is aliased to `rm -i` in this shell → use `/bin/rm -f`. zsh doesn't word-split `$VAR` in loops → use `xargs` or `bash -c`. macOS `sed` has no `\b` → use `perl -pi -e`.
- Docker wasn't running here; `npm run db:check` (PGlite + PostGIS) tests migrations without it.
- `.smoke/` (gitignored) is for ad-hoc live-API checks; Vitest excludes it.
