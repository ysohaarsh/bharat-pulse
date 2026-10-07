// Shared domain types. This is the contract every ingester and UI module builds against.

/** Sources that produce map/feed events (rows in `events`). */
export const SOURCES = ["sachet", "ncs", "firms", "aqi", "pib", "news", "sports"] as const;
export type Source = (typeof SOURCES)[number];

/** Background jobs that refresh panels, projects and reference data, not events (see lib/jobs). */
export const JOBS = ["power", "mandi", "sansad", "mla", "osm"] as const;
export type Job = (typeof JOBS)[number];

export const CATEGORIES = [
  "flood", // incl. landslides, CWC river forecasts
  "cyclone",
  "weather", // rain, lightning, thunderstorms, cold wave, fog
  "heat",
  "earthquake", // incl. tsunami
  "wildfire",
  "air",
  "health",
  "security", // crime, terror, conflict, accidents
  "civic",
  "infrastructure", // construction, development projects
  "transport",
  "politics",
  "economy",
  "sports",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export type Severity = 1 | 2 | 3 | 4 | 5;

/** Content languages: ISO 639-1 codes of the 22 scheduled languages we expect from sources. */
export type Lang = string;

/** What every ingester's normalize() must return. Maps 1:1 to an `events` row insert. */
export interface NormalizedEvent {
  source: Source;
  external_id: string;
  title: string;
  summary: string | null;
  category: Category;
  severity: Severity;
  lat: number | null;
  lng: number | null;
  /**
   * ISO 3166-2:IN state code ("IN-KA") when the source says so. When null and lat/lng are set,
   * a database trigger fills it (and `district`) from the boundary polygons.
   */
  state: string | null;
  district: string | null;
  /** Language of `title`/`summary` (ISO 639-1), e.g. "en", "hi", "te". */
  lang: Lang;
  url: string | null;
  occurred_at: string; // ISO 8601
  raw: unknown;
}

/** A row as read back from the `events` table. */
export interface EventRow extends Omit<NormalizedEvent, "raw"> {
  id: number;
  /** Machine translations, filled after ingest (lib/i18n/translate.ts). Null until translated. */
  title_en: string | null;
  title_hi: string | null;
  created_at: string;
}

/** A panel reading (power demand, AQI station, mandi price). Upserted on (key, region). */
export interface MetricRow {
  key: string;
  region: string;
  label: string;
  value: number;
  unit: string;
  lat: number | null;
  lng: number | null;
  state: string | null;
  observed_at: string;
  meta?: Record<string, unknown>;
}
