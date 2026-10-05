import { stateName } from "@/lib/india/states";
import type { EventRow } from "@/lib/types";

/** The subset of an event row the brief pipeline needs. */
export type BriefEvent = Pick<EventRow, "id" | "title" | "title_en" | "category" | "severity" | "state" | "occurred_at" | "source">;

/** The English headline: the machine translation when the source wasn't English. */
export function englishTitle(e: Pick<BriefEvent, "title" | "title_en">): string {
  return e.title_en ?? e.title;
}

/** Events at or above this severity count as "high-severity". */
export const HIGH_SEVERITY = 4;

/** ISO 3166-2:IN code → state name; passes through anything else. */
export function stateLabel(code: string | null): string | null {
  if (!code) return null;
  return stateName(code.trim()) ?? null;
}
