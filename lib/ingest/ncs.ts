import { z } from "zod";
import type { NormalizedEvent, Severity } from "@/lib/types";
import { inIndiaBox } from "./geo";
import { BOT_HEADERS, decodeEntities } from "./rss";
import type { Ingester } from "./types";

/**
 * National Center for Seismology (Ministry of Earth Sciences) — the official Indian quake feed.
 * RISEQ has no JSON API, but its event list embeds one JSON object per quake in a `data-json`
 * attribute, which is a stable thing to parse:
 *   {"event_id":"…","event_name":"M: 3.7 - Afghanistan","origin_time":"2026-10-05 00:11:02 IST",
 *    "lat_long":"35.879, 70.653","magnitude_depth":"M: 3.7 , D: 104km","event_type":"Reviewed"}
 * The list includes the whole region (Hindu Kush, Myanmar, Nepal); we keep India's bounding box.
 */
export const NCS_URL = "https://riseq.seismo.gov.in/riseq/earthquake";

const EventSchema = z.object({
  event_id: z.string().min(1),
  event_name: z.string().min(1),
  origin_time: z.string().min(1),
  lat_long: z.string().min(3),
  magnitude_depth: z.string().nullish(),
  event_type: z.string().nullish(),
});

/** Same scale as before: <4 → 1, <5 → 2, <6 → 3, <7 → 4, ≥7 → 5. */
export function severityFromMagnitude(mag: number | null): Severity {
  if (mag == null) return 1;
  if (mag < 4) return 1;
  if (mag < 5) return 2;
  if (mag < 6) return 3;
  if (mag < 7) return 4;
  return 5;
}

/** All `data-json='…'` payloads in the page. */
export function extractEvents(html: string): unknown[] {
  const out: unknown[] = [];
  for (const m of html.matchAll(/data-json='([^']*)'/g)) {
    try {
      out.push(JSON.parse(decodeEntities(m[1])));
    } catch {
      // skip malformed attribute
    }
  }
  return out;
}

/** "2026-10-05 00:11:02 IST" → epoch ms. */
export function parseOriginTime(s: string): number {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) IST$/.exec(s.trim());
  return m ? Date.parse(`${m[1]}T${m[2]}+05:30`) : NaN;
}

export function parseMagnitudeDepth(s: string | null | undefined): { mag: number | null; depthKm: number | null } {
  const mag = /M:\s*([\d.]+)/.exec(s ?? "");
  const depth = /D:\s*([\d.]+)\s*km/i.exec(s ?? "");
  return { mag: mag ? Number(mag[1]) : null, depthKm: depth ? Number(depth[1]) : null };
}

export const ncsIngester: Ingester<string> = {
  source: "ncs",

  async fetchRaw() {
    const res = await fetch(NCS_URL, { signal: AbortSignal.timeout(25_000), cache: "no-store", headers: BOT_HEADERS });
    if (!res.ok) throw new Error(`NCS fetch failed: ${res.status} ${res.statusText}`);
    return res.text();
  },

  normalize(raw) {
    if (typeof raw !== "string") return [];
    const out: NormalizedEvent[] = [];
    for (const item of extractEvents(raw)) {
      const parsed = EventSchema.safeParse(item);
      if (!parsed.success) continue;
      const e = parsed.data;
      const time = parseOriginTime(e.origin_time);
      if (Number.isNaN(time)) continue;
      const [lat, lng] = e.lat_long.split(",").map((v) => Number(v.trim()));
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inIndiaBox(lat, lng)) continue;
      const { mag, depthKm } = parseMagnitudeDepth(e.magnitude_depth);
      const region = e.event_name.replace(/^M:\s*[\d.]+\s*-\s*/, "").trim();

      out.push({
        source: "ncs",
        external_id: e.event_id,
        title: `M${mag?.toFixed(1) ?? "?"} earthquake — ${region}`,
        summary: [mag != null ? `Magnitude ${mag.toFixed(1)}` : null, depthKm != null ? `depth ${depthKm} km` : null, e.event_type]
          .filter(Boolean)
          .join(" · "),
        category: "earthquake",
        severity: severityFromMagnitude(mag),
        lat,
        lng,
        state: null, // filled from coordinates by the database
        district: null,
        lang: "en",
        url: NCS_URL,
        occurred_at: new Date(time).toISOString(),
        raw: e,
      });
    }
    return out;
  },
};
