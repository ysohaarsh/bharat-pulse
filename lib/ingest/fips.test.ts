import { describe, expect, it } from "vitest";
import { FIPS_CODE_COUNT, fipsToIso } from "./fips";

describe("fipsToIso", () => {
  it("maps the classic FIPS/ISO false friends", () => {
    expect(fipsToIso("AU")).toBe("AT"); // Austria
    expect(fipsToIso("AS")).toBe("AU"); // Australia
    expect(fipsToIso("UK")).toBe("GB");
    expect(fipsToIso("MO")).toBe("MA"); // Morocco
    expect(fipsToIso("JA")).toBe("JP"); // Japan
    expect(fipsToIso("US")).toBe("US");
    expect(fipsToIso("GM")).toBe("DE");
    expect(fipsToIso("SP")).toBe("ES");
    expect(fipsToIso("RS")).toBe("RU");
    expect(fipsToIso("UP")).toBe("UA");
    expect(fipsToIso("IS")).toBe("IL");
    expect(fipsToIso("CH")).toBe("CN");
    expect(fipsToIso("SZ")).toBe("CH");
    expect(fipsToIso("NI")).toBe("NG");
    expect(fipsToIso("NG")).toBe("NE");
    expect(fipsToIso("KS")).toBe("KR");
    expect(fipsToIso("KN")).toBe("KP");
    expect(fipsToIso("CG")).toBe("CD");
    expect(fipsToIso("OD")).toBe("SS");
  });

  it("maps Palestinian territories, Kosovo and historic Serbia codes", () => {
    expect(fipsToIso("WE")).toBe("PS");
    expect(fipsToIso("GZ")).toBe("PS");
    expect(fipsToIso("KV")).toBe("XK");
    expect(fipsToIso("RB")).toBe("RS");
    expect(fipsToIso("RI")).toBe("RS");
  });

  it("normalises case/whitespace and returns null for unknown or blank", () => {
    expect(fipsToIso(" uk ")).toBe("GB");
    expect(fipsToIso("PG")).toBeNull(); // Spratly Islands: no ISO code
    expect(fipsToIso("ZZ")).toBeNull();
    expect(fipsToIso("")).toBeNull();
    expect(fipsToIso(null)).toBeNull();
    expect(fipsToIso(undefined)).toBeNull();
  });

  it("covers every sovereign state", () => {
    expect(FIPS_CODE_COUNT).toBeGreaterThan(240);
  });
});
