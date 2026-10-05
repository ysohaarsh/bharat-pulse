import { describe, expect, it } from "vitest";
import { parseWatchlistForm, splitList, toFormValues, toStateCode } from "./schema";

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

describe("toStateCode", () => {
  it("accepts names, short codes and ISO codes; rejects junk", () => {
    expect(toStateCode("Karnataka")).toBe("IN-KA");
    expect(toStateCode("ka")).toBe("IN-KA");
    expect(toStateCode("IN-TS")).toBe("IN-TS");
    expect(toStateCode("Orissa")).toBe("IN-OD");
    expect(toStateCode("Jammu & Kashmir")).toBe("IN-JK");
    expect(toStateCode("ZZ")).toBeNull();
    expect(toStateCode("India")).toBeNull();
  });
});

describe("parseWatchlistForm", () => {
  it("normalizes a valid submission", () => {
    const r = parseWatchlistForm(
      form({
        name: "  Himalayan quakes ",
        states: "uk, Himachal Pradesh, IN-UK, J&K",
        categories: ["flood", "earthquake"],
        keywords: "tsunami, Tsunami, aftershock",
        min_severity: "3",
      }),
    );
    expect(r.success).toBe(true);
    expect(r.data).toEqual({
      name: "Himalayan quakes",
      states: ["IN-UK", "IN-HP", "IN-JK"],
      categories: ["flood", "earthquake"],
      keywords: ["tsunami", "aftershock"],
      min_severity: 3,
    });
  });

  it("allows empty filters (match everything) and defaults severity to 1", () => {
    const r = parseWatchlistForm(form({ name: "All", states: "", keywords: "" }));
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ states: [], categories: [], keywords: [], min_severity: 1 });
  });

  it("reports field errors", () => {
    const r = parseWatchlistForm(
      form({ name: " ", states: "Atlantis", categories: ["aliens"], keywords: "x", min_severity: "9" }),
    );
    expect(r.success).toBe(false);
    const paths = new Set(r.error!.issues.map((i) => String(i.path[0])));
    expect(paths).toEqual(new Set(["name", "states", "categories", "keywords", "min_severity"]));
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
      states: ["US", "GB"],
      categories: ["cyclone", "bogus"],
      keywords: ["a b", "c"],
      min_severity: 2,
    });
    expect(v).toEqual({ name: "x", states: "US, GB", categories: ["cyclone"], keywords: "a b, c", min_severity: "2" });
  });
});
