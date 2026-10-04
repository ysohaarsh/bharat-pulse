import { describe, expect, it } from "vitest";
import { isCountryCode, parseWatchlistForm, splitList, toFormValues } from "./schema";

function form(fields: Record<string, string | string[]>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    for (const item of Array.isArray(v) ? v : [v]) fd.append(k, item);
  }
  return fd;
}

describe("splitList", () => {
  it("splits on commas/newlines, trims and dedupes case-insensitively", () => {
    expect(splitList(" a, b ,\nA,, c  d ")).toEqual(["a", "b", "c d"]);
    expect(splitList("")).toEqual([]);
  });
});

describe("isCountryCode", () => {
  it("accepts ISO-2 codes and rejects junk", () => {
    expect(isCountryCode("US")).toBe(true);
    expect(isCountryCode("JP")).toBe(true);
    expect(isCountryCode("ZZ")).toBe(false);
    expect(isCountryCode("XX")).toBe(false);
    expect(isCountryCode("usa")).toBe(false);
    expect(isCountryCode("us")).toBe(false);
  });
});

describe("parseWatchlistForm", () => {
  it("normalizes a valid submission", () => {
    const r = parseWatchlistForm(
      form({
        name: "  Pacific quakes ",
        countries: "jp, us, UK, JP",
        categories: ["volcano", "earthquake"],
        keywords: "tsunami, Tsunami, aftershock",
        min_severity: "3",
      }),
    );
    expect(r.success).toBe(true);
    expect(r.data).toEqual({
      name: "Pacific quakes",
      countries: ["JP", "US", "GB"],
      categories: ["earthquake", "volcano"],
      keywords: ["tsunami", "aftershock"],
      min_severity: 3,
    });
  });

  it("allows empty filters (match everything) and defaults severity to 1", () => {
    const r = parseWatchlistForm(form({ name: "All", countries: "", keywords: "" }));
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ countries: [], categories: [], keywords: [], min_severity: 1 });
  });

  it("reports field errors", () => {
    const r = parseWatchlistForm(
      form({ name: " ", countries: "USA", categories: ["aliens"], keywords: "x", min_severity: "9" }),
    );
    expect(r.success).toBe(false);
    const paths = new Set(r.error!.issues.map((i) => String(i.path[0])));
    expect(paths).toEqual(new Set(["name", "countries", "categories", "keywords", "min_severity"]));
  });

  it("rejects too many keywords", () => {
    const kws = Array.from({ length: 21 }, (_, i) => `kw${i}`).join(",");
    expect(parseWatchlistForm(form({ name: "n", keywords: kws })).success).toBe(false);
  });
});

describe("toFormValues", () => {
  it("round-trips a stored row", () => {
    const v = toFormValues({
      name: "x",
      countries: ["US", "GB"],
      categories: ["storm", "bogus"],
      keywords: ["a b", "c"],
      min_severity: 2,
    });
    expect(v).toEqual({ name: "x", countries: "US, GB", categories: ["storm"], keywords: "a b, c", min_severity: "2" });
  });
});
