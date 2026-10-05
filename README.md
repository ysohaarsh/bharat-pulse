# BHARAT PULSE — India Situation Monitor

India on one live map: official disaster alerts, earthquakes, satellite fires, air quality, power
demand, mandi prices, development projects, citizen-reported potholes, and **who represents any
point in India**. Bilingual (English / हिन्दी) with machine translation into 12 Indian languages.

Forked from [Pulse](../../2/pulse) (a world monitor) and rebuilt around free, mostly Indian
government data. Full source research: [`docs/INDIA_DATA_SOURCES.md`](docs/INDIA_DATA_SOURCES.md).

## Features

- **India map** (MapLibre, flat, India-centred). Borders come from the Survey of India based
  outline (DataMeet), not OpenStreetMap's lines of control.
- **Live feed** over Supabase Realtime. Sources: NDMA SACHET (IMD, CWC, state SDMAs), NCS earthquakes,
  NASA FIRMS fires, CPCB AQI, PIB press releases and six Indian news feeds. Filters live in the URL.
- **India now** panel: IST clock, threat index, live all-India power demand with a 24h sparkline,
  worst-AQI cities, mandi prices, top states, priority alerts.
- **Who represents this place?** Click anywhere, use your location or type a pincode to get
  state, district, Lok Sabha seat and sitting MP (sansad.in), plus the assembly seat. Links go out
  to MyNeta (assets and criminal cases), PRS and MPLADS eSAKSHI. PostGIS point-in-polygon.
- **Civic reports**: pin a pothole, garbage pile, broken streetlight or waterlogging, add a photo,
  and others can "me too" it. Each report is tagged with its ward/MP/MLA seat.
- **Development layer**: metro, rail and highway works under construction (OpenStreetMap).
- **Indic AI**: alerts arrive in Telugu, Hindi, Bengali…; headlines are machine-translated to
  English and Hindi (Bhashini → Sarvam fallback, cached forever). Any event can be read in 12
  languages, and the daily India Brief has a Hindi edition.
- Inherited from Pulse: accounts, watchlists (now by state) with alerts, /stats, the daily brief.

## Stack (all free tier)

Next.js 16 · React 19 · Tailwind v4 · Supabase (Postgres + **PostGIS**, Auth, Realtime, Storage,
pg_cron) · MapLibre GL + OpenFreeMap · Vitest · Playwright · Vercel.

## Architecture

```
pg_cron ──POST /api/ingest?source=…──▶ ingesters (sachet, ncs, firms, aqi, pib, news, sports)
                                        │ fetchRaw → zod-validated normalize() (+ metrics())
                                        ▼
                          events ◀── trigger fills state/district from PostGIS boundaries
                            │   └── trigger → alerts for matching watchlists
                            ▼
                     Realtime → map + feed

        jobs: power, mandi (metrics) · sansad (representatives) · osm (projects) · translate
        boundaries (state/district/pc/ac) ← scripts/load-boundaries.mjs ← scripts/build-geo.mjs
        whois(lat,lng) RPC → "who represents this place"
```

## Setup

```bash
npm install
cp .env.example .env.local            # Supabase URL/keys, CRON_SECRET (32+ chars), optional API keys
# 1. New Supabase project → apply supabase/migrations/*.sql (SQL editor or `npx supabase db push`)
# 2. Boundaries (downloads ~70 MB of open data once, then loads ~4,800 polygons):
npm run geo:build
npm run geo:load
# 3. Run it and pull data once:
npm run dev
for s in sansad sachet ncs aqi power pib news sports osm; do
  curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/ingest?source=$s"; echo
done
```

In production, add the two Vault secrets described in `supabase/migrations/20261005130000_cron_jobs.sql`
and pg_cron does the rest.

### Free keys worth getting

| Key | For | Without it |
|---|---|---|
| `DATA_GOV_IN_API_KEY` | CPCB station AQI, mandi prices | AQI uses modelled Open-Meteo values; no mandi panel |
| `FIRMS_MAP_KEY` | Satellite fire hotspots | No fire layer |
| `BHASHINI_USER_ID` + `BHASHINI_ULCA_API_KEY` | Translation | Alerts stay in their original language |
| `SARVAM_API_KEY` | Fallback translation | — |
| `LLM_API_KEY` (Groq etc.) | AI-written India Brief | Extractive brief |

Also apply early for the **IMD API** (needs IP whitelisting) and **Delhi OTD** GTFS-RT.

```bash
npm run lint && npm run typecheck && npm test   # unit tests (fixtures, no network)
npm run test:e2e                                # Playwright
```

## Licences and credits

Code: MIT. Boundaries: DataMeet (MIT) and shijithpk/2024_maps_supplement (public domain).
Map data © OpenStreetMap contributors. Government data from NDMA, NCS, CPCB, PIB, Ministry of Power,
Agmarknet and Parliament of India; NASA FIRMS. Candidate affidavit data belongs to ADR/MyNeta and is
only linked.
