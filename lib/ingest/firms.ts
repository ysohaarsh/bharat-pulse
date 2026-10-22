import type { NormalizedEvent, Severity } from "@/lib/types";
import { INDIA_BBOX } from "./geo";
import type { Ingester } from "./types";

/**
 * NASA FIRMS active fires (VIIRS S-NPP, near real time) over India's bounding box.
 * Needs a free MAP_KEY (https://firms.modaps.eosdis.nasa.gov/api/map_key/) in FIRMS_MAP_KEY.
 * No Indian equivalent has an API: FSI's forest-fire alerts and Bhuvan are UI-only.
 *
 * A day can have thousands of hotspots (crop-residue burning in Punjab/Haryana), so they are
 * aggregated into 0.25° grid cells per day: one event per cell, sized by count and max FRP.
 */
export const FIRMS_SOURCE = "VIIRS_SNPP_NRT";
export const firmsUrl = (key: string, days = 1) =>
  `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(key)}/${FIRMS_SOURCE}/` +
  `${INDIA_BBOX.minLng},${INDIA_BBOX.minLat},${INDIA_BBOX.maxLng},${INDIA_BBOX.maxLat}/${days}`;

export const CELL_DEG = 0.25;

interface Hotspot {
  lat: number;
  lng: number;
  date: string; // YYYY-MM-DD (UTC)
  time: string; // HHMM (UTC)
  frp: number;
  confidence: string;
}

/** Columns of the documented area CSV that we depend on (the rest, e.g. bright_ti4, is ignored). */
export const FIRMS_REQUIRED_COLUMNS = ["latitude", "longitude", "acq_date", "acq_time", "frp", "confidence"] as const;

/**
 * FIRMS answers errors (invalid/expired MAP_KEY, transaction quota exceeded, bad source) with a
 * plain-text body and often HTTP 200. Throw with that text, or when the header isn't the documented
 * one, so a prod run shows the real reason instead of a silent 0. An empty body (no detections) is fine.
 */
export function assertFirmsCsv(body: string): void {
  const text = body.trim();
  if (!text) return;
  const first = text.split(/\r?\n/)[0];
  const header = first.split(",").map((h) => h.trim());
  const missing = FIRMS_REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length === 0) return;
  if (!first.includes(",")) throw new Error(`FIRMS returned an error instead of CSV: ${text.slice(0, 200)}`);
  throw new Error(`FIRMS CSV header changed (missing ${missing.join(", ")}): ${first.slice(0, 200)}`);
}

/** Parse the FIRMS area CSV (header row + one line per hotspot). Low-confidence ("l") rows are dropped. */
export function parseFirmsCsv(csv: string): Hotspot[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim());
  const col = (name: string) => header.indexOf(name);
  const iLat = col("latitude");
  const iLng = col("longitude");
  const iDate = col("acq_date");
  const iTime = col("acq_time");
  const iFrp = col("frp");
  const iConf = col("confidence");
  if ([iLat, iLng, iDate, iTime].some((i) => i < 0)) return [];

  const out: Hotspot[] = [];
  for (const line of lines.slice(1)) {
    const f = line.split(",");
    const lat = Number(f[iLat]);
    const lng = Number(f[iLng]);
    const confidence = iConf >= 0 ? (f[iConf] ?? "").trim().toLowerCase() : "n";
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !/^\d{4}-\d{2}-\d{2}$/.test(f[iDate] ?? "")) continue;
    if (confidence === "l" || confidence === "low") continue;
    out.push({
      lat,
      lng,
      date: f[iDate],
      time: (f[iTime] ?? "0000").padStart(4, "0"),
      frp: iFrp >= 0 ? Number(f[iFrp]) || 0 : 0,
      confidence,
    });
  }
  return out;
}

export function severityForCell(count: number, maxFrp: number): Severity {
  // Oct-Nov stubble burning puts 10-30 detections in a Punjab/Haryana cell on an ordinary day, so
  // the upper bands are set high enough that they only light up on genuinely large clusters.
  if (count >= 60 || maxFrp >= 300) return 4;
  if (count >= 25 || maxFrp >= 120) return 3;
  if (count >= 6) return 2;
  return 1;
}

export const firmsIngester: Ingester<string> = {
  source: "firms",

  async fetchRaw() {
    const key = process.env.FIRMS_MAP_KEY;
    if (!key) throw new Error("FIRMS_MAP_KEY is not set (free key: https://firms.modaps.eosdis.nasa.gov/api/map_key/)");
    const res = await fetch(firmsUrl(key), { signal: AbortSignal.timeout(30_000), cache: "no-store" });
    if (!res.ok) throw new Error(`FIRMS fetch failed: ${res.status} ${res.statusText}`);
    const body = await res.text();
    assertFirmsCsv(body);
    return body;
  },

  normalize(raw) {
    if (typeof raw !== "string") return [];
    const cells = new Map<string, { hotspots: Hotspot[] }>();
    for (const h of parseFirmsCsv(raw)) {
      const cy = Math.floor(h.lat / CELL_DEG);
      const cx = Math.floor(h.lng / CELL_DEG);
      const key = `${h.date}:${cy}:${cx}`;
      const cell = cells.get(key) ?? { hotspots: [] };
      cell.hotspots.push(h);
      cells.set(key, cell);
    }

    const out: NormalizedEvent[] = [];
    for (const [key, { hotspots }] of cells) {
      const n = hotspots.length;
      const lat = hotspots.reduce((s, h) => s + h.lat, 0) / n;
      const lng = hotspots.reduce((s, h) => s + h.lng, 0) / n;
      const maxFrp = Math.max(...hotspots.map((h) => h.frp));
      const latest = hotspots.reduce((a, b) => (`${b.date}${b.time}` > `${a.date}${a.time}` ? b : a));
      const occurred = new Date(`${latest.date}T${latest.time.slice(0, 2)}:${latest.time.slice(2)}:00Z`);
      if (Number.isNaN(occurred.getTime())) continue;
      out.push({
        source: "firms",
        external_id: `${FIRMS_SOURCE}:${key}`,
        title: n === 1 ? "Active fire detected by satellite" : `${n} active fires detected by satellite`,
        summary: `VIIRS hotspots in a ~25 km cell · max fire radiative power ${Math.round(maxFrp)} MW`,
        category: "wildfire",
        severity: severityForCell(n, maxFrp),
        lat: Math.round(lat * 1e4) / 1e4,
        lng: Math.round(lng * 1e4) / 1e4,
        state: null,
        district: null,
        lang: "en",
        url: `https://firms.modaps.eosdis.nasa.gov/map/#d:24hrs;@${lng.toFixed(2)},${lat.toFixed(2)},9z`,
        occurred_at: occurred.toISOString(),
        raw: { count: n, maxFrp, date: latest.date },
      });
    }
    return out;
  },
};
