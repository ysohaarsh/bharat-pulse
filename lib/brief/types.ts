import type { EventRow } from "@/lib/types";

/** The subset of an event row the brief pipeline needs. */
export type BriefEvent = Pick<EventRow, "id" | "title" | "category" | "severity" | "country" | "occurred_at" | "source">;

/** Events at or above this severity count as "high-severity". */
export const HIGH_SEVERITY = 4;

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null;
  }
})();

/** ISO 3166-1 alpha-2 -> English country name; passes through anything else. */
export function countryName(code: string | null): string | null {
  if (!code) return null;
  const trimmed = code.trim();
  if (!/^[A-Za-z]{2}$/.test(trimmed)) return trimmed || null;
  try {
    const name = regionNames?.of(trimmed.toUpperCase());
    return name && name !== trimmed.toUpperCase() ? name : trimmed.toUpperCase();
  } catch {
    return trimmed.toUpperCase();
  }
}
