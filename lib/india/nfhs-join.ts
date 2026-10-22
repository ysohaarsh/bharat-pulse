/**
 * Pure helpers that join NFHS-5 district factsheet rows (2019-21, ~707 districts) to the Census 2011
 * district polygons (641). Used by scripts/build-nfhs.mjs (node strips the types) and unit-tested.
 * No imports on purpose, so node can load this file directly.
 */

export interface PolyDistrict {
  code: string;
  name: string;
  state_code: string;
}

export type MatchHow = "exact" | "paren" | "alias" | "fuzzy";

/** NFHS "State_UT" label -> polygon state codes (ISO 3166-2:IN) it can contain. */
export const NFHS_STATE_CODES: Record<string, string> = {
  "Andaman & Nicobar Islands": "IN-AN",
  "Andhra Pradesh": "IN-AP",
  "Arunachal Pradesh": "IN-AR",
  Assam: "IN-AS",
  Bihar: "IN-BR",
  Chandigarh: "IN-CH",
  Chhattisgarh: "IN-CG",
  "Dadra and Nagar Haveli & Daman and Diu": "IN-DH",
  "NCT of Delhi": "IN-DL",
  Goa: "IN-GA",
  Gujarat: "IN-GJ",
  Haryana: "IN-HR",
  "Himachal Pradesh": "IN-HP",
  "Jammu & Kashmir": "IN-JK",
  Jharkhand: "IN-JH",
  Karnataka: "IN-KA",
  Kerala: "IN-KL",
  Ladakh: "IN-LA",
  Lakshadweep: "IN-LD",
  "Madhya Pradesh": "IN-MP",
  Maharastra: "IN-MH", // sic: the portal's spelling
  Manipur: "IN-MN",
  Meghalaya: "IN-ML",
  Mizoram: "IN-MZ",
  Nagaland: "IN-NL",
  Odisha: "IN-OD",
  Puducherry: "IN-PY",
  Punjab: "IN-PB",
  Rajasthan: "IN-RJ",
  Sikkim: "IN-SK",
  "Tamil Nadu": "IN-TN",
  Telangana: "IN-TS",
  Tripura: "IN-TR",
  "Uttar Pradesh": "IN-UP",
  Uttarakhand: "IN-UK",
  "West Bengal": "IN-WB",
};

/** Lower-case, strip diacritics, drop the word "district" and everything that is not a letter or digit. */
export function normName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\bdistrict\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Normalised spellings to try for a name, most specific first: whole, without "(...)", the "(...)" part. */
export function nameVariants(s: string): string[] {
  const out = [normName(s)];
  const m = /^(.*?)\(([^)]*)\)\s*$/.exec(s);
  if (m) out.push(normName(m[1]), normName(m[2]));
  return out.filter((v, i) => v && out.indexOf(v) === i);
}

export function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

export interface AliasTable {
  split?: Record<string, string>;
  rename?: Record<string, string>;
  typo?: Record<string, string>;
}

export interface Match {
  code: string;
  how: MatchHow;
  /** For alias hits, which table section. */
  kind?: "split" | "rename" | "typo";
}

/**
 * Find the polygon an NFHS district belongs to. Order: exact normalised name inside the state,
 * "(...)" variants, manual alias table, then a unique edit-distance <= 2 spelling match (names >= 6 chars).
 */
export function matchDistrict(nfhsState: string, nfhsName: string, polys: PolyDistrict[], aliases: AliasTable = {}): Match | null {
  const stateCode = NFHS_STATE_CODES[nfhsState];
  if (!stateCode) return null;
  const inState = polys.filter((p) => p.state_code === stateCode);
  // Index each polygon under its full name first, then its "(...)"-stripped name ("Saran (chhapra)" -> saran).
  const byNorm = new Map<string, PolyDistrict>();
  for (const i of [0, 1, 2]) {
    for (const p of inState) {
      const v = nameVariants(p.name)[i];
      if (v && !byNorm.has(v)) byNorm.set(v, p);
    }
  }

  const variants = nameVariants(nfhsName);
  for (let i = 0; i < variants.length; i++) {
    const hit = byNorm.get(variants[i]);
    if (hit) return { code: hit.code, how: i === 0 ? "exact" : "paren" };
  }

  const key = `${nfhsState}|${nfhsName}`;
  for (const kind of ["split", "rename", "typo"] as const) {
    const target = aliases[kind]?.[key];
    const hit = target ? byNorm.get(normName(target)) : undefined;
    if (hit) return { code: hit.code, how: "alias", kind };
  }

  const n = variants[0];
  if (n.length >= 6) {
    let best: { p: PolyDistrict; d: number } | null = null;
    let tie = false;
    for (const p of inState) {
      const d = editDistance(n, normName(p.name));
      if (d > 2) continue;
      if (!best || d < best.d) {
        best = { p, d };
        tie = false;
      } else if (d === best.d) tie = true;
    }
    if (best && !tie) return { code: best.p.code, how: "fuzzy" };
  }
  return null;
}

/** NFHS marks small-sample cells by a negative number (shown in parentheses in the PDF) and suppressed cells by "*". */
export function parseCell(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? Math.abs(v) : null;
  if (typeof v === "string") {
    const n = Number(v.replace(/[()]/g, "").trim());
    return v.trim() !== "" && Number.isFinite(n) ? Math.abs(n) : null;
  }
  return null;
}

/** Mean of `values` weighted by `weights` (ignoring nulls); null when nothing is usable. */
export function weightedMean(values: (number | null)[], weights: number[]): number | null {
  let sum = 0;
  let w = 0;
  values.forEach((v, i) => {
    if (v == null) return;
    sum += v * weights[i];
    w += weights[i];
  });
  return w > 0 ? sum / w : null;
}
