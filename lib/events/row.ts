import { z } from "zod";
import { CATEGORIES, SOURCES, type EventRow, type Severity } from "@/lib/types";

/** Columns the UI reads from `events` — deliberately excludes the heavy `raw` payload. */
export const EVENT_COLUMNS =
  "id,source,external_id,title,summary,category,severity,lat,lng,country,url,occurred_at,created_at" as const;

const eventRowSchema = z.object({
  id: z.coerce.number().int(),
  source: z.enum(SOURCES),
  external_id: z.string(),
  title: z.string(),
  summary: z.string().nullable().default(null),
  category: z.enum(CATEGORIES),
  severity: z.coerce.number().int().min(1).max(5),
  lat: z.number().nullable().default(null),
  lng: z.number().nullable().default(null),
  country: z.string().nullable().default(null),
  url: z.string().nullable().default(null),
  occurred_at: z.string(),
  created_at: z.string(),
});

/**
 * Validate an untyped record (DB row or realtime payload) into an EventRow.
 * Strips extra fields like `raw`. Returns null for anything malformed.
 */
export function toEventRow(record: unknown): EventRow | null {
  const parsed = eventRowSchema.safeParse(record);
  if (!parsed.success) return null;
  return { ...parsed.data, severity: parsed.data.severity as Severity };
}

export function hasCoords(e: EventRow): e is EventRow & { lat: number; lng: number } {
  return typeof e.lat === "number" && typeof e.lng === "number";
}
