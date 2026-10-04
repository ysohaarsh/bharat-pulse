import "server-only";
import { createClient } from "@/lib/supabase/server";
import { windowRange, type StatsEvent, type StatsWindow } from "@/lib/stats/aggregate";

export const STATS_EVENT_LIMIT = 5000;

export interface StatsEventsResult {
  events: StatsEvent[];
  /** True when the row limit was hit, so aggregates may undercount. */
  truncated: boolean;
  error: string | null;
}

/** Fetch only the columns the stats aggregations need for the given window. */
export async function fetchStatsEvents(window: StatsWindow, now: Date = new Date()): Promise<StatsEventsResult> {
  const { start } = windowRange(window, now);
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("events")
      .select("category, severity, country, source, occurred_at")
      .gte("occurred_at", start.toISOString())
      // Sports is an opt-in side feed and never counts toward stats (summarize() drops it too).
      .neq("category", "sports")
      .neq("source", "sports")
      .order("occurred_at", { ascending: false })
      .limit(STATS_EVENT_LIMIT);
    if (error) {
      console.error("[stats] query failed:", error.message);
      return { events: [], truncated: false, error: "The event database is unavailable right now." };
    }
    const events = (data ?? []) as StatsEvent[];
    return { events, truncated: events.length >= STATS_EVENT_LIMIT, error: null };
  } catch (e) {
    console.error("[stats] query failed:", e);
    return { events: [], truncated: false, error: "The event database is unavailable right now." };
  }
}
