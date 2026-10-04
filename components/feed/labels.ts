import type { Source } from "@/lib/types";
import type { TimeWindow } from "@/lib/events/filters";

export const SOURCE_LABEL: Record<Source, string> = {
  usgs: "USGS",
  eonet: "NASA EONET",
  gdelt: "GDELT",
  rss: "RSS",
  gdacs: "GDACS",
  who: "WHO",
  sports: "SPORTS",
};

export const WINDOW_LABEL: Record<TimeWindow, string> = {
  "1h": "1h",
  "6h": "6h",
  "24h": "24h",
  "7d": "7d",
};

/** Shared focus ring for interactive controls. */
export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-surface";
