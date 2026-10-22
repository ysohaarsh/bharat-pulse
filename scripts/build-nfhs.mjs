// Builds the NFHS-5 district choropleth data (run: `npm run nfhs:build`).
//
// Inputs (both gitignored, see docs/DATA_GOV_IN.md "NFHS-5" for how to refresh them):
//   data/raw/nfhs5-districts.json    data.gov.in resource cf80173e-fece-439d-a0b1-6e9cb510593d
//                                    ({meta, records}, all 707 rows of the NFHS-5 district factsheets, 2019-21)
//   data/processed/districts.geojson Census 2011 district polygons from `npm run geo:build` (641, codes DT:<n>)
//
// Outputs (committed):
//   public/geo/nfhs5-districts.json  { nat, s, d }: indicator values keyed by polygon district code
//   public/geo/districts.geojson     lightweight district polygons (code, name, state_code) for the map
//
// Join rules (lib/india/nfhs-join.ts, aliases in lib/india/nfhs-aliases.json):
//   1. normalised name inside the state (case, diacritics, "District", punctuation), incl. "(...)" variants
//   2. manual alias table: renames/typos, and districts created after 2011 -> their 2011 parent
//   3. unique edit-distance <= 2 spelling match inside the state
//   Several NFHS districts can land on one polygon (a parent plus its post-2011 children, ~60 cases):
//   the polygon gets the mean of all of them weighted by women interviewed (survey sample size, a rough
//   proxy for population). NFHS "(x)" small-sample values arrive as negative numbers: we use |x|; "*" = no value.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import mapshaper from "mapshaper";
import { matchDistrict, NFHS_STATE_CODES, parseCell, weightedMean } from "../lib/india/nfhs-join.ts";
import { NFHS_INDICATORS } from "../lib/india/nfhs.ts";

const ROOT = process.cwd();
const RAW = path.join(ROOT, "data", "raw", "nfhs5-districts.json");
const DISTRICTS = path.join(ROOT, "data", "processed", "districts.geojson");
const OUT_DIR = path.join(ROOT, "public", "geo");
const aliases = JSON.parse(readFileSync(path.join(ROOT, "lib", "india", "nfhs-aliases.json"), "utf8"));

const { records } = JSON.parse(readFileSync(RAW, "utf8"));
const fc = JSON.parse(readFileSync(DISTRICTS, "utf8"));
const polys = fc.features.map((f) => f.properties);

// ---- join ----
const byPoly = new Map();
const unmatched = [];
const how = { exact: 0, paren: 0, alias: 0, fuzzy: 0 };
const fuzzy = [];
for (const r of records) {
  const m = matchDistrict(r.State_UT, r.District_Names, polys, aliases);
  if (!m) {
    unmatched.push(`${r.State_UT} | ${r.District_Names}`);
    continue;
  }
  how[m.how]++;
  if (m.how === "fuzzy") fuzzy.push(`${r.State_UT} | ${r.District_Names} -> ${polys.find((p) => p.code === m.code).name}`);
  if (!byPoly.has(m.code)) byPoly.set(m.code, []);
  byPoly.get(m.code).push(r);
}

// ---- aggregate ----
const round = (key, v) => (key === "sr" ? Math.round(v) : Math.round(v * 10) / 10);
function aggregate(rows) {
  const w = rows.map((r) => parseCell(r.Women_Age_Interviewed) ?? 1);
  const out = {};
  for (const ind of NFHS_INDICATORS) {
    const v = weightedMean(rows.map((r) => parseCell(r[ind.col])), w);
    if (v != null) out[ind.key] = round(ind.key, v);
  }
  return out;
}

const d = {};
for (const [code, rows] of byPoly) {
  const row = aggregate(rows);
  if (Object.keys(row).length) {
    if (rows.length > 1) row.n = rows.length;
    d[code] = row;
  }
}
const stateRows = {};
for (const r of records) {
  const sc = NFHS_STATE_CODES[r.State_UT];
  if (sc) (stateRows[sc] ??= []).push(r);
}
const s = Object.fromEntries(Object.entries(stateRows).map(([sc, rows]) => [sc, aggregate(rows)]));
const nat = aggregate(records);

mkdirSync(OUT_DIR, { recursive: true });
const json = JSON.stringify({ nat, s, d });
writeFileSync(path.join(OUT_DIR, "nfhs5-districts.json"), json + "\n");

// ---- light polygons for the map ----
const geo = await mapshaper.applyCommands(
  `-i ${JSON.stringify(DISTRICTS)} -simplify 25% keep-shapes -o out.json format=geojson precision=0.001`,
);
const light = JSON.parse(geo["out.json"].toString());
for (const f of light.features) {
  const { code, name, state_code } = f.properties;
  f.properties = { code, name, state_code };
}
const lightJson = JSON.stringify(light);
writeFileSync(path.join(OUT_DIR, "districts.geojson"), lightJson);

// ---- report ----
const real = polys.filter((p) => p.name !== "Data Not Available");
const covered = real.filter((p) => d[p.code]);
const quant = (key) => {
  const v = Object.values(d).map((r) => r[key]).filter((x) => x != null).sort((a, b) => a - b);
  return [0.2, 0.4, 0.6, 0.8].map((q) => v[Math.floor(q * v.length)]);
};
console.log(`NFHS rows matched: ${records.length - unmatched.length}/${records.length}`, how);
console.log(`polygons with data: ${covered.length}/${real.length} (${((covered.length / real.length) * 100).toFixed(1)}%)`);
console.log(`polygons fed by >1 NFHS district: ${Object.values(d).filter((r) => r.n).length}`);
console.log("polygons without data:", real.filter((p) => !d[p.code]).map((p) => `${p.name} (${p.state_code})`).join("; ") || "none");
console.log("unmatched NFHS rows:", unmatched.join("; ") || "none");
console.log("fuzzy matches (review):\n  " + fuzzy.join("\n  "));
console.log("quintile breaks:", Object.fromEntries(NFHS_INDICATORS.map((i) => [i.key, quant(i.key)])));
console.log("national (all-district weighted):", nat);
console.log(`wrote public/geo/nfhs5-districts.json (${(json.length / 1024).toFixed(1)} KB), public/geo/districts.geojson (${(lightJson.length / 1024).toFixed(0)} KB)`);
