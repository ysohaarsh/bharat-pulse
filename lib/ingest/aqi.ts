import { z } from "zod";
import { aqiBand, naqiFromPm, naqiSubIndex } from "@/lib/india/aqi";
import { stateByName } from "@/lib/india/states";
import type { MetricRow, NormalizedEvent, Severity } from "@/lib/types";
import { detectPlace } from "./geo";
import { fetchOgdPages } from "./ogd";
import type { Ingester } from "./types";

/**
 * Air quality, two ways:
 * 1. CPCB's real-time station feed via the Open Government Data API (data.gov.in, free key in
 *    DATA_GOV_IN_API_KEY). One row per station x pollutant: `min_value/max_value/avg_value` are the
 *    last hour's RAW CONCENTRATIONS (not sub-indices; verified 2026-10-22), values may be "NA".
 *    Rows are grouped per station and each pollutant is converted to a CPCB NAQI sub-index
 *    (`naqiSubIndex`, breakpoints in lib/india/aqi.ts). Station AQI = the highest sub-index, only
 *    when >= 3 pollutants are valid and at least one is PM2.5/PM10 (CPCB's reporting rule).
 *    Hourly averages stand in for the 24-h (PM, NO2, SO2, NH3) and 8-h (O3) averages, so this is an
 *    "instantaneous NAQI", not CPCB's official daily figure.
 *    CO is EXCLUDED: the feed's CO numbers (e.g. 25-119) are not mg/m3 (NAQI expects ~0-35) and the
 *    unit is undocumented, so a sub-index from them would be nonsense (docs/DATA_GOV_IN.md).
 * 2. Fallback (no key, or CPCB down): Open-Meteo's CAMS model for 50 large cities, converted to
 *    India's NAQI from PM2.5/PM10. Modelled, not measured — flagged as such in `meta`.
 *
 * Every station/city becomes a metric (panel + map layer). Cities at "Very Poor" or worse also
 * become one event per city per day.
 */
export const OGD_AQI_RESOURCE = "3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69";
export const OGD_PAGE_LIMIT = 4000;
export const ogdAqiUrl = (key: string, offset = 0) =>
  `https://api.data.gov.in/resource/${OGD_AQI_RESOURCE}?api-key=${encodeURIComponent(key)}&format=json&limit=${OGD_PAGE_LIMIT}&offset=${offset}`;

