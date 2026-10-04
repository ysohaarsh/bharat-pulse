import { z } from "zod";
import type { Category, NormalizedEvent, Severity } from "@/lib/types";
import type { Ingester } from "./types";

/**
 * GDACS (Global Disaster Alert and Coordination System, UN/EC JRC) — current alerts.
 * Data © GDACS / European Commission JRC; attribution required, see https://www.gdacs.org.
 *
 * Identity: one row per GDACS *event*, `external_id = "${eventtype}-${eventid}"`. GDACS
 * publishes a new episode each time an event is re-assessed (e.g. every cyclone advisory);
 * the episode is deliberately NOT part of the id, so each run upserts the same row and the
 * title, severity, summary and report link track the latest episode. `occurred_at` is the
 * event's `fromdate` (event start, stable across episodes).
 *
 * Filtering (product decisions):
 * - Events that haven't started yet (e.g. GLOFAS flood forecasts with a future `fromdate`) are
 *   skipped until they start, rather than re-stamped "now" on every run.
 * - Green wildfire alerts are skipped: they are numerous, low-signal and duplicate NASA EONET.
 */
export const GDACS_URL = "https://www.gdacs.org/gdacsapi/api/Events/geteventlist/EVENTS4APP";

const Position = z.array(z.number()).min(2);

const GeometrySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Point"), coordinates: Position }),
  z.object({ type: z.literal("Polygon"), coordinates: z.array(z.array(Position)).min(1) }),
  z.object({ type: z.literal("MultiPolygon"), coordinates: z.array(z.array(z.array(Position)).min(1)).min(1) }),
]);

