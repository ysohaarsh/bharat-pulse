import STATES_JSON from "./states.json";

/**
 * The 36 states and union territories, keyed by ISO 3166-2:IN code (2023 revision:
 * CG, OD, TS, UK). This is the single source for state names across ingesters, the
 * boundary loader (scripts/build-geo.mjs reads the JSON directly), stats and the UI.
 */
export interface IndianState {
  code: string;
  name: string;
  /** Hindi name. */
  hi: string;
  /** Other spellings seen in source data (old names, "&" forms, ECI/sansad variants). */
  aliases: string[];
}

export const STATES: readonly IndianState[] = STATES_JSON;

const BY_CODE = new Map(STATES.map((s) => [s.code, s]));

/** Lowercase, "&" → "and", letters only — so "Jammu & Kashmir" and "JAMMU AND KASHMIR" agree. */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z]/g, "");
}

const BY_NAME = new Map<string, IndianState>();
for (const s of STATES) {
  for (const n of [s.name, ...s.aliases]) BY_NAME.set(normalizeName(n), s);
}

export function stateByCode(code: string | null | undefined): IndianState | null {
  return code ? (BY_CODE.get(code) ?? null) : null;
}

/** Exact (normalised) state name or alias → state. */
export function stateByName(name: string | null | undefined): IndianState | null {
  return name ? (BY_NAME.get(normalizeName(name)) ?? null) : null;
}

/** Display name for a state code; unknown codes pass through, null → null. */
export function stateName(code: string | null | undefined, lang: "en" | "hi" = "en"): string | null {
  if (!code) return null;
  const s = BY_CODE.get(code);
  if (!s) return code;
  return lang === "hi" ? s.hi : s.name;
}

/** Short label for chips and tight UI: "KA" for "IN-KA". */
export function stateShort(code: string): string {
  return code.startsWith("IN-") ? code.slice(3) : code;
}

export function isStateCode(code: string): boolean {
  return BY_CODE.has(code);
}
