import type { EventRow } from "@/lib/types";

/** The watchlist columns that decide whether an event raises an alert. */
export interface WatchlistCriteria {
  min_severity: number;
  countries: readonly string[];
  categories: readonly string[];
  keywords: readonly string[];
}

export type MatchableEvent = Pick<EventRow, "severity" | "country" | "category" | "title" | "summary">;

/**
 * Pure TS mirror of `public.create_watchlist_alerts()` in
 * supabase/migrations/20261004100000_watchlist_alerts.sql. Keep the two in sync.
 *
 * An event matches when ALL of:
 * - severity >= min_severity
 * - countries is empty OR event.country is one of them (null country never matches a non-empty list)
 * - categories is empty OR event.category is one of them
 * - keywords is empty OR some keyword is a case-insensitive substring of title or summary
 *   (SQL: `ilike '%' || escaped(kw) || '%'`, with `%`, `_` and `\` escaped so they match literally)
 */
export function eventMatchesWatchlist(event: MatchableEvent, w: WatchlistCriteria): boolean {
  if (event.severity < w.min_severity) return false;
  if (w.countries.length > 0 && (event.country === null || !w.countries.includes(event.country))) return false;
  if (w.categories.length > 0 && !w.categories.includes(event.category)) return false;
  if (w.keywords.length > 0) {
    const title = event.title.toLowerCase();
    const summary = (event.summary ?? "").toLowerCase();
    return w.keywords.some((kw) => {
      const k = kw.toLowerCase();
      return title.includes(k) || summary.includes(k);
    });
  }
  return true;
}