const FeatureSchema = z.object({
  geometry: GeometrySchema,
  properties: z.object({
    eventtype: z.string().min(1),
    eventid: z.union([z.number().int(), z.string().regex(/^\d+$/)]),
    episodeid: z.union([z.number(), z.string()]).nullable().optional(),
    name: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    htmldescription: z.string().nullable().optional(),
    alertlevel: z.string().min(1),
    country: z.string().nullable().optional(),
    iso3: z.string().nullable().optional(),
    fromdate: z.string().min(1),
    todate: z.string().nullable().optional(),
    url: z.object({ report: z.string().nullable().optional() }).partial().nullable().optional(),
    affectedcountries: z
      .array(z.object({ iso2: z.string().nullable().optional(), iso3: z.string().nullable().optional() }))
      .nullable()
      .optional(),
    severitydata: z
      .object({
        severity: z.number().nullable().optional(),
        severitytext: z.string().nullable().optional(),
        severityunit: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
  }),
});

const CollectionSchema = z.object({ features: z.array(z.unknown()) });

type Geometry = z.infer<typeof GeometrySchema>;
type SeverityData = z.infer<typeof FeatureSchema>["properties"]["severitydata"];

const CATEGORY_MAP: Record<string, Category> = {
  EQ: "earthquake",
  TC: "storm",
  FL: "flood",
  VO: "volcano",
  WF: "wildfire",
  DR: "other", // drought
};

export function gdacsCategory(eventtype: string): Category {
  return CATEGORY_MAP[eventtype.toUpperCase()] ?? "other";
}

/**
 * Is the hazard itself small, despite an Orange alert (which GDACS often raises for
 * exposure/vulnerability)? EQ < M6, TC below hurricane force (< 119 km/h), WF < 10,000 ha.
 */
function isSmallHazard(eventtype: string, sd: SeverityData): boolean {
  const v = sd?.severity;
  if (v == null || v <= 0) return false;
  const unit = sd?.severityunit?.trim().toLowerCase();
  switch (eventtype.toUpperCase()) {
    case "EQ":
      return unit === "m" && v < 6;
    case "TC":
      return unit === "km/h" && v < 119;
    case "WF":
      return unit === "ha" && v < 10_000;
    default:
      return false;
  }
}

/** Alert level → severity: Green 2, Orange 4 (3 if the hazard itself is small), Red 5. Unknown → 2. */
export function gdacsSeverity(alertlevel: string, eventtype: string, sd?: SeverityData): Severity {
  switch (alertlevel.trim().toLowerCase()) {
    case "red":
      return 5;
    case "orange":
      return isSmallHazard(eventtype, sd) ? 3 : 4;
    default:
      return 2;
  }
}

// ISO 3166-1 alpha-3 → alpha-2 fallback for when `affectedcountries` lacks iso2. Covers the
// codes seen in the live feed plus the most disaster-prone countries.
const ISO3_TO_ISO2: Record<string, string> = {
  AFG: "AF", ARG: "AR", AUS: "AU", BGD: "BD", BOL: "BO", BRA: "BR", CAN: "CA", CHL: "CL",
  CHN: "CN", COD: "CD", COG: "CG", COL: "CO", CRI: "CR", CUB: "CU", DOM: "DO", DZA: "DZ",
  ECU: "EC", EGY: "EG", ESP: "ES", ETH: "ET", FJI: "FJ", FRA: "FR", GRC: "GR", GTM: "GT",
  GUM: "GU", HND: "HN", HTI: "HT", IDN: "ID", IND: "IN", IRN: "IR", IRQ: "IQ", ISL: "IS",
  ITA: "IT", JAM: "JM", JPN: "JP", KEN: "KE", KHM: "KH", KOR: "KR", LAO: "LA", LKA: "LK",
  MDG: "MG", MEX: "MX", MMR: "MM", MNG: "MN", MOZ: "MZ", MWI: "MW", MYS: "MY", NER: "NE",
  NGA: "NG", NIC: "NI", NPL: "NP", NZL: "NZ", PAK: "PK", PAN: "PA", PER: "PE", PHL: "PH",
  PNG: "PG", PRI: "PR", PRT: "PT", PRY: "PY", RUS: "RU", SDN: "SD", SLB: "SB", SLV: "SV",
  SOM: "SO", SSD: "SS", SYR: "SY", TCD: "TD", THA: "TH", TON: "TO", TUR: "TR", TWN: "TW",
  TZA: "TZ", UGA: "UG", UKR: "UA", URY: "UY", USA: "US", VEN: "VE", VNM: "VN", VUT: "VU",
  YEM: "YE", ZAF: "ZA", ZMB: "ZM", ZWE: "ZW",
};

const ISO2 = /^[A-Z]{2}$/;

/** ISO-2 country: the affected country matching `iso3` (else the first one), else our ISO-3 map. */
export function gdacsCountry(
  iso3: string | null | undefined,
  affected: { iso2?: string | null; iso3?: string | null }[] | null | undefined,
): string | null {
  const code3 = iso3?.trim().toUpperCase() || null;
  const list = affected ?? [];
  const match = (code3 && list.find((c) => c.iso3?.toUpperCase() === code3)) || list[0];
  const iso2 = match?.iso2?.trim().toUpperCase();
  if (iso2 && ISO2.test(iso2)) return iso2;
  return code3 ? (ISO3_TO_ISO2[code3] ?? null) : null;
}

/** [lng, lat] of a Point, or the vertex centroid of a (Multi)Polygon's first outer ring. */
function geometryCenter(g: Geometry): [number, number] | null {
  let ring: number[][];
  if (g.type === "Point") return [g.coordinates[0], g.coordinates[1]];
  if (g.type === "Polygon") ring = g.coordinates[0];
  else ring = g.coordinates[0][0];
  const first = ring[0];
  const last = ring[ring.length - 1];
  const pts = ring.length > 1 && first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring;
  if (pts.length === 0) return null;
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
}

/** GDACS timestamps are UTC without an offset ("2026-10-04T14:06:10"). */
function parseUtc(s: string): number {
  const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s}Z`;
  return Date.parse(iso);
}

const stripTags = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function httpsUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    return new URL(u).protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

export function normalizeGdacs(raw: unknown, now: number = Date.now()): NormalizedEvent[] {
  const collection = CollectionSchema.safeParse(raw);
  if (!collection.success) return [];

  const seen = new Set<string>();
  const events: NormalizedEvent[] = [];
  for (const item of collection.data.features) {
    const parsed = FeatureSchema.safeParse(item);
    if (!parsed.success) continue;
    const { geometry, properties: p } = parsed.data;

    const type = p.eventtype.trim().toUpperCase();
    const external_id = `${type}-${p.eventid}`;
    if (seen.has(external_id)) continue;

    const center = geometryCenter(geometry);
    if (!center) continue;
    const [lng, lat] = center;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;

    const start = parseUtc(p.fromdate);
    if (Number.isNaN(start) || start > now) continue;

    const level = p.alertlevel.trim();
    if (type === "WF" && level.toLowerCase() === "green") continue;

    const baseTitle = (p.name || p.description || "").trim();
    if (!baseTitle) continue;
    const sd = p.severitydata;
    const magnitude = type === "EQ" && sd?.severityunit?.trim().toUpperCase() === "M" && sd.severity ? sd.severity : null;
    const title = magnitude != null ? `M${magnitude.toFixed(1)} ${baseTitle}` : baseTitle;

    const parts = [`${level} alert`];
    const sevText = sd?.severitytext?.trim();
    if (sevText && (sd?.severity ?? 0) > 0) parts.push(sevText);
    const desc = p.htmldescription ? stripTags(p.htmldescription) : "";
    if (desc) parts.push(desc);

    seen.add(external_id);
    events.push({
      source: "gdacs",
      external_id,
      title,
      summary: parts.join(" · "),
      category: gdacsCategory(type),
      severity: gdacsSeverity(level, type, sd),
      lat,
      lng,
      country: gdacsCountry(p.iso3, p.affectedcountries),
      url: httpsUrl(p.url?.report),
      occurred_at: new Date(start).toISOString(),
      raw: item,
    });
  }
  return events;
}

export const gdacsIngester: Ingester = {
  source: "gdacs",

  async fetchRaw() {
    const res = await fetch(GDACS_URL, {
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`GDACS fetch failed: ${res.status} ${res.statusText}`);
    return res.json();
  },

  normalize(raw) {
    return normalizeGdacs(raw);
  },
};
