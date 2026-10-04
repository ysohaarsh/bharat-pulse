import { CATEGORIES, SOURCES, type Category, type EventRow, type Source } from "@/lib/types";

/**
 * Sports is an opt-in side feed: ingested, but hidden by default in the feed/map and always
 * left out of the threat index (SITREP), /stats and the World Brief. These helpers are the
 * single definition of "sports" and "core" (everything else) for all of those.
 */
export const CORE_CATEGORIES: readonly Category[] = CATEGORIES.filter((c) => c !== "sports");
export const CORE_SOURCES: readonly Source[] = SOURCES.filter((s) => s !== "sports");

/** True for anything from the sports feed or categorized as sports. */
export function isSportsEvent(e: Pick<EventRow, "category" | "source">): boolean {
  return e.category === "sports" || e.source === "sports";
}

/** Drop sports events (for aggregates that must ignore them even when they are shown). */
export function withoutSports<T extends Pick<EventRow, "category" | "source">>(events: readonly T[]): T[] {
  return events.filter((e) => !isSportsEvent(e));
}
