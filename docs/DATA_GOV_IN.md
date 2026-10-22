# data.gov.in (OGD Platform India) — access model, verification, and what to add

Researched 2026-10-22 from the user's machine. No sign-up, login or form was used; the one key used is the
public test key printed in the swagger box on every resource's "API" tab. Samples are in `.smoke/`
(gitignored): `ogd_aqi_sample.json`, `ogd_mandi_onion_sample.json`.

## 1. Access model

- **One personal key works for every catalog resource.** Each resource page's API tab is a swagger box for
  `GET https://api.data.gov.in/resource/<resource-id>` with the same parameters everywhere, and a single
  "Generate API Key" button (My Account). Resource id = the dataset's `uuid`; the key is not tied to a dataset.
  No per-resource approval flow was found in the site, the swagger box, or third-party client docs
  (R `ogdindiar`, Python `datagovindia`). Caveat: a few resources are `active: false` or return an error body
  (see Gaps); that is a dataset problem, not a key problem.
- **Parameters (from the swagger box):** `api-key` (required), `format` = `json|xml|csv`, `offset`, `limit`,
  `filters[<field>]=<value>` (exact match, repeatable, e.g. `filters[state]=Delhi&filters[pollutant_id]=PM2.5`;
  verified returns the filtered `total`). Response: `{index_name, title, org[], updated_date, field[{id,name,type}],
  total, count, limit, offset, records[]}`. `fields=a,b` also works (verified) but is not in the swagger box.
  Field ids and CSV header labels differ (see AQI below); JSON uses `id`.
- **Public test key:** `579b464db66ec23bdd00000139f4fba62cd0440c6255076c063dbc6c` (printed on the page). It
  **caps `limit` at 10 records per call** (asked for 4000 and 100000, got 10) and is shared, so it hits
  `429 {"error":"Rate limit exceeded"}` after a burst of roughly 10 calls; a second widely-circulated sample key
  was already 429 for ~20 minutes. Use it only for field/shape checks, spaced a few seconds apart.
- **Personal-key limits are not documented** on any data.gov.in page I could read (FAQ is NDSAP policy only;
  Help has only a video). Treat as unknown: per-call `limit` cap (community reports say up to ~1000, unverified)
  and request quota. Design for paging (`offset`) and one fetch per hour, not per page view.
  **Action for T3:** with the real key, call `limit=4000` once and check `count`; if it comes back capped, page.
- **Browser-side:** the API answered a cross-origin `fetch` from data.gov.in with `200`, but 429 responses carry
  no CORS headers (shows as "Failed to fetch"). Always call from the server.
- **Freshness trap:** the `updated_date` returned by the API and the "Updated On" shown on the page are portal
  metadata times. Check the newest data row instead (CWC reservoirs say updated 2026-10-15 but their newest
  2026 rows are from April).
- **Catalog discovery (undocumented, used by the site itself):**
  `GET https://www.data.gov.in/backend/dmspublic/v1/search?query=<q>&limit=100&offset=0&filters[type]=resources&sort[_score]=desc`
  returns `data.rows[]` with `uuid` (the resource id), `title`, `node_alias`, `changed`, `is_api_available`,
  `catalog_resource_ministry[]`. 368k resources total; `/apis` lists ~185k API-enabled ones. Fine for a one-off
  lookup script; do not depend on it at runtime. `www.data.gov.in` blocks bot-style User-Agents via WebFetch (403);
  a normal browser UA gets an empty JS shell, so use the backend search above.

## 2. Verification of what the app already uses

### CPCB real-time AQI — `3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69` (exists, live)

- Publisher CPCB (MoEFCC). Granularity "Hourly"; `updated_date` 2026-10-22T06:02Z when rows said
  `last_update 22-10-2026 11:00:00` (IST). 3,689 rows (one row per station x pollutant); `filters[pollutant_id]=PM2.5`
  gives 527 rows.
- **JSON field ids:** `country, state, city, station, last_update, latitude, longitude, pollutant_id, min_value,
  max_value, avg_value`. The CSV header and the web UI call the last three `pollutant_min/max/avg`; the JSON
  does **not**. `aqi.ts` accepts `pollutant_avg ?? avg_value`, so it works, but `lib/ingest/__fixtures__/cpcb.json`
  uses the CSV names plus a made-up `id`; replace it with the real shape. `last_update` format `DD-MM-YYYY HH:mm:ss`
  matches `parseCpcbTime`. All values are strings, `"NA"` appears; lat/lng present on rows (strings).
