import { describe, expect, it } from "vitest";
import aliases from "./nfhs-aliases.json";
import nfhs from "../../public/geo/nfhs5-districts.json";
import { readFileSync } from "node:fs";
import path from "node:path";
import { NFHS_INDICATORS, nfhsClass, type NfhsFile } from "./nfhs";
import { editDistance, matchDistrict, nameVariants, normName, parseCell, weightedMean, type PolyDistrict } from "./nfhs-join";

const polys: PolyDistrict[] = [
  { code: "DT:1", name: "Gurgaon", state_code: "IN-HR" },
  { code: "DT:2", name: "Allahabad", state_code: "IN-UP" },
  { code: "DT:3", name: "Faizabad", state_code: "IN-UP" },
  { code: "DT:4", name: "Saran (chhapra)", state_code: "IN-BR" },
  { code: "DT:5", name: "Sultanpur", state_code: "IN-UP" },
  { code: "DT:6", name: "Kanshiram Nagar", state_code: "IN-UP" },
  { code: "DT:7", name: "East", state_code: "IN-SK" },
  { code: "DT:8", name: "Bilaspur", state_code: "IN-HP" },
  { code: "DT:9", name: "Bilaspur", state_code: "IN-CG" },
  { code: "DT:10", name: "Leh (ladakh)", state_code: "IN-LA" },
];

describe("normName", () => {
  it("ignores case, diacritics, punctuation and the word District", () => {
    expect(normName("Sant Ravidas Nagar (Bhadohi)")).toBe(normName("Sant Ravi Das Nagar(bhadohi)"));
    expect(normName("East District")).toBe("east");
    expect(normName("  North  District")).toBe("north");
    expect(normName("Cuddalore")).toBe("cuddalore");
    expect(normName("Dindigul – Café")).toBe("dindigulcafe");
  });
  it("lists paren variants", () => {
    expect(nameVariants("Saran (chhapra)")).toEqual(["saranchhapra", "saran", "chhapra"]);
    expect(nameVariants("Mau")).toEqual(["mau"]);
  });
});

describe("editDistance", () => {
  it("counts single edits", () => {
    expect(editDistance("nicobar", "nicobars")).toBe(1);
    expect(editDistance("abc", "abc")).toBe(0);
    expect(editDistance("kitten", "sitting")).toBe(3);
  });
});

describe("matchDistrict", () => {
  it("matches exact names inside the state only", () => {
    expect(matchDistrict("Haryana", "Gurgaon", polys, aliases)).toEqual({ code: "DT:1", how: "exact" });
    expect(matchDistrict("Himachal Pradesh", "Bilaspur", polys, aliases)?.code).toBe("DT:8");
    expect(matchDistrict("Chhattisgarh", "Bilaspur", polys, aliases)?.code).toBe("DT:9");
    expect(matchDistrict("Haryana", "Allahabad", polys, aliases)).toBeNull();
  });
  it("matches the NFHS name against a polygon name with brackets, both ways", () => {
    expect(matchDistrict("Bihar", "Saran", polys, aliases)).toEqual({ code: "DT:4", how: "exact" });
    expect(matchDistrict("Bihar", "Saran (Chhapra)", polys, aliases)).toEqual({ code: "DT:4", how: "exact" });
    expect(matchDistrict("Ladakh", "Leh(Ladakh)", polys, aliases)?.code).toBe("DT:10");
  });
  it("strips the District suffix", () => {
    expect(matchDistrict("Sikkim", "East District", polys, aliases)?.code).toBe("DT:7");
  });
  it("maps post-2011 districts to their 2011 parent via the alias table", () => {
    expect(matchDistrict("Uttar Pradesh", "Amethi", polys, aliases)).toEqual({ code: "DT:5", how: "alias", kind: "split" });
  });
  it("tolerates small spelling differences when unambiguous", () => {
    expect(matchDistrict("Uttar Pradesh", "Kansiram Nagar", polys, aliases)).toEqual({ code: "DT:6", how: "fuzzy" });
  });
  it("returns null for unknown states and unmatched names", () => {
    expect(matchDistrict("Atlantis", "Gurgaon", polys, aliases)).toBeNull();
    expect(matchDistrict("Uttar Pradesh", "Totallydifferent", polys, aliases)).toBeNull();
  });
  it("never fuzzy-matches short names", () => {
    expect(matchDistrict("Sikkim", "Eest", polys, aliases)).toBeNull();
  });
});

describe("cells and averages", () => {
  it("parses numbers, small-sample negatives and suppressed cells", () => {
    expect(parseCell(12.5)).toBe(12.5);
    expect(parseCell(-26.4)).toBe(26.4);
    expect(parseCell("49.4")).toBe(49.4);
    expect(parseCell("(7.1)")).toBe(7.1);
    expect(parseCell("*")).toBeNull();
    expect(parseCell("")).toBeNull();
    expect(parseCell(undefined)).toBeNull();
  });
  it("weights by sample size and skips missing values", () => {
    expect(weightedMean([10, 20], [1, 3])).toBe(17.5);
    expect(weightedMean([10, null], [1, 3])).toBe(10);
    expect(weightedMean([null], [1])).toBeNull();
  });
});

describe("shipped NFHS-5 file", () => {
  const file = nfhs as unknown as NfhsFile;
  const districts = JSON.parse(readFileSync(path.join(process.cwd(), "public/geo/districts.geojson"), "utf8")) as GeoJSON.FeatureCollection;
  const codes = districts.features.filter((f) => f.properties?.name !== "Data Not Available").map((f) => String(f.properties?.code));
  it("covers at least 95% of the district polygons", () => {
    const covered = codes.filter((c) => file.d[c]).length;
    expect(covered / codes.length).toBeGreaterThanOrEqual(0.95);
  });
  it("keeps values in range and gives a class for every value", () => {
    for (const row of Object.values(file.d)) {
      for (const ind of NFHS_INDICATORS) {
        const v = row[ind.key];
        if (v == null) continue;
        expect(v).toBeGreaterThanOrEqual(0);
        expect(nfhsClass(ind, v)).toBeGreaterThanOrEqual(0);
        expect(nfhsClass(ind, v)).toBeLessThanOrEqual(4);
      }
    }
  });
  it("classifies on the break points", () => {
    const an = NFHS_INDICATORS[0];
    expect(nfhsClass(an, 10)).toBe(0);
    expect(nfhsClass(an, an.bins[0])).toBe(1);
    expect(nfhsClass(an, 99)).toBe(4);
  });
});
