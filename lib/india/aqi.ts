/**
 * India's National Air Quality Index (CPCB, 2014): bands and the PM sub-index breakpoints.
 * Shared by the AQI ingester (to compute AQI from concentrations) and the UI (band colours).
 */

export interface AqiBand {
  max: number;
  label: string;
  hi: string;
  color: string;
}

export const AQI_BANDS: readonly AqiBand[] = [
  { max: 50, label: "Good", hi: "अच्छा", color: "#1f8f3a" },
  { max: 100, label: "Satisfactory", hi: "संतोषजनक", color: "#7fa31a" },
  { max: 200, label: "Moderate", hi: "मध्यम", color: "#d4a300" },
  { max: 300, label: "Poor", hi: "खराब", color: "#e07b00" },
  { max: 400, label: "Very Poor", hi: "बहुत खराब", color: "#d6254b" },
  { max: Infinity, label: "Severe", hi: "गंभीर", color: "#8f0f10" },
];

export function aqiBand(aqi: number): AqiBand {
  return AQI_BANDS.find((b) => aqi <= b.max) ?? AQI_BANDS[AQI_BANDS.length - 1];
}

/** [concentration low, high, index low, high] segments (µg/m³, 24-hour). */
type Breakpoints = [number, number, number, number][];

const PM25: Breakpoints = [
  [0, 30, 0, 50],
  [30, 60, 50, 100],
  [60, 90, 100, 200],
  [90, 120, 200, 300],
  [120, 250, 300, 400],
  [250, 500, 400, 500],
];

const PM10: Breakpoints = [
  [0, 50, 0, 50],
  [50, 100, 50, 100],
  [100, 250, 100, 200],
  [250, 350, 200, 300],
  [350, 430, 300, 400],
  [430, 800, 400, 500],
];

function subIndex(c: number, bp: Breakpoints): number {
  if (!Number.isFinite(c) || c < 0) return NaN;
  for (const [cLo, cHi, iLo, iHi] of bp) {
    if (c <= cHi) return Math.round(iLo + ((iHi - iLo) * (c - cLo)) / (cHi - cLo));
  }
  return 500;
}

/** NAQI from PM2.5 / PM10 concentrations: the worse sub-index. NaN when neither is known. */
export function naqiFromPm(pm25: number | null | undefined, pm10: number | null | undefined): number {
  const a = pm25 == null ? NaN : subIndex(pm25, PM25);
  const b = pm10 == null ? NaN : subIndex(pm10, PM10);
  if (Number.isNaN(a)) return b;
  if (Number.isNaN(b)) return a;
  return Math.max(a, b);
}
