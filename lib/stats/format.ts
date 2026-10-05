// Small display helpers shared by /stats, /brief and the home SITREP panel.
import { stateName } from "@/lib/india/states";

/** ISO 3166-2:IN code → state name ("IN-KA" → "Karnataka"); unknown codes pass through. */
export function stateLabel(code: string, lang: "en" | "hi" = "en"): string {
  return stateName(code, lang) ?? code;
}

// An explicit timeZone keeps server and client output identical (no hydration mismatch).
const IST_DATETIME = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const IST_DATE = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });

/** e.g. "5 Oct 2026, 14:34 IST". */
export function formatIst(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${IST_DATETIME.format(d)} IST`;
}

export function formatIstDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : IST_DATE.format(d);
}

export const SOURCE_LABELS: Record<string, string> = {
  sachet: "NDMA SACHET alerts",
  ncs: "NCS earthquakes",
  firms: "NASA FIRMS fires",
  aqi: "Air quality (CPCB)",
  pib: "PIB press releases",
  news: "Indian news",
  sports: "Sports",
};
