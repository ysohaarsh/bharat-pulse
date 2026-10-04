import { isSportsEvent } from "@/lib/events/sports";
import type { BriefEvent } from "./types";

export interface SelectOptions {
  /** Total events to keep. */
  max?: number;
  /** Max events from any one category. */
  perCategory?: number;
  /** Max events from any one source. */
  perSource?: number;
}

const DEFAULTS: Required<SelectOptions> = { max: 40, perCategory: 10, perSource: 20 };

/** Lowercase, strip punctuation/diacritics, collapse whitespace. */
export function normalizeTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(normalized: string): Set<string> {
  return new Set(normalized.split(" ").filter(Boolean));
}

/** Same normalized title, or (for titles of 4+ words) token-set Jaccard similarity >= 0.8. */
export function isNearDuplicate(a: string, b: string): boolean {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (na === nb) return true;
  const ta = tokens(na);
  const tb = tokens(nb);
  if (ta.size < 4 || tb.size < 4) return false;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / (ta.size + tb.size - shared) >= 0.8;
}

/** Severity desc, then most recent first, then id for stability. */
export function compareImportance(a: BriefEvent, b: BriefEvent): number {
  return (
    b.severity - a.severity ||
    Date.parse(b.occurred_at) - Date.parse(a.occurred_at) ||
    a.id - b.id
  );
}

/**
 * Pick the most important events for a brief: ordered by severity then recency,
 * with per-category and per-source caps so no single feed dominates, and with
 * near-identical titles (the same story from several outlets) collapsed.
 * Sports items (an opt-in side feed) are never picked.
 * Pure; does not mutate its input.
 */
export function selectEvents(events: readonly BriefEvent[], options: SelectOptions = {}): BriefEvent[] {
  const { max, perCategory, perSource } = { ...DEFAULTS, ...options };
  const picked: BriefEvent[] = [];
  const byCategory = new Map<string, number>();
  const bySource = new Map<string, number>();

  for (const e of [...events].sort(compareImportance)) {
    if (picked.length >= max) break;
    if (isSportsEvent(e)) continue;
    if ((byCategory.get(e.category) ?? 0) >= perCategory) continue;
    if ((bySource.get(e.source) ?? 0) >= perSource) continue;
    if (picked.some((p) => isNearDuplicate(p.title, e.title))) continue;
    picked.push(e);
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + 1);
    bySource.set(e.source, (bySource.get(e.source) ?? 0) + 1);
  }
  return picked;
}
