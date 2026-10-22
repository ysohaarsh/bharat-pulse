/** NFHS-5 (2019-21) district indicators shown on the map. `col` is the data.gov.in column id. */
export const NFHS_KEYS = ["an", "st", "wa", "mh", "ib", "sa", "lw", "sr"] as const;
export type NfhsKey = (typeof NFHS_KEYS)[number];

export interface NfhsIndicator {
  key: NfhsKey;
  col: string;
  /** Dictionary key of the dropdown label. */
  label: "nfhsAnaemia" | "nfhsStunting" | "nfhsWasting" | "nfhsMenstrual" | "nfhsInstBirth" | "nfhsSanitation" | "nfhsLiteracy" | "nfhsSexRatio";
  unit: "%" | "";
  /** true: a high value is bad (darker = worse). false: high is good (darker = better). */
  badHigh: boolean;
  /** 4 upper-exclusive break points -> 5 classes. Fixed bins from the district quantiles (rounded). */
  bins: [number, number, number, number];
}

export const NFHS_INDICATORS: NfhsIndicator[] = [
  { key: "an", col: "Anaemic_All_Women_15-49", label: "nfhsAnaemia", unit: "%", badHigh: true, bins: [46, 54, 60, 65] },
  { key: "st", col: "Stunted_Children_Under_Five", label: "nfhsStunting", unit: "%", badHigh: true, bins: [25, 30, 36, 41] },
  { key: "wa", col: "Wasted_Children_Under_Five", label: "nfhsWasting", unit: "%", badHigh: true, bins: [12, 16, 20, 24] },
  { key: "mh", col: "Hygienic_Menstrual_Protection_Use", label: "nfhsMenstrual", unit: "%", badHigh: false, bins: [65, 75, 85, 93] },
  { key: "ib", col: "Institutional_Birth", label: "nfhsInstBirth", unit: "%", badHigh: false, bins: [81, 90, 95, 98] },
  { key: "sa", col: "Household_Using_Improved_Sanitation", label: "nfhsSanitation", unit: "%", badHigh: false, bins: [60, 69, 78, 85] },
  { key: "lw", col: "Literate_Women", label: "nfhsLiteracy", unit: "%", badHigh: false, bins: [64, 72, 78, 86] },
  { key: "sr", col: "Sex_Ratio_At_Birth", label: "nfhsSexRatio", unit: "", badHigh: false, bins: [850, 900, 960, 1030] },
];

export const NFHS_BY_KEY = Object.fromEntries(NFHS_INDICATORS.map((i) => [i.key, i])) as Record<NfhsKey, NfhsIndicator>;

/** Sequential ramps from the Bahi-Khata tokens: paper-2 -> haldi -> maroon (bad) / paper-2 -> teal (good). */
export const NFHS_RAMP_BAD = ["#efe5cd", "#e6bf68", "#d99a1e", "#b0231c", "#5a1414"] as const;
export const NFHS_RAMP_GOOD = ["#efe5cd", "#b7d4cf", "#6fb0a9", "#0f6e6e", "#0a3f3f"] as const;

export function nfhsRamp(ind: NfhsIndicator): readonly string[] {
  return ind.badHigh ? NFHS_RAMP_BAD : NFHS_RAMP_GOOD;
}

/** Class index 0-4 of a value. */
export function nfhsClass(ind: NfhsIndicator, v: number): number {
  let i = 0;
  while (i < 4 && v >= ind.bins[i]) i++;
  return i;
}

/** Per-district record: short keys, `w` = women interviewed (weight) is not shipped; `n` = NFHS districts merged. */
export type NfhsRow = Partial<Record<NfhsKey, number>> & { n?: number };
export interface NfhsFile {
  /** All-district average per indicator (weighted by women interviewed). */
  nat: Partial<Record<NfhsKey, number>>;
  /** State/UT average of its NFHS districts, keyed by ISO code (IN-MH...). */
  s: Record<string, Partial<Record<NfhsKey, number>>>;
  /** District code -> row. */
  d: Record<string, NfhsRow>;
}
