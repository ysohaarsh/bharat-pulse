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
- **Status:** in progress — key-free half done (`e496a84`): providers checked against current docs,
  zod-validated, no longer cache untranslated text on bad responses, Bhashini picks the translation
  config by taskType + language pair and refetches on 401/403, Sarvam 2000-char guard; mocked-fetch
  tests incl. Bhashini→Sarvam fallback. **Still needs keys to verify:** MeitY pipeline coverage for
  ur/as/or (+ script codes for Urdu), live compute response wrapper, inference-key TTL (code assumes
  6 h) and expiry status, Bhashini batch limit, Sarvam error body/rate limits. Then the done-when checks.

### T6 · E2E coverage for the new flows (needs T1)
- Playwright specs for: whois panel (click map → MP name), pincode lookup, report submit
  (logged-in user, photo upload, appears on map), language toggle. Files: `e2e/*`.
- **Status:** todo

## Later (v1.1 features, each its own session)

| Id | Feature | Notes / source |
|---|---|---|
| F1 | ✅ done (`5edbbd5`) — MLA names for KA/UP/MH | `lib/jobs/mla.ts` parses Wikipedia section HTML; 907 rows (KA 223, UP 396, MH 288), matched by AC number; weekly cron `bharat-mla`. Not yet run against prod (needs T1 → `/api/ingest?source=mla`). Next: add states to `ASSEMBLIES`; update page titles after each state election; optional `source_url` column; MLA whois case in db:check. |
| F2 | ✅ done (`c11d448`) — Bengaluru wards | 369 GBA wards (OpenCity, public domain) → `boundaries kind='ward'`, `public/geo/wards-blr.geojson`. No corporators yet (polls due by 31 Dec 2026). Follow-ups: ward map layer when zoomed into Bengaluru; neta panel ward/corporation; corporators `house='ward'` after polls; optional reservations KML; optional ward in `locate()`/reports via new migration. |
| F3 | IMD district warnings + nowcast | Needs IMD key + IP whitelisting (user applies at mausam.imd.gov.in). New ingester `lib/ingest/imd.ts`. |
| F4 | Delhi live buses | otd.delhi.gov.in GTFS-RT (free key on request), protobuf → map layer. |
| F5 | Women's health choropleth | NFHS-5 district indicators (data.gov.in) → static layer by district (menstrual hygiene, anaemia). |
| F6 | Flights over India | OpenSky anonymous, India bbox; count + map layer; mind credit limits. |
| F7 | ✅ done (`e49712a`) — Assam post-2023 ACs | ECI results portal `results.eci.gov.in/ResultAcGenMay2026/ac/S03.js` (126 seats; **no licence stated**, official gazetted delimitation). Counts unchanged (4098 ACs). Needs `npm run geo:load` (T1). Same URL pattern serves KL/TN/WB/PY if ever needed. |
| F8 | Mobile layout + README screenshots | Use Playwright to capture `docs/screenshot-*.png` once real data flows (after T2). |

## Gotchas learned (keep adding — this is the project's memory)

- PIB: every Lang/Regid redirects to Hindi; no dates in items; **403 for bot-like User-Agents** → plain `Mozilla/5.0`.
- Overpass: `landuse=construction` is ~10× slower (skipped); public instances stall → 25 s per-state cap + mirror + rotation.
- `api.data.gov.in` was unreachable from the sandbox (www.data.gov.in fine) — verify from the user's machine (T3).
- sansad.in lists died/resigned MPs next to successors (`status`); 3 seats vacant as of 2026-10-05.
- `rm` is aliased to `rm -i` in this shell → use `/bin/rm -f`. zsh doesn't word-split `$VAR` in loops → use `xargs` or `bash -c`. macOS `sed` has no `\b` → use `perl -pi -e`.
- Docker wasn't running here; `npm run db:check` (PGlite + PostGIS) tests migrations without it.
- `.smoke/` (gitignored) is for ad-hoc live-API checks; Vitest excludes it.
- Wards (F2): GBA ward numbers restart at 1 in each of the 5 corporations → code `WARD:BLR:<CORP>:<n>`. Source is KML only, all props are strings ("20170.0"); names come in Kannada (`meta.name_kn`), not Hindi. Ward-file AC can disagree with DataMeet AC near borders. `locate()`/triggers don't fill ward; only `whois` returns it.
- Assam (F7): ECI polygons are ~15× denser → simplified at 1% vs 15%. ECI file has no district → take Census 2011 district at the seat's interior point; mapshaper `-join point-method` between polygon layers matched only 27/126, `-points inner` + point-in-polygon join matches all. Raw saved as `.txt` (a `.js` under `data/` gets linted). ECI typos kept ("Dibrugrah").
- MLAs (F1): match Wikipedia seats by AC number, not name (Raibag/Raybag, Prayagraj/Allahabad West…). Table layouts differ per state (UP has full party names; MH has an Alliance column). Seats that changed hands list one row per member — last wins; "Died/Resigned/Vacant" remarks mark vacancies. MediaWiki `prop=sections` is deprecated → `prop=tocdata`. Supabase caps queries at 1000 rows → read AC boundaries per state.
- Translation (T5): Bhashini docs at bhashini.gitbook.io (append `.md` for markdown, `/llms.txt` index); Sarvam ref at docs.sarvam.ai/api-reference/text/translate-text.md. Sarvam uses `od-IN` for Odia; stay on `sarvam-translate:v1` (`mayura:v1` = 11 langs, 1000 chars). Tests of `server-only` modules need `vi.mock("server-only", () => ({}))` + dynamic import.
- Parallel agents in git worktrees: worktrees have no `node_modules`/`data/` → symlink from the main checkout; launching several worktree agents at the same instant can race (`commondir` error) — retry. F2 and F7 both edit `scripts/build-geo.mjs` (source list) → expect an additive conflict.
