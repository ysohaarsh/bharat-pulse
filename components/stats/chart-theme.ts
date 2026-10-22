// Shared Recharts styling for the Bahi-Khata paper theme. CSS variables come from app/globals.css.
import type { CSSProperties } from "react";

export const AXIS_TICK = {
  fill: "var(--ink-soft)",
  fontSize: 11,
  fontFamily: "var(--font-plex-mono)",
} as const;
export const AXIS_LINE = { stroke: "var(--border-strong)" } as const;
export const GRID_STROKE = "var(--border)";

/** Tooltip as a ledger slip: paper-2, brass outline, maroon left rule, offset shadow. */
export const TOOLTIP_CONTENT: CSSProperties = {
  background: "var(--surface-2)",
  border: "1px solid var(--border-strong)",
  borderLeft: "3px solid var(--maroon)",
  borderRadius: 2,
  color: "var(--foreground)",
  fontSize: 12,
  padding: "6px 10px",
  boxShadow: "2px 2px 0 rgb(122 30 30 / 0.18)",
};
export const TOOLTIP_LABEL: CSSProperties = {
  color: "var(--maroon)",
  fontFamily: "var(--font-plex-mono)",
  fontWeight: 600,
  marginBottom: 4,
};
export const TOOLTIP_ITEM: CSSProperties = {
  color: "var(--foreground)",
  padding: 0,
  fontFamily: "var(--font-plex-mono)",
  fontVariantNumeric: "tabular-nums",
};
export const TOOLTIP_CURSOR = { fill: "rgb(217 154 30 / 0.12)" } as const;
