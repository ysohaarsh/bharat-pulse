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

/** [concentration low, high, index low, high] segments. */
type Breakpoints = [number, number, number, number][];

/**
 * CPCB National Air Quality Index breakpoint table (CPCB, "National Air Quality Index", 2014,
 * Table 2: https://cpcb.nic.in/uploads/National_Air_Quality_Index.pdf). Index bands
 * 0-50 / 51-100 / 101-200 / 201-300 / 301-400 / 401-500; units ug/m3 except CO (mg/m3).
 * PM10, PM2.5, NO2, SO2, NH3 are 24-h averages; O3 and CO are 8-h averages.
 * Segments are stored continuously (each starts where the last ended, e.g. PM2.5 30-60 -> 50-100)
 * and interpolated linearly, as `subIndex` does. The open-ended top band is closed at a
 * plausible upper value, and anything above it is capped at 500.
 */
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

const NO2: Breakpoints = [
  [0, 40, 0, 50],
  [40, 80, 50, 100],
  [80, 180, 100, 200],
  [180, 280, 200, 300],
  [280, 400, 300, 400],
  [400, 800, 400, 500],
];

const SO2: Breakpoints = [
  [0, 40, 0, 50],
  [40, 80, 50, 100],
  [80, 380, 100, 200],
  [380, 800, 200, 300],
  [800, 1600, 300, 400],
  [1600, 2400, 400, 500],
];

const NH3: Breakpoints = [
  [0, 200, 0, 50],
  [200, 400, 50, 100],
  [400, 800, 100, 200],
  [800, 1200, 200, 300],
  [1200, 1800, 300, 400],
  [1800, 2400, 400, 500],
];

/** 8-hour ozone. */
const O3: Breakpoints = [
  [0, 50, 0, 50],
  [50, 100, 50, 100],
  [100, 168, 100, 200],
  [168, 208, 200, 300],
  [208, 748, 300, 400],
  [748, 1000, 400, 500],
];

/** Pollutants we compute a sub-index for, keyed by the CPCB feed's `pollutant_id`. CO is deliberately absent (see aqi ingester). */
export const NAQI_BREAKPOINTS = { "PM2.5": PM25, PM10, NO2, SO2, NH3, OZONE: O3 } as const;
export type NaqiPollutant = keyof typeof NAQI_BREAKPOINTS;

function subIndex(c: number, bp: Breakpoints): number {
  if (!Number.isFinite(c) || c < 0) return NaN;
  for (const [cLo, cHi, iLo, iHi] of bp) {
    if (c <= cHi) return Math.round(iLo + ((iHi - iLo) * (c - cLo)) / (cHi - cLo));
  }
  return 500;
}

/** NAQI sub-index (0-500) of one pollutant concentration; NaN for an unknown pollutant or bad value. */
export function naqiSubIndex(pollutant: string, concentration: number): number {
  const bp = (NAQI_BREAKPOINTS as Record<string, Breakpoints>)[pollutant];
  return bp ? subIndex(concentration, bp) : NaN;
}

/** NAQI from PM2.5 / PM10 concentrations: the worse sub-index. NaN when neither is known. */
export function naqiFromPm(pm25: number | null | undefined, pm10: number | null | undefined): number {
  const a = pm25 == null ? NaN : subIndex(pm25, PM25);
  const b = pm10 == null ? NaN : subIndex(pm10, PM10);
  if (Number.isNaN(a)) return b;
  if (Number.isNaN(b)) return a;
  return Math.max(a, b);
}
