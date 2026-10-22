import { z } from "zod";
import type { MetricRow } from "@/lib/types";

/**
 * OpenSky Network, anonymous REST API: live aircraft state vectors over India's bounding box.
 * Anonymous limits: 400 credits/day per IP, state data is current-only at 10 s resolution.
 * A box over 400 sq deg costs 4 credits per call, so this one (about 930 sq deg) costs 4:
 * every 30 min = 48 calls = 192 credits/day (48 % of the budget).
 */
export const FLIGHTS_BBOX = { lamin: 6, lomin: 68, lamax: 37.5, lomax: 97.5 } as const;
export const FLIGHTS_URL = `https://opensky-network.org/api/states/all?${new URLSearchParams(
  Object.entries(FLIGHTS_BBOX).map(([k, v]) => [k, String(v)]),
)}`;

const num = z.number().finite().nullable();
/** Positional state vector: icao24, callsign, origin_country, time_position, last_contact, lon, lat, baro_alt, on_ground, velocity, true_track, ... */
const StateSchema = z
  .tuple([
    z.string().min(1), // 0 icao24
    z.string().nullable(), // 1 callsign
    z.string().nullable(), // 2 origin_country
    num, // 3 time_position
    num, // 4 last_contact
    z.number().finite(), // 5 longitude
    z.number().finite(), // 6 latitude
    num, // 7 baro_altitude (m)
    z.boolean(), // 8 on_ground
    num, // 9 velocity (m/s)
    num, // 10 true_track (deg)
  ])
  .rest(z.unknown());

const ResponseSchema = z.object({ time: z.number(), states: z.array(z.unknown()).nullable() });

export interface Aircraft {
  icao24: string;
  callsign: string;
  country: string;
  lat: number;
  lng: number;
  alt: number | null;
  heading: number | null;
  velocity: number | null;
  onGround: boolean;
}

/** Valid aircraft inside the India box; malformed rows are skipped. */
export function parseStates(raw: unknown): { time: number; aircraft: Aircraft[] } | null {
  const top = ResponseSchema.safeParse(raw);
  if (!top.success) return null;
  const aircraft: Aircraft[] = [];
  for (const row of top.data.states ?? []) {
    const p = StateSchema.safeParse(row);
    if (!p.success) continue;
    const [icao24, callsign, country, , , lng, lat, alt, onGround, velocity, heading] = p.data;
    if (lat < FLIGHTS_BBOX.lamin || lat > FLIGHTS_BBOX.lamax || lng < FLIGHTS_BBOX.lomin || lng > FLIGHTS_BBOX.lomax) continue;
    aircraft.push({ icao24, callsign: (callsign ?? "").trim(), country: country ?? "", lat, lng, alt, heading, velocity, onGround });
  }
  return { time: top.data.time, aircraft };
}

/** Column order of `flights.positions` meta.aircraft rows. */
export const POSITION_FIELDS = ["icao24", "callsign", "lat", "lng", "alt_m", "heading", "velocity_ms", "country", "on_ground"] as const;

const r = (v: number | null, dp: number) => (v == null ? null : Number(v.toFixed(dp)));

export interface FlightMetrics {
  /** National counts (also written to metric_history). */
  counts: MetricRow[];
  /** Latest positions snapshot: one row, replaced on every run. Not for history. */
  positions: MetricRow | null;
}

export function flightMetrics(raw: unknown, fallbackObservedAt: string): FlightMetrics {
  const parsed = parseStates(raw);
  if (!parsed) return { counts: [], positions: null };
  const observed_at = parsed.time > 0 ? new Date(parsed.time * 1000).toISOString() : fallbackObservedAt;
  const { aircraft } = parsed;
  const ground = aircraft.filter((a) => a.onGround).length;
  const row = (key: string, label: string, value: number): MetricRow => ({
    key, region: "IN", label, value, unit: "aircraft", lat: null, lng: null, state: null, observed_at,
  });
  const counts = [
    row("flights.total", "Aircraft in Indian airspace box", aircraft.length),
    row("flights.airborne", "Airborne aircraft", aircraft.length - ground),
    row("flights.ground", "Aircraft on the ground", ground),
    row("flights.india_registered", "India-registered aircraft", aircraft.filter((a) => a.country === "India").length),
  ];
  const positions: MetricRow = {
    ...row("flights.positions", "Aircraft positions (latest snapshot)", aircraft.length),
    meta: {
      fields: POSITION_FIELDS,
      bbox: FLIGHTS_BBOX,
      aircraft: aircraft.map((a) => [a.icao24, a.callsign, r(a.lat, 3), r(a.lng, 3), r(a.alt, 0), r(a.heading, 0), r(a.velocity, 0), a.country, a.onGround ? 1 : 0]),
    },
  };
  return { counts, positions };
}

export async function fetchFlights(): Promise<unknown> {
  const res = await fetch(FLIGHTS_URL, { signal: AbortSignal.timeout(25_000), cache: "no-store" });
  if (!res.ok) throw new Error(`OpenSky fetch failed: ${res.status}${res.status === 429 ? " (anonymous daily credits exhausted)" : ""}`);
  return res.json();
}
