import { z } from "zod";
import type { NormalizedEvent, Severity } from "@/lib/types";
import type { Ingester } from "./types";

export const USGS_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson";

const FeatureSchema = z.object({
  id: z.string().min(1),
  properties: z.object({
    mag: z.number().nullable().optional(),
    place: z.string().nullable().optional(),
    time: z.number(),
    url: z.string().nullable().optional(),
    title: z.string().min(1),
    tsunami: z.number().nullable().optional(),
  }),
  geometry: z.object({
    type: z.literal("Point"),
    coordinates: z
      .array(z.number().nullable())
      .min(2)
      .refine(([lng, lat]) => lng != null && lat != null && Math.abs(lng) <= 180 && Math.abs(lat) <= 90, {
        message: "lng/lat out of range",
      }),
  }),
});

const CollectionSchema = z.object({ features: z.array(z.unknown()) });

/** Magnitude → severity: <4 → 1, <5 → 2, <6 → 3, <7 → 4, ≥7 → 5. Unknown magnitude → 1. */
export function severityFromMagnitude(mag: number | null | undefined): Severity {
  if (mag == null) return 1;
  if (mag < 4) return 1;
  if (mag < 5) return 2;
  if (mag < 6) return 3;
  if (mag < 7) return 4;
  return 5;
}

function buildSummary(mag: number | null | undefined, depth: number | null | undefined, tsunami: boolean): string {
  const parts = [mag == null ? "M?" : `M${mag.toFixed(1)}`];
  if (depth != null) parts.push(`depth ${Math.round(depth)} km`);
  if (tsunami) parts.push("tsunami alert");
  return parts.join(" · ");
}

export const usgsIngester: Ingester = {
  source: "usgs",

  async fetchRaw() {
    const res = await fetch(USGS_URL, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`USGS fetch failed: ${res.status} ${res.statusText}`);
    return res.json();
  },

  normalize(raw) {
    const collection = CollectionSchema.safeParse(raw);
    if (!collection.success) return [];

    const events: NormalizedEvent[] = [];
    for (const item of collection.data.features) {
      const parsed = FeatureSchema.safeParse(item);
      if (!parsed.success) continue;
      const { id, properties: p, geometry } = parsed.data;
      const [lng, lat, depth] = geometry.coordinates;
      const occurred = new Date(p.time);
      if (Number.isNaN(occurred.getTime())) continue;

      events.push({
        source: "usgs",
        external_id: id,
        title: p.title,
        summary: buildSummary(p.mag, depth, p.tsunami === 1),
        category: "earthquake",
        severity: severityFromMagnitude(p.mag),
        lat: lat ?? null,
        lng: lng ?? null,
        // USGS gives free-text `place` only; mapping it to ISO codes would be guessing.
        country: null,
        url: p.url ?? null,
        occurred_at: occurred.toISOString(),
        raw: item,
      });
    }
    return events;
  },
};
