import { DEFAULT_FILTERS, serializeFilters, type EventFilters } from "@/lib/events/filters";
import { CATEGORIES, type Category, type Severity } from "@/lib/types";

/**
 * Home-page URL that approximates a watchlist using the map's filter params
 * (`cat`, `sev`, `win`). The map has no country/keyword filters, so those are not applied.
 */
export function watchlistMapHref(w: { categories: readonly string[]; min_severity: number }): string {
  const categories = CATEGORIES.filter((c: Category) => w.categories.includes(c));
  const filters: EventFilters = {
    ...DEFAULT_FILTERS,
    categories: categories.length > 0 ? categories : [...DEFAULT_FILTERS.categories],
    minSeverity: Math.min(5, Math.max(1, Math.round(w.min_severity))) as Severity,
    window: "7d",
  };
  const qs = serializeFilters(filters).toString();
  return qs ? `/?${qs}` : "/";
}
