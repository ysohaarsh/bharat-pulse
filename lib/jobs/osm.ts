import { z } from "zod";
import { STATES } from "@/lib/india/states";

/**
 * Development projects from OpenStreetMap: metro/rail lines and major roads tagged as under
 * construction. Overpass is a shared free service, so each run queries a few states (rotating by
 * hour) and segments are grouped into one project per (state, kind, name).
 *
 * `landuse=construction` (building sites) is deliberately left out: it is ~10× slower to query
 * (30 s for Goa alone, measured 2026-10-05) and mostly private real-estate projects.
 */
/** Public Overpass instances, rotated per request (they rate-limit and stall unpredictably). */
export const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
/** Per-attempt client cap, the server-side query timeout, and the whole run's budget (the route has 60 s). */
export const OVERPASS_ATTEMPT_MS = 14_000;
export const OVERPASS_SERVER_TIMEOUT_S = 25;
export const RUN_BUDGET_MS = 45_000;
/** Don't start a request with less than this left in the budget. */
export const MIN_ATTEMPT_MS = 4_000;
/** ~3 s per state; fetched two at a time (Overpass allows 2 concurrent slots per IP). */
export const STATES_PER_RUN = 6;

/** Big states are queried as bbox halves (south, west, north, east) so each query stays small. */
export const SPLIT_BBOXES: Record<string, [number, number, number, number]> = {
  "IN-UP": [23.8, 77.0, 30.5, 84.7],
  "IN-MH": [15.6, 72.6, 22.1, 80.9],
  "IN-RJ": [23.0, 69.4, 30.2, 78.3],
  "IN-MP": [21.0, 74.0, 26.9, 82.9],
};

/** One or two bbox-restricted queries for big states, else a single whole-state query. */
export function overpassQueries(stateCode: string): string[] {
  const box = SPLIT_BBOXES[stateCode];
  if (!box) return [overpassQuery(stateCode)];
  const [s, w, n, e] = box;
  const mid = (s + n) / 2;
  return [overpassQuery(stateCode, [s, w, mid, e]), overpassQuery(stateCode, [mid, w, n, e])];
}

export function overpassQuery(stateCode: string, bbox?: [number, number, number, number]): string {
  const box = bbox ? `(${bbox.join(",")})` : "";
  return `[out:json][timeout:${OVERPASS_SERVER_TIMEOUT_S}];
area["ISO3166-2"="${stateCode}"][admin_level=4]->.a;
(
  way["railway"="construction"](area.a)${box};
  way["highway"="construction"]["construction"~"^(motorway|trunk|primary)$"](area.a)${box};
);
out center tags qt;`;
}

/** The states to query in this run: a stable rotation keyed by the hour. */
export function statesForRun(now: Date, perRun = STATES_PER_RUN): string[] {
  const slots = Math.ceil(STATES.length / perRun);
  const slot = Math.floor(now.getTime() / 3_600_000) % slots;
  return STATES.slice(slot * perRun, slot * perRun + perRun).map((s) => s.code);
}

const ElementSchema = z.object({
  type: z.enum(["way", "node", "relation"]),
  id: z.number(),
  center: z.object({ lat: z.number(), lon: z.number() }),
  tags: z.record(z.string(), z.string()),
});

export interface ProjectRow {
  source: "osm";
  external_id: string;
  kind: "metro" | "railway" | "highway";
  name: string;
  lat: number;
  lng: number;
  state: string;
  segments: number;
  url: string;
  meta: Record<string, unknown>;
}

export function projectKind(tags: Record<string, string>): ProjectRow["kind"] | null {
  if (tags.railway === "construction") {
    const c = tags.construction ?? "";
    return /subway|light_rail|monorail/.test(c) || /\bmetro\b/i.test(tags.name ?? "") ? "metro" : "railway";
  }
  if (tags.highway === "construction") return "highway";
  return null;
}

const cleanName = (s: string) => s.replace(/\s*\((?:u\/c|under construction)\)\s*$/i, "").trim();

