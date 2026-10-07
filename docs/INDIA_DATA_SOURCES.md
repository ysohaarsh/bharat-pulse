# India data sources — what's free, what works, what we use

Research catalog behind Bharat Pulse. "Verified" means we called the endpoint from code on
**2026-10-05** and parsed a real response (saved fixtures live in `lib/ingest/__fixtures__/`).

## In the app (v1)

| Source | What | Endpoint | Auth | Status | Used by |
|---|---|---|---|---|---|
| **NDMA SACHET** (C-DOT CAP) | Every live govt warning: IMD weather, CWC river floods, INCOIS, 30+ state SDMAs | `https://sachet.ndma.gov.in/cap_public_website/FetchAllAlertDetails` (JSON); RSS `…/rss/rss_india.xml`; CAP XML `…/FetchXMLFile?identifier=` | none | ✅ verified — ~40 alerts, `centroid`, `severity_color`, `actual_lang` (en/hi/bn/te/kn…) | `lib/ingest/sachet.ts` |
| **NCS / RISEQ** (MoES) | Earthquakes in and around India | `https://riseq.seismo.gov.in/riseq/earthquake` | none | ✅ verified — no JSON API; ~150 events embedded as `data-json='…'` attributes | `lib/ingest/ncs.ts` |
| **NASA FIRMS** | Satellite fire hotspots (VIIRS NRT) | `https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/VIIRS_SNPP_NRT/67,5,98.5,38/1` | free MAP_KEY | ⚠️ format from docs (needs key); no Indian fire API exists (FSI/Bhuvan are UI-only) | `lib/ingest/firms.ts` |
| **CPCB real-time AQI** via data.gov.in | Station-level pollutant sub-indices | `https://api.data.gov.in/resource/3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69?api-key=…&format=json` | free data.gov.in key | ⚠️ unverified — `api.data.gov.in` refused connections from the research sandbox (www.data.gov.in was fine). Parser accepts both field-name variants seen in published samples | `lib/ingest/aqi.ts` |
| **Open-Meteo Air Quality** | Modelled PM2.5/PM10 (CAMS) → India NAQI | `https://air-quality-api.open-meteo.com/v1/air-quality` | none | ✅ verified — AQI fallback for 50 cities when no OGD key | `lib/ingest/aqi.ts` |
| **PIB** | All Government of India press releases | `https://www.pib.gov.in/RssMain.aspx?ModId=6&Lang=2&Regid=3` | none | ✅ verified — **every** language/region param redirects to the Hindi feed; items have no dates; 403 for bot-style User-Agents | `lib/ingest/pib.ts` |
| **Indian news RSS** | The Hindu, Indian Express, Hindustan Times, ThePrint, BusinessLine, BBC Hindi | see `NEWS_FEEDS` in `lib/ingest/news.ts` | none | ✅ verified (Mongabay India: Cloudflare challenge → dropped) | `lib/ingest/news.ts` |
| **Sports RSS** | The Hindu sport, ESPNcricinfo | see `SPORTS_FEEDS` | none | ✅ verified | `lib/ingest/sports.ts` |
| **Vidyut PRAVAH** (Ministry of Power) | Live all-India demand (GW), exchange price, shortages | `https://vidyutpravah.in/PXDashboard/BindTopStatisticsFromJS` | none | ✅ verified — JSON whose values are HTML snippets | `lib/jobs/power.ts` |
| **Agmarknet** via data.gov.in | Daily mandi modal prices, 6k+ markets | resource `9ef84268-d588-465a-a308-a864a43d0070` | free data.gov.in key | ⚠️ unverified end-to-end (same sandbox issue) | `lib/jobs/mandi.ts` |
| **sansad.in** (Parliament) | All sitting Lok Sabha MPs: party, constituency, photo, official email | `https://sansad.in/api_ls/member?loksabha=18&page=1&size=600&locale=en` | none | ✅ verified — 544 rows (deaths/resignations kept with a `status`); all sitting MPs join to a seat polygon | `lib/jobs/sansad.ts` |
| **OpenStreetMap Overpass** | Metro, rail and highway works tagged `construction` | `https://overpass-api.de/api/interpreter` (+ kumi.systems mirror) | none | ✅ verified — ~1–6 s per state for rail/roads; `landuse=construction` takes ~30 s/state and is skipped. Public instances stall at times → per-state timeout + rotation | `lib/jobs/osm.ts` |
| **DataMeet maps** (MIT) | Survey of India outline, states, 2011 districts, assembly seats | `github.com/datameet/maps` | none | ✅ | `scripts/build-geo.mjs` |
| **shijithpk/2024_maps_supplement** (public domain) | 543 Lok Sabha seats after the 2023 Assam/J&K delimitation; new J&K + Sikkim assembly maps | `github.com/shijithpk/2024_maps_supplement` | none | ✅ | `scripts/build-geo.mjs` |
| **ECI results portal** (official; no licence stated, public record of the gazetted Delimitation Order 2023) | Assam's 126 assembly seats after the 2023 delimitation (AC_NO 1–126, ECI names) | `https://results.eci.gov.in/ResultAcGenMay2026/ac/S03.js` (GeoJSON in a `var json_All_AC =` wrapper; same pattern serves S11 Kerala, S22 TN, S25 WB, U07 Puducherry) | none | ✅ verified 2026-10-07 — 126 features, 124 Polygon + 2 MultiPolygon, no district column; ~15× denser than DataMeet. Mirror: `github.com/saisantoshv3/assemnbly_gis_files` (no licence) | `scripts/build-geo.mjs` |
| **India Post pincode API** | Pincode → post office, district, state | `https://api.postalpincode.in/pincode/{pin}` | none | ✅ verified (CORS open) | `app/api/pincode/route.ts` |
| **Bhashini** (MeitY) | Translation/ASR/TTS, 22 languages | ULCA pipeline `getModelsPipeline` → inference callback | free account | ⚠️ needs your keys; flow per Bhashini docs | `lib/i18n/providers.ts` |
| **Sarvam AI** | Translation (`sarvam-translate:v1`), TTS | `https://api.sarvam.ai/translate` | ₹100 free credits | ⚠️ needs your key | `lib/i18n/providers.ts` |

