import type { Category, EventRow, Source } from "@/lib/types";
import { CORE_CATEGORIES, CORE_SOURCES, withoutSports } from "./sports";

export const THREAT_LEVELS = [
  { min: 80, label: "SEVERE" },
  { min: 60, label: "HIGH" },
  { min: 40, label: "ELEVATED" },
  { min: 20, label: "GUARDED" },
  { min: 0, label: "LOW" },
] as const;
export type ThreatLabel = (typeof THREAT_LEVELS)[number]["label"];

/** How many of the most severe events the threat index averages over. */
export const THREAT_SAMPLE = 20;

export interface Sitrep {
  total: number;
  /** 0–100: mean severity of the top THREAT_SAMPLE events, rescaled from 1–5. */
  threat: number;
  threatLabel: ThreatLabel;
  highSeverity: number;
  byCategory: { category: Category; count: number }[];
  bySource: { source: Source; count: number; latest: string | null }[];
  hotspots: { country: string; count: number; maxSeverity: number }[];
  priority: EventRow[];
}

export function threatLabel(score: number): ThreatLabel {
  return THREAT_LEVELS.find((l) => score >= l.min)!.label;
}

function bySeverityThenRecency(a: EventRow, b: EventRow): number {
  return b.severity - a.severity || Date.parse(b.occurred_at) - Date.parse(a.occurred_at);
}

/**
 * Pure summary of the visible events for the SITREP side panel.
 * Sports items are ignored entirely (threat index, counts, hotspots, priority), even when shown.
 */
export function summarizeSitrep(visible: readonly EventRow[], { hotspots = 6, priority = 4 } = {}): Sitrep {
  const events = withoutSports(visible);
  const ranked = [...events].sort(bySeverityThenRecency);
  const sample = ranked.slice(0, THREAT_SAMPLE);
  const mean = sample.length ? sample.reduce((s, e) => s + e.severity, 0) / sample.length : 1;
  const threat = sample.length ? Math.round(((mean - 1) / 4) * 100) : 0;

  const categoryCounts = new Map<Category, number>(CORE_CATEGORIES.map((c) => [c, 0]));
  const sources = new Map<Source, { count: number; latest: string | null }>(
    CORE_SOURCES.map((s) => [s, { count: 0, latest: null }]),
  );
  const countries = new Map<string, { count: number; maxSeverity: number }>();

  for (const e of events) {
    if (categoryCounts.has(e.category)) categoryCounts.set(e.category, categoryCounts.get(e.category)! + 1);

    const src = sources.get(e.source);
    if (src) {
      src.count++;
      if (!src.latest || Date.parse(e.occurred_at) > Date.parse(src.latest)) src.latest = e.occurred_at;
    }

    if (e.country) {
      const c = countries.get(e.country) ?? { count: 0, maxSeverity: 0 };
      c.count++;
      c.maxSeverity = Math.max(c.maxSeverity, e.severity);
      countries.set(e.country, c);
    }
  }

  return {
    total: events.length,
    threat,
    threatLabel: threatLabel(threat),
    highSeverity: events.filter((e) => e.severity >= 4).length,
    byCategory: [...categoryCounts]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count || CORE_CATEGORIES.indexOf(a.category) - CORE_CATEGORIES.indexOf(b.category)),
    bySource: CORE_SOURCES.map((s) => ({ source: s, ...sources.get(s)! })),
    hotspots: [...countries]
      .map(([country, v]) => ({ country, ...v }))
      .sort((a, b) => b.count - a.count || b.maxSeverity - a.maxSeverity || a.country.localeCompare(b.country))
      .slice(0, hotspots),
    priority: ranked.filter((e) => e.severity >= 3).slice(0, priority),
  };
}
