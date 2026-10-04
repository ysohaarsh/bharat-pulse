import { CATEGORY_META } from "@/lib/categories";
import { compareImportance } from "./select";
import { countryName, type BriefEvent } from "./types";

export const EXTRACTIVE_MODEL = "extractive";

export interface PeriodStats {
  /** All events in the period (not just the selected ones). */
  total: number;
  /** Events with severity >= HIGH_SEVERITY in the period. */
  highSeverity: number;
}

export interface ExtractiveOptions {
  /** Max bullets per category section. */
  perSection?: number;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Collapse whitespace and strip markdown control chars so titles can't break the brief's formatting. */
function cleanTitle(title: string): string {
  return title.replace(/\s+/g, " ").replace(/\*\*/g, "").replace(/^[#\-*•\s]+/, "").trim();
}

/**
 * Deterministic, no-LLM brief: a lead line with counts, then one section per
 * category (most severe category first) with the top selected events as bullets.
 * Output uses the same markdown subset as LLM briefs. Pure.
 */
export function buildExtractiveBrief(
  selected: readonly BriefEvent[],
  stats: PeriodStats,
  { perSection = 5 }: ExtractiveOptions = {},
): string {
  const lead =
    `${plural(stats.total, "event")} in the last 24h; ${stats.highSeverity} high-severity.` +
    (selected.length > 0 ? " The most significant are listed below by category." : "");
  const lines = ["# Overview", "", lead];

  const groups = new Map<string, BriefEvent[]>();
  for (const e of [...selected].sort(compareImportance)) {
    const list = groups.get(e.category) ?? [];
    list.push(e);
    groups.set(e.category, list);
  }
  // Map preserves insertion order, and insertion followed importance order,
  // so sections are ordered by their most important event.
  for (const [category, events] of groups) {
    const label = CATEGORY_META[category as keyof typeof CATEGORY_META]?.label ?? category;
    lines.push("", `## ${label}`, "");
    for (const e of events.slice(0, perSection)) {
      const country = countryName(e.country);
      lines.push(`- ${cleanTitle(e.title)}${country ? ` — ${country}` : ""}`);
    }
  }
  return lines.join("\n");
}