## Linked, not copied

| Source | Why only a link |
|---|---|
| **MyNeta / ADR** — candidate assets, criminal cases, education | ADR declined bulk-scraping permission to whoismyneta.com (see aman.bh/blog/2024/text-fragments). We deep-link to MyNeta search instead. |
| **PRS MP Track** — attendance, questions, debates | Linked by slug: `prsindia.org/mptrack/18th-lok-sabha/<name-slug>` (verified). |
| **MPLADS eSAKSHI** — MP fund works | Public dashboard (revamped March 2026), no documented API. Linked. |

## Gated — apply now, add in v1.1

- **IMD API** (`api.imd.gov.in/api/v1/districtwarning`, `districtnowcast`, city forecasts): key **and IP whitelisting** ("IP … needs to be whitelisted"). SACHET already carries IMD alerts meanwhile.
- **Delhi Open Transit Data** GTFS-RT (`otd.delhi.gov.in/api/realtime/VehiclePositions.pb?key=`): free key on request — live DTC buses.
- **Ola Maps** (free tier, prepaid from 1 Sep 2026) / **Mappls**: geocoding and autocomplete with official boundaries.
- **OpenSky** (anonymous, India bbox): live flights over India — verified working, capped credits.
- **NFHS-5 district indicators** (data.gov.in): static choropleths, e.g. menstrual hygiene and anaemia by district. This is the real India-wide women's-health data; period-tracker apps don't publish aggregates.
- **OpenCity.in** (CKAN, verified): Bengaluru GBA 2025 wards (369) + BBMP Fix-My-Street pothole history → ward/corporator layer for Bengaluru.

## Skipped

- **Wikidata** for MPs: only 2 of 543 current members have the 18th Lok Sabha qualifier.
- **CPPP / GeM tenders**: CAPTCHA + ToS. **NSE/BSE**: cookie walls. **eCourts**: CAPTCHA.
- **GDELT**: works but 1 request / 5 s and largely duplicates the RSS feeds.
- **Wearables (Ultrahuman, WHOOP clones)**: per-user OAuth partner APIs; no public aggregate data.
- **INCOIS tsunami**: no clean feed; its alerts reach SACHET anyway.

## Builder-scene notes (X/Twitter, GitHub)

X isn't directly searchable with our tools; we followed indexed posts and their GitHub links:
Gaurav Sen's open-sourced **Pothole Reporter** (detect → find contractor → draft complaint),
**whoismyneta.com** (github.com/thedivtagguy/website), **MausamNow** (CPCB AQI + crowdsourced rain),
many **SIH 2026** IMD/MPLADS projects (e.g. JanDrishti, mplads-sentinel), and **noop**, an
open-source WHOOP client (not Indian). They shaped the civic-report and neta features.

## Known data gaps

- Assembly seats outside J&K, Sikkim and Assam are DataMeet's 2008-delimitation map (current for
  those states). The file predates Telangana — seats are assigned to states spatially. Assam uses
  ECI's post-2023 map; its `district` is the Census 2011 district at each seat's interior point.
  Checked: DataMeet `maps` has no post-2023 Assam AC file; shijithpk's supplement has Assam PCs only.
- Districts are Census 2011 (~640; India has ~780 today).
- MLA names are not loaded yet (no national open API) — the panel shows the seat and links out.
- Machine translations can be wrong; the original text is always shown alongside.
