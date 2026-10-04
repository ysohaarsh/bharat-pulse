import type { Category } from "@/lib/types";

/**
 * Display metadata shared by the map, feed and stats so colors stay consistent.
 * Tuned for the green-on-black theme: none of these sit close to the phosphor accent (#00ff88).
 */
export const CATEGORY_META: Record<Category, { label: string; color: string }> = {
  earthquake: { label: "Earthquake", color: "#ff8a1f" },
  wildfire: { label: "Wildfire", color: "#ff5a36" },
  storm: { label: "Storm", color: "#b388ff" },
  volcano: { label: "Volcano", color: "#ff2e88" },
  flood: { label: "Flood", color: "#3da9ff" },
  conflict: { label: "Conflict", color: "#ff3355" },
  politics: { label: "Politics", color: "#ffd23f" },
  economy: { label: "Economy", color: "#2fe0ff" },
  health: { label: "Health", color: "#e879f9" },
  sports: { label: "Sports", color: "#e6edf3" },
  other: { label: "Other", color: "#8aa898" },
};
