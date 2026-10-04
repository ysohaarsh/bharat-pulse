import { describe, expect, it } from "vitest";
import { COUNTRY_COUNT, countryByCode, countryByName, detectCountry } from "./geo";

const code = (text: string) => detectCountry(text)?.country ?? null;

describe("detectCountry", () => {
  it("covers ~100+ countries", () => {
    expect(COUNTRY_COUNT).toBeGreaterThanOrEqual(100);
  });

  it("matches names, demonyms and capitals", () => {
    expect(code("Kyiv bridge hit in drone attack")).toBe("UA");
    expect(code("Ukrainian forces advance")).toBe("UA");
    expect(code("Ukraine's grain exports")).toBe("UA");
    expect(code("Talks in Tehran stall")).toBe("IR");
    expect(code("Ethiopian government forces seize Mekelle")).toBe("ET");
    expect(code("Brazilians head to the polls")).toBe("BR");
  });

  it("returns capital coordinates", () => {
    const m = detectCountry("Explosion reported in Kyiv");
    expect(m).toEqual({ country: "UA", lat: 50.45, lng: 30.52 });
  });

  it("is case-insensitive for names", () => {
    expect(code("BREAKING: FLOODS IN PAKISTAN")).toBe("PK");
    expect(code("floods in pakistan")).toBe("PK");
  });

  it("matches US/UK acronyms only in uppercase", () => {
    expect(code("US sanctions announced")).toBe("US");
    expect(code("U.S.-backed plan collapses")).toBe("US");
    expect(code("UK inflation slows")).toBe("GB");
    expect(code("Tell us what you think")).toBeNull();
  });

  it("prefers the longest alias", () => {
    expect(code("Clashes in South Sudan")).toBe("SS");
    expect(code("Papua New Guinea landslide")).toBe("PG");
    expect(code("Democratic Republic of the Congo outbreak")).toBe("CD");
    expect(code("Missile test by North Korea")).toBe("KP");
  });

  it("picks the most-mentioned country, ties to the earliest", () => {
    expect(code("Iran says Hormuz to remain closed until US meets conditions")).toBe("IR");
    expect(code("US envoy in Israel; Israeli officials and Netanyahu respond")).toBe("IL");
  });

  it("does not match inside other words or on sink phrases", () => {
    expect(code("Indiana governor signs bill")).toBeNull();
    expect(code("Flydubai flight delayed")).toBeNull();
    expect(code("Storms hit New Mexico")).toBeNull();
    expect(code("Latin American leaders meet")).toBeNull();
    expect(code("Georgia election officials certify results")).toBeNull();
  });

  it("matches the country Georgia only via unambiguous aliases", () => {
    expect(code("Protests in Tbilisi")).toBe("GE");
  });

  it("returns null for neutral text", () => {
    expect(code("Scientists say the new battery could charge in minutes")).toBeNull();
    expect(detectCountry("")).toBeNull();
    expect(detectCountry(null)).toBeNull();
  });
});

describe("countryByName / countryByCode", () => {
  it("resolves GDELT-style source country names", () => {
    expect(countryByName("United Kingdom")?.country).toBe("GB");
    expect(countryByName("India")?.country).toBe("IN");
    expect(countryByName("")).toBeNull();
    expect(countryByName("Atlantis")).toBeNull();
  });

  it("resolves ISO codes", () => {
    expect(countryByCode("fr")?.country).toBe("FR");
    expect(countryByCode("ZZ")).toBeNull();
  });
});
