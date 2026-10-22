/** Pure helpers for the `flights.positions` metrics row (written by lib/jobs/flights.ts). */

export interface FlightSnapshot {
  /** ISO time of the OpenSky snapshot. */
  observedAt: string;
  features: GeoJSON.Feature<GeoJSON.Point>[];
}

/** Snapshots older than this are shown as stale (the relay runs every 30 min). */
export const FLIGHTS_STALE_MIN = 90;

const FIELDS = ["icao24", "callsign", "lat", "lng", "alt_m", "heading", "velocity_ms", "country", "on_ground"] as const;
type Field = (typeof FIELDS)[number];

const numOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * `meta` of the positions row → map features. Columns are looked up by name in `meta.fields`, so
 * a reordered payload still works; malformed rows are skipped.
 */
export function parseFlightPositions(meta: unknown, observedAt: string): FlightSnapshot | null {
  if (!meta || typeof meta !== "object") return null;
  const { fields, aircraft } = meta as { fields?: unknown; aircraft?: unknown };
  if (!Array.isArray(fields) || !Array.isArray(aircraft)) return null;
  const idx = Object.fromEntries(FIELDS.map((f) => [f, fields.indexOf(f)])) as Record<Field, number>;
  if (idx.lat < 0 || idx.lng < 0) return null;

  const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
  for (const row of aircraft) {
    if (!Array.isArray(row)) continue;
    const lat = numOrNull(row[idx.lat]);
    const lng = numOrNull(row[idx.lng]);
    if (lat == null || lng == null) continue;
    const str = (f: Field) => (idx[f] >= 0 && typeof row[idx[f]] === "string" ? (row[idx[f]] as string) : "");
    const num = (f: Field) => (idx[f] >= 0 ? numOrNull(row[idx[f]]) : null);
    const country = str("country");
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lng, lat] },
      properties: {
        icao24: str("icao24"),
        callsign: str("callsign").trim(),
        country,
        alt: num("alt_m"),
        heading: num("heading") ?? 0,
        speed: num("velocity_ms"),
        ground: idx.on_ground >= 0 && Boolean(row[idx.on_ground]),
        india: country === "India",
      },
    });
  }
  return { observedAt, features };
}

/** Whole minutes since the snapshot (never negative). */
export function snapshotAgeMin(observedAt: string, now = Date.now()): number {
  return Math.max(0, Math.round((now - Date.parse(observedAt)) / 60_000));
}

export const isStale = (ageMin: number) => ageMin > FLIGHTS_STALE_MIN;
export const mToFt = (m: number) => Math.round(m * 3.28084);
export const msToKmh = (ms: number) => Math.round(ms * 3.6);
