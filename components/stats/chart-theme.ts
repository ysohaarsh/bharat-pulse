// Shared Recharts styling for the dark theme. CSS variables come from app/globals.css.
import type { CSSProperties } from "react";

export const AXIS_TICK = { fill: "var(--muted)", fontSize: 11 } as const;
export const AXIS_LINE = { stroke: "var(--border)" } as const;
export const GRID_STROKE = "var(--border)";

export const TOOLTIP_CONTENT: CSSProperties = {
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--foreground)",
  fontSize: 12,
  boxShadow: "0 8px 24px rgb(0 0 0 / 0.4)",
};
export const TOOLTIP_LABEL: CSSProperties = { color: "var(--foreground)", fontWeight: 600, marginBottom: 4 };
export const TOOLTIP_ITEM: CSSProperties = { color: "var(--foreground)", padding: 0 };
export const TOOLTIP_CURSOR = { fill: "rgb(255 255 255 / 0.04)" } as const;
