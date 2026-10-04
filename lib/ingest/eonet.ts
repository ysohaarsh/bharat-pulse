import { z } from "zod";
import type { Category, NormalizedEvent, Severity } from "@/lib/types";
import type { Ingester } from "./types";

export const EONET_URL = "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=7";

const Position = z.array(z.number()).min(2);

const PointGeometry = z.object({
  type: z.literal("Point"),
  coordinates: Position,
});

const PolygonGeometry = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(Position)).min(1),
});

const GeometrySchema = z
  .discriminatedUnion("type", [PointGeometry, PolygonGeometry])
  .and(
    z.object({
      date: z.string(),
      magnitudeValue: z.number().nullable().optional(),
      magnitudeUnit: z.string().nullable().optional(),
    }),
  );

const EventSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  link: z.string().nullable().optional(),
  categories: z.array(z.object({ id: z.string(), title: z.string().optional() })).min(1),
  sources: z.array(z.object({ id: z.string().optional(), url: z.string().nullable().optional() })).optional(),
  geometry: z.array(GeometrySchema).min(1),
});

const ResponseSchema = z.object({ events: z.array(z.unknown()) });

type Geometry = z.infer<typeof GeometrySchema>;

const CATEGORY_MAP: Record<string, Category> = {
  wildfires: "wildfire",
  severeStorms: "storm",
  volcanoes: "volcano",
  floods: "flood",
};

export function mapCategory(eonetId: string): Category {
  return CATEGORY_MAP[eonetId] ?? "other";
}

/**
 * Severity heuristic (EONET has no severity field):
 * - base: storms and volcanoes 3, everything else 2
 * - storms (magnitude in kts, max sustained wind): ≥64 kts (hurricane/typhoon) → 4, ≥96 kts (major, Cat 3+) → 5
 * - wildfires (magnitude in acres): ≥10,000 acres → 3, ≥100,000 acres → 4
 * - other units (e.g. iceberg NM^2) don't change severity.
 */
export function eonetSeverity(category: Category, magnitude?: number | null, unit?: string | null): Severity {
  let sev: Severity = category === "storm" || category === "volcano" ? 3 : 2;
  if (magnitude == null) return sev;
  const u = unit?.toLowerCase();
  if (category === "storm" && u === "kts") {
    if (magnitude >= 96) sev = 5;
    else if (magnitude >= 64) sev = 4;
  } else if (category === "wildfire" && u === "acres") {
    if (magnitude >= 100_000) sev = 4;
    else if (magnitude >= 10_000) sev = 3;
  }
  return sev;
}

/** Returns [lng, lat] — the point itself, or the vertex centroid of a polygon's first (outer) ring. */
function geometryCenter(g: Geometry): [number, number] | null {
  if (g.type === "Point") return [g.coordinates[0], g.coordinates[1]];
  const ring = g.coordinates[0];
  // Drop the closing vertex if the ring is closed so it isn't double-counted.
  const first = ring[0];
  const last = ring[ring.length - 1];
  const pts = ring.length > 1 && first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring;
  if (pts.length === 0) return null;
  const lng = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return [lng, lat];
}

function latestGeometry(geoms: Geometry[]): { g: Geometry; time: number } | null {
  let best: { g: Geometry; time: number } | null = null;
  for (const g of geoms) {
    const time = Date.parse(g.date);
    if (Number.isNaN(time)) continue;
    if (!best || time >= best.time) best = { g, time };
  }
  return best;
}

function buildSummary(description: string | null | undefined, g: Geometry): string | null {
  const parts: string[] = [];
  if (description) parts.push(description);
  if (g.magnitudeValue != null) parts.push(`${g.magnitudeValue}${g.magnitudeUnit ? ` ${g.magnitudeUnit}` : ""}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export const eonetIngester: Ingester = {
  source: "eonet",

  async fetchRaw() {
    const res = await fetch(EONET_URL, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`EONET fetch failed: ${res.status} ${res.statusText}`);
    return res.json();
  },

  normalize(raw) {
    const response = ResponseSchema.safeParse(raw);
    if (!response.success) return [];

    const events: NormalizedEvent[] = [];
    for (const item of response.data.events) {
      const parsed = EventSchema.safeParse(item);
      if (!parsed.success) continue;
      const ev = parsed.data;

      const latest = latestGeometry(ev.geometry);
      if (!latest) continue;
      const center = geometryCenter(latest.g);
      if (!center) continue;
      const [lng, lat] = center;
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;

      // An event can carry several categories; prefer the first one we have a specific mapping for.
      const category = ev.categories.map((c) => mapCategory(c.id)).find((c) => c !== "other") ?? "other";
      const url = ev.link || ev.sources?.find((s) => s.url)?.url || null;

      events.push({
        source: "eonet",
        external_id: ev.id,
        title: ev.title,
        summary: buildSummary(ev.description, latest.g),
        category,
        severity: eonetSeverity(category, latest.g.magnitudeValue, latest.g.magnitudeUnit),
        lat,
        lng,
        country: null,
        url,
        occurred_at: new Date(latest.time).toISOString(),
        raw: item,
      });
    }
    return events;
  },
};