/** Largest cities by population (plus a few state capitals), for the Open-Meteo fallback. */
export const AQI_CITIES: readonly { city: string; state: string; lat: number; lng: number }[] = [
  { city: "Delhi", state: "IN-DL", lat: 28.61, lng: 77.21 }, { city: "Mumbai", state: "IN-MH", lat: 19.08, lng: 72.88 },
  { city: "Kolkata", state: "IN-WB", lat: 22.57, lng: 88.36 }, { city: "Chennai", state: "IN-TN", lat: 13.08, lng: 80.27 },
  { city: "Bengaluru", state: "IN-KA", lat: 12.97, lng: 77.59 }, { city: "Hyderabad", state: "IN-TS", lat: 17.39, lng: 78.49 },
  { city: "Ahmedabad", state: "IN-GJ", lat: 23.02, lng: 72.57 }, { city: "Pune", state: "IN-MH", lat: 18.52, lng: 73.86 },
  { city: "Surat", state: "IN-GJ", lat: 21.17, lng: 72.83 }, { city: "Jaipur", state: "IN-RJ", lat: 26.91, lng: 75.79 },
  { city: "Lucknow", state: "IN-UP", lat: 26.85, lng: 80.95 }, { city: "Kanpur", state: "IN-UP", lat: 26.45, lng: 80.33 },
  { city: "Nagpur", state: "IN-MH", lat: 21.15, lng: 79.09 }, { city: "Indore", state: "IN-MP", lat: 22.72, lng: 75.86 },
  { city: "Bhopal", state: "IN-MP", lat: 23.26, lng: 77.41 }, { city: "Patna", state: "IN-BR", lat: 25.59, lng: 85.14 },
  { city: "Ludhiana", state: "IN-PB", lat: 30.9, lng: 75.86 }, { city: "Agra", state: "IN-UP", lat: 27.18, lng: 78.01 },
  { city: "Varanasi", state: "IN-UP", lat: 25.32, lng: 82.97 }, { city: "Ghaziabad", state: "IN-UP", lat: 28.67, lng: 77.45 },
  { city: "Noida", state: "IN-UP", lat: 28.54, lng: 77.39 }, { city: "Gurugram", state: "IN-HR", lat: 28.46, lng: 77.03 },
  { city: "Faridabad", state: "IN-HR", lat: 28.41, lng: 77.32 }, { city: "Chandigarh", state: "IN-CH", lat: 30.73, lng: 76.78 },
  { city: "Guwahati", state: "IN-AS", lat: 26.14, lng: 91.74 }, { city: "Bhubaneswar", state: "IN-OD", lat: 20.3, lng: 85.82 },
  { city: "Ranchi", state: "IN-JH", lat: 23.34, lng: 85.31 }, { city: "Raipur", state: "IN-CG", lat: 21.25, lng: 81.63 },
  { city: "Dehradun", state: "IN-UK", lat: 30.32, lng: 78.03 }, { city: "Srinagar", state: "IN-JK", lat: 34.08, lng: 74.8 },
  { city: "Jammu", state: "IN-JK", lat: 32.73, lng: 74.86 }, { city: "Kochi", state: "IN-KL", lat: 9.93, lng: 76.27 },
  { city: "Thiruvananthapuram", state: "IN-KL", lat: 8.52, lng: 76.94 }, { city: "Visakhapatnam", state: "IN-AP", lat: 17.69, lng: 83.22 },
  { city: "Vijayawada", state: "IN-AP", lat: 16.51, lng: 80.65 }, { city: "Coimbatore", state: "IN-TN", lat: 11.02, lng: 76.96 },
  { city: "Madurai", state: "IN-TN", lat: 9.93, lng: 78.12 }, { city: "Mysuru", state: "IN-KA", lat: 12.3, lng: 76.64 },
  { city: "Amritsar", state: "IN-PB", lat: 31.63, lng: 74.87 }, { city: "Jodhpur", state: "IN-RJ", lat: 26.24, lng: 73.02 },
  { city: "Prayagraj", state: "IN-UP", lat: 25.44, lng: 81.85 }, { city: "Meerut", state: "IN-UP", lat: 28.98, lng: 77.71 },
  { city: "Muzaffarpur", state: "IN-BR", lat: 26.12, lng: 85.39 }, { city: "Gaya", state: "IN-BR", lat: 24.79, lng: 85.0 },
  { city: "Shillong", state: "IN-ML", lat: 25.58, lng: 91.89 }, { city: "Imphal", state: "IN-MN", lat: 24.82, lng: 93.94 },
  { city: "Agartala", state: "IN-TR", lat: 23.83, lng: 91.29 }, { city: "Panaji", state: "IN-GA", lat: 15.49, lng: 73.83 },
  { city: "Puducherry", state: "IN-PY", lat: 11.94, lng: 79.81 }, { city: "Shimla", state: "IN-HP", lat: 31.1, lng: 77.17 },
];

export const openMeteoUrl = () =>
  `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${AQI_CITIES.map((c) => c.lat).join(",")}` +
  `&longitude=${AQI_CITIES.map((c) => c.lng).join(",")}&current=pm2_5,pm10&timezone=Asia%2FKolkata`;

export type AqiRaw =
  | { kind: "cpcb"; fetchedAt: string; records: unknown[] }
  | { kind: "openmeteo"; fetchedAt: string; results: unknown[] };

