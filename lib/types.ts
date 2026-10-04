// Shared domain types. This is the contract every ingester and UI module builds against.

export const SOURCES = ["usgs", "eonet", "gdelt", "rss", "gdacs", "who", "sports"] as const;
export type Source = (typeof SOURCES)[number];

export const CATEGORIES = [
  "earthquake",
  "wildfire",
  "storm",
  "volcano",
  "flood",
  "conflict",
  "politics",
  "economy",
  "health",
  "sports",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export type Severity = 1 | 2 | 3 | 4 | 5;

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
  country: string | null; // ISO 3166-1 alpha-2 when known
  url: string | null;
  occurred_at: string; // ISO 8601
  raw: unknown;
}

/** A row as read back from the `events` table. */
export interface EventRow extends Omit<NormalizedEvent, "raw"> {
  id: number;
  created_at: string;
}