- **`avg_value` is a pollutant concentration, not a sub-index.** Evidence: PM10 71 with min 67 / max 78, NH3 7,
  SO2 7, and CO 73 / 9 on neighbouring rows. The code comment ("pollutant_avg is the sub-index, max across
  pollutants") is wrong and will mis-rank stations: a CO or ozone raw number can beat PM. Fix: compute NAQI
  sub-indices per pollutant from CPCB breakpoints (PM2.5, PM10, NO2, SO2, NH3, 8-h ozone, CO), take the max, and
  only report a station if PM2.5 or PM10 is present (CPCB's own rule is >=3 pollutants incl. a PM). `lib/india/aqi.ts`
  already has PM breakpoints. The CO unit looks off (73 would be mg/m3 on a huge scale): exclude CO unless the
  unit is confirmed. Each row is the last hourly average, not a 24-h average, so the result is "instantaneous
  NAQI", not CPCB's official 24-h number; label it as such.
- Hourly refresh, so cron every 1 h is enough.

### Agmarknet daily mandi prices — `9ef84268-d588-465a-a308-a864a43d0070` (exists, daily)

- Publisher: Directorate of Marketing & Inspection, Dept of Agriculture. `updated_date` 2026-10-22T06:00Z,
  all rows `arrival_date` 22/10/2026 (today only; the resource is a rolling current-day snapshot).
- Field ids: `state, district, market, commodity, variety, grade, arrival_date (dd/mm/yyyy), min_price, max_price,
  modal_price` (numbers, Rs/quintal). **Matches `mandi.ts` exactly**, including `filters[commodity]=Onion`.
- Totals with the commodity filter: Onion 352, Tomato 246, Potato 274, Wheat 30, Rice 16 (all commodities: 7,815).
  All under 2000, so `limit=2000` is safe if the personal key allows it. Rice/Wheat are thin; consider "Paddy(Dhan)"
  or "Wheat" only from main states, or drop them from the national median.
- History for the same data: `35985678-0d79-46b4-9ed6-6f13308a1d24` "Variety-wise Daily Market Prices Data of
  Commodity" (2014-present, 82.6M rows, updated 2026-10-21; fields `Arrival_Date (MM/DD/YYYY?), Commodity, District,
  Grade, Market, Max_Price, Min_Price, Modal_Price, State, Variety`, capitalised; sample row date `10/01/2014`
  is ambiguous, check before parsing). Use with `filters[Commodity]=Onion&filters[State]=...` for trend sparklines.

## 3. Candidates (only ones found; "Verified" = I called the API this session)

| Rank | Dataset | Resource id | Freshness | Granularity | Use in app | Effort |
|---|---|---|---|---|---|---|
| 1 | NFHS-5 India Districts Factsheets (MoHFW/IIPS) | `cf80173e-fece-439d-a0b1-6e9cb510593d` | Static (2019-21; API shows 707 rows, wide table: one column per indicator, e.g. `Sex_Ratio`, `Household_Electricity`) | District | Roadmap F5 choropleth (anaemia, sanitation, electricity, sex ratio...). Join `District_Names`+`State_UT` to the 2011 district polygons; ~780 vs 707 names, so a fuzzy-match table is needed | M (name join) |
| 2 | MGNREGA district-wise "Data at a Glance" (Dept of Land Resources / Rural Dev) | `ee03643a-ee4c-48c2-ac30-9f2ff26ab722` | Updated 2026-10-20 (415,834 rows; `fin_year, month, state_code, district_code, district_name, Approved_Labour_Budget, Average_Wage_rate_per_day_per_person, Average_days_of_employment...`). Verified | District x month | Choropleth/panel: employment days, wage rate, budget used for latest month | M |
| 3 | Jal Jeevan Mission households with piped water (Dept of Drinking Water) | `a7d77b40-59c7-4157-b29b-e114f7ec6c01` | Updated 2026-10-21 (`data_gov_update_date`), 1.69M rows habitation level; fields `district_name, block_name, panchayat_name, habitation_*, households, house_connection_by_pws, sc/st/gen pop`. Verified | Habitation (aggregate to district/state) | District choropleth of tap-water coverage; needs server-side aggregation (too many rows to page live: precompute weekly) | L |
| 4 | Agmarknet variety-wise daily prices, 2014-now | `35985678-0d79-46b4-9ed6-6f13308a1d24` | Updated 2026-10-21, 82.6M rows. Verified | Market x variety x day | Price history and week-on-week change for mandi panel; always filter by commodity + state + date | M |
| 5 | CWC daily reservoir level & storage | `1fc2148c-fc41-46f5-a364-bdc03f77053f` | Metadata updated 2026-10-15 but **newest 2026 rows are April** (Year=2026 has data for Month 02 and 04, none for 06/08/09/10). Fields `Reservoir_name, Basin, Lat, Long, Date, Full_reservoir_level, Live_capacity_FRL, Storage, Level`. 2.17M rows from 2012. Verified | Reservoir (lat/lng) | Map layer would be 6 months stale; not usable as "live". Use CWC's own weekly bulletin/India-WRIS instead | skip |
| 6 | NWIC daily sub-basin rainfall (IMD grid) | `da428447-700a-41e9-a56a-d7855ffb672f` | Last updated 2025-12-31 (446,793 rows; `Basin, Subbasin, Date, Avg_rainfall`). Verified | Sub-basin | Stale for live use; historical climatology only | skip |
| 7 | State/UT-wise road accidents 2021-24 (MoRTH) | `f7361f93-77ab-420c-a9a3-d4654b4d7d3a` | Annual, 37 rows. Verified | State | State choropleth (accidents, fatalities per year) as a static layer | S |
| 8 | NCRB crime head-wise tables (e.g. crimes against foreigners) | `e5d50c9f-74a6-48a7-8972-3789c1f132c2` | Annual, updated 2026-07; many separate per-table resources (41 rows each). Verified | State/crime head | Static state panel; many tables, pick 2-3 headline ones | M |
| 9 | Indian Railways timetable | `13051d52-05c2-4130-9e7b-891bdde84076` | Static, 2018 (186k rows). Verified | Train x station | Not useful for live; station geometry only | skip |
| 10 | Rainfall, power supply position, fuel prices, CPI/WPI, groundwater, cyclone, earthquake, flood | various | **Nothing live found.** Power supply position `1c5efb6a...` is April 2014; petrol/diesel by town `c2b81e18...` is Feb 2025; IMD cyclone/temperature series are annual; no CPI/WPI or groundwater API resource turned up. Some ids (`7ed570cc` DWLR, `785c3f36` HMIS, `99827020` ECI electors/candidates) returned a bodyless error on the test key | n/a | Keep Vidyut PRAVAH (power), SACHET/IMD (rain, cyclones), NCS (quakes), MOSPI for CPI | n/a |

Non-live observation: the portal's own "Real time" and "Daily" searches surface only AQI and mandi as genuinely
live. Everything else on the catalog for these categories is annual, monthly-at-best, or a one-off table.

## 4. Where data.gov.in is the wrong source

- **Weather/rain/floods/cyclones:** SACHET (already used) or the IMD API (key + IP whitelist, roadmap F3) is live;
  data.gov.in rainfall resources are annual or stale.
- **Reservoirs:** data.gov.in CWC table lags ~6 months; use CWC's weekly storage bulletin or India-WRIS.
- **Power:** keep Vidyut PRAVAH / Grid-India; data.gov.in has only historical monthly tables.
- **AQI:** the OGD feed is the only free official station feed; keep Open-Meteo as fallback.

## 5. Recommended next 3

1. **T3: fix and verify AQI with a real key.** Replace fixtures with the real JSON shape (`avg_value` etc.),
   compute NAQI per pollutant rather than max of raw concentrations, handle `"NA"`, check the personal key's
   `limit` cap and page with `offset` if capped. Highest value: it is the only live OGD feed and the current logic is wrong.
2. **Mandi (T3 second half) plus history.** Current resource already matches `mandi.ts`; add Rice/Wheat caveat, then
   use `35985678...` to add 7-day change per commodity/state.
3. **F5 NFHS-5 district choropleth** (`cf80173e...`), then MGNREGA (`ee03643a...`) as a second monthly district
   layer using the same district-name join table.

## 6. Gotchas to add to ROADMAP

- Test key = 10 records per call and shared 429s; do not use it in tests that loop.
- `updated_date` is portal metadata, not observation date; verify by the newest row (`filters[Year]`, etc).
- JSON field ids differ from CSV/web labels (`avg_value` vs `pollutant_avg`).
- Resource ids for datasets (uuid in search) sometimes return a bodyless error: always `limit=1` smoke-call before wiring.