interface Reading {
  id: string;
  label: string;
  city: string;
  state: string | null;
  lat: number | null;
  lng: number | null;
  aqi: number;
  dominant: string | null;
  /** Sub-index per contributing pollutant (CPCB readings only). */
  subIndices?: Record<string, number>;
  observedAt: string;
  modelled: boolean;
}

const num = z.preprocess((v) => (v === "NA" || v === "" || v == null ? null : Number(v)), z.number().finite().nullable());

const CpcbRecord = z.object({
  state: z.string().min(1),
  city: z.string().min(1),
  station: z.string().min(1),
  last_update: z.string().min(1),
  pollutant_id: z.string().min(1),
  avg_value: num.optional(),
  latitude: num.optional(),
  longitude: num.optional(),
});

/** "05-10-2026 09:00:00" (IST) → ISO. */
export function parseCpcbTime(s: string): string | null {
  const m = /^(\d{2})-(\d{2})-(\d{4}) (\d{2}:\d{2}:\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}+05:30`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const PM_POLLUTANTS = new Set(["PM2.5", "PM10"]);

export function readingsFromCpcb(records: unknown[]): Reading[] {
  interface Station extends Omit<Reading, "aqi" | "dominant" | "subIndices"> {
    sub: Map<string, number>;
  }
  const stations = new Map<string, Station>();
  for (const r of records) {
    const p = CpcbRecord.safeParse(r);
    if (!p.success) continue;
    const rec = p.data;
    const observedAt = parseCpcbTime(rec.last_update);
    if (!observedAt) continue;
    const id = `cpcb:${rec.station}`;
    let st = stations.get(id);
    if (!st) {
      const stateName = rec.state.replace(/_/g, " ");
      const hasXy = rec.latitude != null && rec.longitude != null;
      const place = hasXy ? null : detectPlace(`${rec.city}, ${stateName}`);
      st = {
        id,
        label: rec.station,
        city: rec.city,
        state: stateByName(stateName)?.code ?? place?.state ?? null,
        lat: rec.latitude ?? place?.lat ?? null,
        lng: rec.longitude ?? place?.lng ?? null,
        observedAt,
        modelled: false,
        sub: new Map(),
      };
      stations.set(id, st);
    }
    if (observedAt > st.observedAt) st.observedAt = observedAt;
    // "NA" -> null -> skipped; CO and unknown pollutants have no breakpoints -> NaN -> skipped.
    const value = rec.avg_value ?? null;
    if (value == null) continue;
    const sub = naqiSubIndex(rec.pollutant_id, value);
    if (!Number.isNaN(sub)) st.sub.set(rec.pollutant_id, sub);
  }
  const out: Reading[] = [];
  for (const { sub, ...st } of stations.values()) {
    // CPCB rule: at least 3 pollutants, one of them PM2.5 or PM10.
    if (sub.size < 3 || ![...sub.keys()].some((k) => PM_POLLUTANTS.has(k))) continue;
    const [dominant, aqi] = [...sub.entries()].reduce((a, b) => (b[1] > a[1] ? b : a));
    out.push({ ...st, aqi, dominant, subIndices: Object.fromEntries(sub) });
  }
  return out;
}

const OpenMeteoResult = z.object({
  latitude: z.number(),
  longitude: z.number(),
  current: z.object({ time: z.string(), pm2_5: z.number().nullable(), pm10: z.number().nullable() }),
});

export function readingsFromOpenMeteo(results: unknown[]): Reading[] {
  const out: Reading[] = [];
  results.forEach((r, i) => {
    const city = AQI_CITIES[i];
    const p = OpenMeteoResult.safeParse(r);
    if (!city || !p.success) return;
    const aqi = naqiFromPm(p.data.current.pm2_5, p.data.current.pm10);
    if (Number.isNaN(aqi)) return;
    // `time` is local (we asked for Asia/Kolkata) without an offset.
    const observed = new Date(`${p.data.current.time}:00+05:30`);
    out.push({
      id: `model:${city.city}`,
      label: city.city,
      city: city.city,
      state: city.state,
      lat: city.lat,
      lng: city.lng,
      aqi,
      dominant: null,
      observedAt: Number.isNaN(observed.getTime()) ? new Date().toISOString() : observed.toISOString(),
      modelled: true,
    });
  });
  return out;
}

function readings(raw: AqiRaw): Reading[] {
  if (raw?.kind === "cpcb" && Array.isArray(raw.records)) return readingsFromCpcb(raw.records);
  if (raw?.kind === "openmeteo" && Array.isArray(raw.results)) return readingsFromOpenMeteo(raw.results);
  return [];
}

export function severityForAqi(aqi: number): Severity {
  if (aqi > 400) return 5;
  if (aqi > 300) return 4;
  if (aqi > 200) return 3;
  if (aqi > 100) return 2;
  return 1;
}

/** IST calendar date, for one-event-per-city-per-day ids. */
const istDate = (iso: string) => new Date(new Date(iso).getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);

export const EVENT_THRESHOLD = 300;

export const aqiIngester: Ingester<AqiRaw> = {
  source: "aqi",

  async fetchRaw() {
    const fetchedAt = new Date().toISOString();
    const key = process.env.DATA_GOV_IN_API_KEY;
    if (key) {
      try {
        const { records } = await fetchOgdPages((offset) => ogdAqiUrl(key, offset), { maxCalls: 6 });
        if (records.length > 0) return { kind: "cpcb", fetchedAt, records };
      } catch {
        // fall through to the modelled fallback
      }
    }
    const res = await fetch(openMeteoUrl(), { signal: AbortSignal.timeout(20_000), cache: "no-store" });
    if (!res.ok) throw new Error(`Open-Meteo air quality failed: ${res.status}`);
    const body = await res.json();
    return { kind: "openmeteo", fetchedAt, results: Array.isArray(body) ? body : [body] };
  },

  normalize(raw) {
    // Worst reading per city.
    const byCity = new Map<string, Reading>();
    for (const r of readings(raw)) {
      const key = `${r.state ?? ""}|${r.city.toLowerCase()}`;
      const prev = byCity.get(key);
      if (!prev || r.aqi > prev.aqi) byCity.set(key, r);
    }
    const out: NormalizedEvent[] = [];
    for (const r of byCity.values()) {
      if (r.aqi <= EVENT_THRESHOLD) continue;
      const band = aqiBand(r.aqi);
      out.push({
        source: "aqi",
        external_id: `aqi:${r.state ?? "IN"}:${r.city.toLowerCase()}:${istDate(r.observedAt)}`,
        title: `${r.city} air quality ${band.label}: AQI ${r.aqi}`,
        summary: r.modelled
          ? "Modelled from CAMS PM2.5/PM10 (Open-Meteo), converted to India's NAQI."
          : `Worst CPCB station: ${r.label}${r.dominant ? ` · dominant pollutant ${r.dominant}` : ""}`,
        category: "air",
        severity: severityForAqi(r.aqi),
        lat: r.lat,
        lng: r.lng,
        state: r.state,
        district: null,
        lang: "en",
        url: r.modelled ? "https://open-meteo.com/en/docs/air-quality-api" : "https://airquality.cpcb.gov.in/AQI_India/",
        occurred_at: r.observedAt,
        raw: r,
      });
    }
    return out;
  },

  metrics(raw) {
    return readings(raw).map(
      (r): MetricRow => ({
        key: "aqi",
        region: r.id,
        label: r.modelled ? r.city : `${r.label}`,
        value: r.aqi,
        unit: "AQI",
        lat: r.lat,
        lng: r.lng,
        state: r.state,
        observed_at: r.observedAt,
        meta: {
          city: r.city,
          dominant: r.dominant,
          modelled: r.modelled,
          band: aqiBand(r.aqi).label,
          ...(r.subIndices ? { sub_indices: r.subIndices, pollutants: Object.keys(r.subIndices).length } : {}),
        },
      }),
    );
  },
};