/** Overpass response for one state → one row per named project. Unnamed segments are dropped. */
export function projectsFromOverpass(stateCode: string, raw: unknown): ProjectRow[] {
  const elements = z.object({ elements: z.array(z.unknown()) }).safeParse(raw);
  if (!elements.success) return [];
  const groups = new Map<string, { kind: ProjectRow["kind"]; name: string; points: { lat: number; lng: number }[]; ids: string[]; tags: Record<string, string> }>();
  for (const el of elements.data.elements) {
    const p = ElementSchema.safeParse(el);
    if (!p.success) continue;
    const name = p.data.tags.name ? cleanName(p.data.tags.name) : "";
    const kind = projectKind(p.data.tags);
    if (!name || !kind) continue;
    const key = `${kind}:${name.toLowerCase()}`;
    const g = groups.get(key) ?? { kind, name, points: [], ids: [], tags: p.data.tags };
    g.points.push({ lat: p.data.center.lat, lng: p.data.center.lon });
    g.ids.push(`${p.data.type}/${p.data.id}`);
    groups.set(key, g);
  }
  return [...groups.entries()].map(([key, g]) => ({
    source: "osm",
    external_id: `${stateCode}:${key}`,
    kind: g.kind,
    name: g.name,
    lat: Math.round((g.points.reduce((s, p) => s + p.lat, 0) / g.points.length) * 1e5) / 1e5,
    lng: Math.round((g.points.reduce((s, p) => s + p.lng, 0) / g.points.length) * 1e5) / 1e5,
    state: stateCode,
    segments: g.points.length,
    url: `https://www.openstreetmap.org/${g.ids[0]}`,
    meta: { construction: g.tags.construction ?? null, operator: g.tags.operator ?? null, ref: g.tags.ref ?? null },
  }));
}

let rotation = 0;

async function overpassRequest(query: string, deadline: number): Promise<{ elements: unknown[] }> {
  let lastError: unknown = new Error("no time left in run budget");
  for (let i = 0; i < OVERPASS_URLS.length; i++) {
    const left = deadline - Date.now();
    if (left < MIN_ATTEMPT_MS) break;
    const url = OVERPASS_URLS[(rotation + i) % OVERPASS_URLS.length];
    const host = new URL(url).host;
    try {
      const res = await fetch(url, {
        method: "POST",
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(Math.min(OVERPASS_ATTEMPT_MS, left)),
        headers: { "User-Agent": "BharatPulse/1.0 (https://bharat-pulse-india.vercel.app; https://github.com/ysohaarsh/bharat-pulse)" },
        cache: "no-store",
      });
      if (res.ok) {
        const body = (await res.json()) as { elements?: unknown[]; remark?: string };
        // Overpass answers 200 with a "remark" and partial/empty data when the query hit its limits.
        if (Array.isArray(body.elements) && !(body.remark && /timed out|out of memory/i.test(body.remark))) {
          rotation = (rotation + i + 1) % OVERPASS_URLS.length; // next request starts on the next mirror
          return { elements: body.elements };
        }
        lastError = new Error(`${host}: ${body.remark ?? "no elements"}`);
      } else lastError = new Error(`${host}: HTTP ${res.status}`);
    } catch (err) {
      lastError = new Error(`${host}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw lastError;
}

/**
 * Fetch one state (as bbox halves for the big ones), trying mirrors in rotation until `deadline`
 * (epoch ms). Gives up with a clear error rather than overrunning the function's time limit.
 */
export async function fetchOverpass(stateCode: string, deadline = Date.now() + RUN_BUDGET_MS): Promise<unknown> {
  try {
    const seen = new Set<string>();
    const elements: unknown[] = [];
    for (const q of overpassQueries(stateCode)) {
      for (const el of (await overpassRequest(q, deadline)).elements) {
        const e = el as { type?: string; id?: number };
        const k = `${e.type}/${e.id}`;
        if (seen.has(k)) continue;
        seen.add(k);
        elements.push(el);
      }
    }
    return { elements };
  } catch (err) {
    throw new Error(`Overpass ${stateCode}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
