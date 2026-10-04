// Pure aggregation helpers for the /stats page. No I/O, no local-timezone math:
// every bucket boundary is computed in UTC so results are identical on any server.
import { CATEGORY_META } from "@/lib/categories";
import { CORE_SOURCES, withoutSports } from "@/lib/events/sports";
import { CATEGORIES, type Category, type EventRow, type Source } from "@/lib/types";

export type StatsEvent = Pick<EventRow, "category" | "severity" | "country" | "source" | "occurred_at">;

export const STATS_WINDOWS = ["24h", "7d"] as const;
export type StatsWindow = (typeof STATS_WINDOWS)[number];

export const HIGH_SEVERITY = 4;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function parseWindow(value: unknown): StatsWindow {
  const v = Array.isArray(value) ? value[0] : value;
  return (STATS_WINDOWS as readonly unknown[]).includes(v) ? (v as StatsWindow) : "24h";
}

export interface WindowRange {
  /** Inclusive start of the first bucket. */
  start: Date;
  /** Exclusive end of the last bucket. */
  end: Date;
  bucketMs: number;
  bucketCount: number;
}

/**
 * 24h → 24 hourly buckets ending with the current (partial) UTC hour.
 * 7d  → 7 daily buckets ending with the current (partial) UTC day.
 */
export function windowRange(window: StatsWindow, now: Date = new Date()): WindowRange {
  const t = now.getTime();
  if (window === "7d") {
    const dayStart = Math.floor(t / DAY_MS) * DAY_MS;
    return {
      start: new Date(dayStart - 6 * DAY_MS),
      end: new Date(dayStart + DAY_MS),
      bucketMs: DAY_MS,
      bucketCount: 7,
    };
  }
  const hourStart = Math.floor(t / HOUR_MS) * HOUR_MS;
  return {
    start: new Date(hourStart - 23 * HOUR_MS),
    end: new Date(hourStart + HOUR_MS),
    bucketMs: HOUR_MS,
    bucketCount: 24,
  };
}

function normCategory(c: string): Category {
  return (CATEGORIES as readonly string[]).includes(c) ? (c as Category) : "other";
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function bucketLabel(start: Date, window: StatsWindow): string {
  return window === "7d" ? `${MONTHS[start.getUTCMonth()]} ${start.getUTCDate()}` : `${pad2(start.getUTCHours())}:00`;
}

export function countByCategory(events: readonly StatsEvent[]): Record<Category, number> {
  const out = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
  for (const e of events) out[normCategory(e.category)]++;
  return out;
}

export interface CategoryShare {
  category: Category;
  label: string;
  color: string;
  count: number;
}

/** Non-zero categories, sorted by count desc (ties keep CATEGORIES order). */
export function categoryShares(events: readonly StatsEvent[]): CategoryShare[] {
  const counts = countByCategory(events);
  return CATEGORIES.filter((c) => counts[c] > 0)
    .map((c) => ({ category: c, label: CATEGORY_META[c].label, color: CATEGORY_META[c].color, count: counts[c] }))
    .sort((a, b) => b.count - a.count);
}

export type TimeBucket = { start: string; label: string; total: number } & Record<Category, number>;

/** Per-category counts per time bucket. Events outside the window are ignored. */
export function timeBuckets(events: readonly StatsEvent[], window: StatsWindow, now: Date = new Date()): TimeBucket[] {
  const { start, bucketMs, bucketCount } = windowRange(window, now);
  const startMs = start.getTime();
  const buckets: TimeBucket[] = Array.from({ length: bucketCount }, (_, i) => {
    const s = new Date(startMs + i * bucketMs);
    const zero = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
    return { start: s.toISOString(), label: bucketLabel(s, window), total: 0, ...zero };
  });
  for (const e of events) {
    const t = Date.parse(e.occurred_at);
    if (Number.isNaN(t)) continue;
    const idx = Math.floor((t - startMs) / bucketMs);
    if (idx < 0 || idx >= bucketCount) continue;
    buckets[idx][normCategory(e.category)]++;
    buckets[idx].total++;
  }
  return buckets;
}

export interface CountryCount {
  country: string;
  count: number;
}

/** Top-N countries by event count; events without a country are skipped. */
export function topCountries(events: readonly StatsEvent[], limit = 10): CountryCount[] {
  const counts = new Map<string, number>();
  for (const e of events) {
    const c = e.country?.trim().toUpperCase();
    if (!c) continue;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts]
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country))
    .slice(0, limit);
}

export interface SourceCount {
  source: Source;
  count: number;
}

/** All known non-sports sources (zero-filled), sorted by count desc. */
export function countBySource(events: readonly StatsEvent[]): SourceCount[] {
  const counts = new Map<Source, number>(CORE_SOURCES.map((s) => [s, 0]));
  for (const e of events) {
    if (counts.has(e.source)) counts.set(e.source, counts.get(e.source)! + 1);
  }
  return [...counts].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count);
}

export interface SeverityCount {
  severity: 1 | 2 | 3 | 4 | 5;
  count: number;
}

export function severityDistribution(events: readonly StatsEvent[]): SeverityCount[] {
  const out: SeverityCount[] = ([1, 2, 3, 4, 5] as const).map((severity) => ({ severity, count: 0 }));
  for (const e of events) {
    const s = Math.round(Number(e.severity));
    if (s >= 1 && s <= 5) out[s - 1].count++;
  }
  return out;
}

export interface Kpis {
  total: number;
  highSeverity: number;
  countries: number;
  topCategory: Category | null;
}

export function kpis(events: readonly StatsEvent[]): Kpis {
  const countries = new Set<string>();
  let highSeverity = 0;
  for (const e of events) {
    if (e.severity >= HIGH_SEVERITY) highSeverity++;
    const c = e.country?.trim().toUpperCase();
    if (c) countries.add(c);
  }
  return {
    total: events.length,
    highSeverity,
    countries: countries.size,
    topCategory: categoryShares(events)[0]?.category ?? null,
  };
}

export interface StatsSummary {
  window: StatsWindow;
  kpis: Kpis;
  categories: CategoryShare[];
  timeline: TimeBucket[];
  countries: CountryCount[];
  sources: SourceCount[];
  severity: SeverityCount[];
}

/** Everything /stats shows. Sports (an opt-in side feed) is excluded from every figure. */
export function summarize(all: readonly StatsEvent[], window: StatsWindow, now: Date = new Date()): StatsSummary {
  const events = withoutSports(all);
  return {
    window,
    kpis: kpis(events),
    categories: categoryShares(events),
    timeline: timeBuckets(events, window, now),
    countries: topCountries(events, 10),
    sources: countBySource(events),
    severity: severityDistribution(events),
  };
}
