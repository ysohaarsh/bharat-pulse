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
- **Status:** done 2026-10-22 — Supabase project `bharat-pulse` (`jdmzuxlrshybwohwybei`, ap-south-1, free) via MCP; all migrations applied; `geo:load` 36/641/543/4098 + 369 wards; first ingest: 537 MPs, MLAs (6 states first run → job now batched), ~380 events, 50 AQI stations. Secrets set by a user-run script (keys never in the session). Leftovers: `power` and `flights` return "fetch failed" from Vercel (source blocks/needs headers from cloud IPs? check), `osm` Overpass timeouts on first states, `firms` 0 rows with key set (check), `lib/database.types.ts` not regenerated yet.

### T2 · Deploy to Vercel + pg_cron
- **Needs:** T1; Vercel account (MCP available).
- **Do:** create Vercel project, set env vars, deploy; add Vault secrets `bharat_app_url`,
  `bharat_cron_secret` (see `supabase/migrations/20261005130000_cron_jobs.sql`); set Supabase Auth
  site URL / redirect URLs to the Vercel domain.
- **Done when:** `cron.job_run_details` shows successful runs; events keep arriving without manual curls.
- **Status:** done 2026-10-22 — https://bharat-pulse-india.vercel.app (GitHub ysohaarsh/bharat-pulse, pushes to main auto-deploy). Vercel env synced from `.env.local` (NEXT_PUBLIC_* that look like keys need `vercel env add … --type config`). Vault `bharat_app_url` + `bharat_cron_secret` set; 16 pg_cron jobs. Auth Site URL/redirects set by the user in the dashboard. Check `cron.job_run_details` after a few hours.

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

- **UI · Bahi-Khata retheme** — done 2026-10-22. Whole UI moved from green CRT to an Indian ledger-as-database look (maroon cloth chrome, cream ruled pages, indigo ink, Rozha One / Mukta / IBM Plex Mono, block-print/toran/jaali motifs). Design language + class catalogue: `docs/DESIGN.md` — follow it for any new UI. Follow-ups (design-system gaps from the phase-2 agents): `.ledger-prose` (unruled long-form body), `.stamp` colour override/size variants, compact `.ledger-table` modifier, non-interactive chip + small swatch chip, global `Notice` class (now local in `components/auth/notice.tsx`), file-input style, `.ledger-title` wrapping, sub-section numbering inside panels, `ledger-panel` opacity under slips; Hindi `stateLabel` returns codes (`DL DL`) in `lib/stats/format`.

## Later (v1.1 features, each its own session)

| Id | Feature | Notes / source |
|---|---|---|
| F1 | ✅ done (`5edbbd5`, `e239b3c`) — MLA names for 31 states/UTs | `lib/jobs/mla.ts` parses Wikipedia section HTML, matched by AC number (name fallback only when numerals match); weekly cron `bharat-mla`. 2026-10-22: +28 states (BR, WB, TN, KL, AS, PY from 2025–26 elections; RJ, MP, GJ, AP, TS, OD, PB, HR, DL, JH, CG, UK, HP, GA, JK, MN, ML, NL, TR, MZ, AR, SK) — counts = seats minus real vacancies (TN 6, MN 2, TS 1). ~27 rows have no polygon (GJ 20, MP Indore 2–5, TS 1, SK 1) → `boundary_code` null, not in whois. Not yet run against prod (needs T1 → `/api/ingest?source=mla`). Next: bump page titles after elections (PB, UP, GA, MN, UK 2027; GJ, HP late 2027); fix null/rowspan-carried parties on by-election successor rows (WB 227, GJ 146–148, UK table 1); optional `source_url` column; MLA whois case in db:check. |
| F2 | ✅ done (`c11d448`, `daf605d`) — Bengaluru wards | 369 GBA wards (OpenCity, public domain) → `boundaries kind='ward'`, `public/geo/wards-blr.geojson`. Map layer (toggle "Bengaluru wards", zoom ≥ 10, geojson fetched lazily only when viewport overlaps Bengaluru; hover tooltip) + whois panel ward row with "corporator polls pending" note (en/hi). Also fixed map popups rendering behind the canvas (`map.css` z-index). Follow-ups: add `name_kn` to wards geojson in `scripts/build-geo.mjs` (tooltip is English-only); tap-friendly ward info on mobile; corporators `house='ward'` after polls (due by 31 Dec 2026); optional reservations KML; optional ward in `locate()`/reports via new migration. |
| F3 | IMD district warnings + nowcast | Needs IMD key + IP whitelisting (user applies at mausam.imd.gov.in). New ingester `lib/ingest/imd.ts`. |
| F4 | Delhi live buses | otd.delhi.gov.in GTFS-RT (free key on request), protobuf → map layer. |
| F5 | Women's health choropleth | NFHS-5 district indicators (data.gov.in) → static layer by district (menstrual hygiene, anaemia). |
| F6 | Flights over India — data side ✅ done (`c92e60c`) | `lib/jobs/flights.ts`, OpenSky anonymous `/states/all` with India bbox, cron `12,42 * * * *` (4 credits/call → 192 of 400 daily). Writes `metrics` keys `flights.total/airborne/ground/india_registered` (+ history) and one replaced `flights.positions` row (`meta.fields` + `meta.aircraft` arrays, ~30 KB). **Todo:** map layer — read `flights.positions` on its own (`.eq('key','flights.positions').single()`), colour on-ground differently, show snapshot age; optional per-state counts via point-in-polygon. |
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
- MLAs, more states (F1, 2026-10-22): Wikipedia's ordinal ≠ sitting house (`17th West Bengal` = 2021; sitting is 18th; same for 10th Arunachal, 2nd Telangana) — check a first-row member's election year. Prefer the "Members of …" heading over a bare "Members" parent/summary section. Two-row headers (CG, MP, RJ, JK) are joined per column. DataMeet ACs: GJ has only 162/182, MP lacks Indore 2–5, AP polygons are numbered +119 (`Assembly.codeOffset`), HP page has no AC-number column (match by unique name), HP file has the typo "Sri Renukaji (SC". "Resigned from <party>" / "Resigned as CM" is not a vacancy. Wikipedia API returns an HTML "too many requests" page after ~20 fast calls → ~1.2 s between calls.
- Flights (F6): OpenSky bbox > 400 sq deg costs 4 credits; anonymous = 400/day and Vercel egress IPs are shared, so prod budget may be lower (429 surfaces in job result). India bbox includes Gulf/Pakistan/Bangladesh airspace (~half foreign-registered) → `flights.total` = "in the India box". State vectors are positional with lng before lat; callsigns space-padded; `baro_altitude` null on ground.
- Worktree dev/QA: Turbopack refuses a symlinked `node_modules` → `npx next dev --webpack`. Playwright has no bundled Chromium here → `chromium.launch({ channel: "chrome" })`. ESLint lints `.smoke/*.ts` → keep probes as `.mjs`.
- MLA job on Vercel (2026-10-22): 31 assemblies back-to-back → Wikipedia throttled after 6 and the run nears the 60 s limit. Now stalest-first, 1.5 s apart, within `RUN_BUDGET_MS`; cron daily (`20261022120000_mla_cron_daily.sql`). `cron.schedule` with an existing name replaces the job (db:check's stub has no `unschedule`).
- Parallel agents in git worktrees: worktrees have no `node_modules`/`data/` → symlink from the main checkout; launching several worktree agents at the same instant can race (`commondir` error) — retry. F2 and F7 both edit `scripts/build-geo.mjs` (source list) → expect an additive conflict.
