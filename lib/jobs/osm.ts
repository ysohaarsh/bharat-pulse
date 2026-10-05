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
/** Public Overpass instances, tried in order (they rate-limit and stall unpredictably). */
export const OVERPASS_URLS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
/** Per-state request cap and the whole run's budget (the route has 60 s). */
export const OVERPASS_TIMEOUT_MS = 25_000;
export const RUN_BUDGET_MS = 45_000;
/** ~3 s per state; fetched two at a time (Overpass allows 2 concurrent slots per IP). */
export const STATES_PER_RUN = 6;

export function overpassQuery(stateCode: string): string {
  return `[out:json][timeout:25];
area["ISO3166-2"="${stateCode}"][admin_level=4]->.a;
(
  way["railway"="construction"](area.a);
  way["highway"="construction"]["construction"~"^(motorway|trunk|primary|secondary)$"](area.a);
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

export async function fetchOverpass(stateCode: string): Promise<unknown> {
  let lastError: unknown;
  for (const url of OVERPASS_URLS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        body: new URLSearchParams({ data: overpassQuery(stateCode) }),
        signal: AbortSignal.timeout(OVERPASS_TIMEOUT_MS),
        headers: { "User-Agent": "BharatPulse/1.0 (India situation monitor)" },
        cache: "no-store",
      });
      if (res.ok) return await res.json();
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`Overpass ${stateCode}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}
