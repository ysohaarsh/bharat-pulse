import { describe, expect, it } from "vitest";
import { CATEGORIES, SOURCES, type EventRow } from "@/lib/types";
import {
  DEFAULT_FILTERS,
  type EventFilters,
  filtersKey,
  matchesFilters,
  parseFilters,
  selectAllCategories,
  serializeFilters,
  sportsEnabled,
  toggleCategory,
  toggleValue,
} from "./filters";
import { CORE_CATEGORIES, CORE_SOURCES } from "./sports";
import { mergeIncoming } from "./merge";
import { toEventRow } from "./row";

const NOW = Date.parse("2026-10-04T12:00:00Z");

function ev(over: Partial<EventRow> = {}): EventRow {
  return {
    id: 1,
    source: "usgs",
    external_id: "x1",
    title: "M5.1 - somewhere",
    summary: null,
    category: "earthquake",
    severity: 3,
    lat: 10,
    lng: 20,
    country: "JP",
    url: "https://example.com",
    occurred_at: "2026-10-04T11:30:00Z",
    created_at: "2026-10-04T11:31:00Z",
    ...over,
  };
}

describe("parseFilters", () => {
  it("returns defaults for empty / missing params", () => {
    expect(parseFilters(undefined)).toEqual(DEFAULT_FILTERS);
    expect(parseFilters({})).toEqual(DEFAULT_FILTERS);
    expect(parseFilters(new URLSearchParams())).toEqual(DEFAULT_FILTERS);
  });

  it("parses a Next searchParams record", () => {
    expect(parseFilters({ cat: "wildfire,earthquake", src: "usgs", sev: "3", win: "6h" })).toEqual({
      categories: ["earthquake", "wildfire"], // canonical order
      sources: ["usgs"],
      minSeverity: 3,
      window: "6h",
    });
  });

  it("parses URLSearchParams and takes the first value of arrays", () => {
    expect(parseFilters(new URLSearchParams("win=7d&sev=5")).window).toBe("7d");
    expect(parseFilters({ win: ["1h", "7d"] }).window).toBe("1h");
  });

  it("ignores junk and clamps severity", () => {
    const f = parseFilters({ cat: "nope,,FLOOD", src: "twitter", sev: "99", win: "3d" });
    expect(f.categories).toEqual(["flood"]);
    expect(f.sources).toEqual([...CORE_SOURCES]);
    expect(f.minSeverity).toBe(5);
    expect(f.window).toBe("24h");
    expect(parseFilters({ sev: "-2" }).minSeverity).toBe(1);
    expect(parseFilters({ sev: "abc" }).minSeverity).toBe(1);
  });

  it("treats an empty list as all", () => {
    expect(parseFilters({ cat: "" }).categories).toEqual([...CORE_CATEGORIES]);
  });
});

describe("serializeFilters", () => {
  it("omits defaults", () => {
    expect(serializeFilters(DEFAULT_FILTERS).toString()).toBe("");
  });

  it("round-trips through parseFilters", () => {
    const f: EventFilters = {
      categories: ["storm", "conflict"],
      sources: ["gdelt", "rss"],
      minSeverity: 4,
      window: "1h",
    };
    const qs = serializeFilters(f).toString();
    expect(qs).toBe("cat=storm%2Cconflict&src=gdelt%2Crss&sev=4&win=1h");
    expect(parseFilters(new URLSearchParams(qs))).toEqual(f);
  });

  it("filtersKey is order-insensitive", () => {
    const a = { ...DEFAULT_FILTERS, categories: ["flood", "storm"] } as EventFilters;
    const b = { ...DEFAULT_FILTERS, categories: ["storm", "flood"] } as EventFilters;
    expect(filtersKey(a)).toBe(filtersKey(b));
  });
});

describe("matchesFilters", () => {
  it("matches with default filters inside the window", () => {
    expect(matchesFilters(ev(), DEFAULT_FILTERS, NOW)).toBe(true);
    expect(matchesFilters(ev(), DEFAULT_FILTERS, new Date(NOW))).toBe(true);
  });

  it("filters by category, source and severity", () => {
    const f: EventFilters = { ...DEFAULT_FILTERS, categories: ["flood"] };
    expect(matchesFilters(ev(), f, NOW)).toBe(false);
    expect(matchesFilters(ev({ category: "flood" }), f, NOW)).toBe(true);
    expect(matchesFilters(ev(), { ...DEFAULT_FILTERS, sources: ["rss"] }, NOW)).toBe(false);
    expect(matchesFilters(ev({ severity: 2 }), { ...DEFAULT_FILTERS, minSeverity: 3 }, NOW)).toBe(false);
    expect(matchesFilters(ev({ severity: 3 }), { ...DEFAULT_FILTERS, minSeverity: 3 }, NOW)).toBe(true);
  });

  it("respects the time window boundary", () => {
    const f: EventFilters = { ...DEFAULT_FILTERS, window: "1h" };
    expect(matchesFilters(ev({ occurred_at: "2026-10-04T11:00:00Z" }), f, NOW)).toBe(true);
    expect(matchesFilters(ev({ occurred_at: "2026-10-04T10:59:59Z" }), f, NOW)).toBe(false);
    expect(matchesFilters(ev({ occurred_at: "not a date" }), f, NOW)).toBe(false);
  });
});

describe("sports opt-in", () => {
  const sportsEv = ev({ source: "sports", category: "sports", severity: 1, country: null, lat: null, lng: null });

  it("is hidden by default: defaults exclude the sports category and source", () => {
    expect(DEFAULT_FILTERS.categories).not.toContain("sports");
    expect(DEFAULT_FILTERS.sources).not.toContain("sports");
    expect(DEFAULT_FILTERS.categories).toEqual(CATEGORIES.filter((c) => c !== "sports"));
    expect(DEFAULT_FILTERS.sources).toEqual(SOURCES.filter((s) => s !== "sports"));
    expect(sportsEnabled(DEFAULT_FILTERS)).toBe(false);
    expect(matchesFilters(sportsEv, DEFAULT_FILTERS, NOW)).toBe(false);
    // Anything sports-flavoured stays hidden, whichever field says so.
    expect(matchesFilters(ev({ category: "sports" }), DEFAULT_FILTERS, NOW)).toBe(false);
    expect(matchesFilters(ev({ source: "sports" }), DEFAULT_FILTERS, NOW)).toBe(false);
  });

  it("keeps old links meaning exactly what they did", () => {
    expect(parseFilters({}).categories).not.toContain("sports");
    expect(parseFilters({ cat: "flood,storm" }).categories).toEqual(["storm", "flood"]);
    expect(parseFilters({ src: "rss" }).sources).toEqual(["rss"]);
  });

  it("shows sports alongside everything else when opted in", () => {
    const f = parseFilters({ sports: "1" });
    expect(sportsEnabled(f)).toBe(true);
    expect(f.categories).toEqual([...CATEGORIES]);
    expect(f.sources).toEqual([...CORE_SOURCES]);
    expect(matchesFilters(sportsEv, f, NOW)).toBe(true);
    expect(matchesFilters(ev(), f, NOW)).toBe(true);
    // Source chips don't hide sports; severity and window still apply.
    expect(matchesFilters(sportsEv, { ...f, sources: ["usgs"] }, NOW)).toBe(true);
    expect(matchesFilters(sportsEv, { ...f, minSeverity: 2 }, NOW)).toBe(false);
    expect(matchesFilters({ ...sportsEv, occurred_at: "2026-10-01T00:00:00Z" }, f, NOW)).toBe(false);
  });

  it("round-trips sports on through the URL", () => {
    const on: EventFilters = { ...DEFAULT_FILTERS, categories: [...CATEGORIES] };
    expect(serializeFilters(on).toString()).toBe("sports=1");
    expect(parseFilters(serializeFilters(on))).toEqual(on);

    const partial: EventFilters = { ...DEFAULT_FILTERS, categories: ["flood", "sports"], window: "7d" };
    expect(serializeFilters(partial).toString()).toBe("cat=flood&sports=1&win=7d");
    expect(parseFilters(serializeFilters(partial))).toEqual(partial);

    const only: EventFilters = { ...DEFAULT_FILTERS, categories: ["sports"] };
    expect(serializeFilters(only).toString()).toBe("cat=sports");
    expect(parseFilters(serializeFilters(only))).toEqual(only);
    expect(matchesFilters(sportsEv, only, NOW)).toBe(true);
    expect(matchesFilters(ev(), only, NOW)).toBe(false);
  });

  it("accepts lenient spellings and canonicalizes them", () => {
    expect(parseFilters({ cat: "sports,flood" }).categories).toEqual(["flood", "sports"]);
    expect(parseFilters({ cat: "flood", sports: "true" }).categories).toEqual(["flood", "sports"]);
    expect(parseFilters({ sports: "0" }).categories).toEqual([...CORE_CATEGORIES]);
    expect(parseFilters({ src: "sports" }).sources).toEqual([...CORE_SOURCES]);
    expect(filtersKey(parseFilters({ cat: "sports,flood" }))).toBe("cat=flood&sports=1");
  });

  it("toggles categories within the core set and keeps the sports flag", () => {
    const core = [...CORE_CATEGORIES];
    expect(toggleCategory(core, "sports")).toEqual([...CATEGORIES]);
    expect(toggleCategory([...CATEGORIES], "sports")).toEqual(core);
    expect(toggleCategory(["flood", "sports"], "storm")).toEqual(["storm", "flood", "sports"]);
    expect(toggleCategory(["flood", "sports"], "flood")).toEqual(["sports"]); // sports-only view
    expect(toggleCategory(["sports"], "sports")).toEqual(core); // never empty
    expect(toggleCategory(["flood"], "flood")).toEqual(core); // reset to all core, not to sports
    expect(selectAllCategories(["flood"])).toEqual(core);
    expect(selectAllCategories(["flood", "sports"])).toEqual([...CATEGORIES]);
  });
});

describe("toggleValue", () => {
  it("adds and removes in canonical order", () => {
    expect(toggleValue(["storm"], "earthquake", CATEGORIES)).toEqual(["earthquake", "storm"]);
    expect(toggleValue(["earthquake", "storm"], "storm", CATEGORIES)).toEqual(["earthquake"]);
  });
  it("resets to all when the last value is removed", () => {
    expect(toggleValue(["storm"], "storm", CATEGORIES)).toEqual([...CATEGORIES]);
  });
});

describe("toEventRow", () => {
  it("strips raw and validates", () => {
    const row = toEventRow({ ...ev(), raw: { big: true } });
    expect(row).toEqual(ev());
    expect(row && "raw" in row).toBe(false);
  });
  it("rejects malformed records", () => {
    expect(toEventRow({ ...ev(), category: "aliens" })).toBeNull();
    expect(toEventRow({ ...ev(), severity: 9 })).toBeNull();
    expect(toEventRow(null)).toBeNull();
  });
});

describe("mergeIncoming", () => {
  const a = ev({ id: 1, occurred_at: "2026-10-04T11:00:00Z" });
  const b = ev({ id: 2, occurred_at: "2026-10-04T10:00:00Z" });

  it("prepends newer events", () => {
    const c = ev({ id: 3, occurred_at: "2026-10-04T11:59:00Z" });
    expect(mergeIncoming([a, b], c, 10).map((e) => e.id)).toEqual([3, 1, 2]);
  });
  it("inserts out-of-order events in time order", () => {
    const c = ev({ id: 3, occurred_at: "2026-10-04T10:30:00Z" });
    expect(mergeIncoming([a, b], c, 10).map((e) => e.id)).toEqual([1, 3, 2]);
  });
  it("dedupes by id", () => {
    const list = [a, b];
    expect(mergeIncoming(list, { ...a }, 10)).toBe(list);
    expect(mergeIncoming(list, { ...a, title: "updated" }, 10).map((e) => e.title)[0]).toBe("updated");
    expect(mergeIncoming(list, { ...a, title: "updated" }, 10)).toHaveLength(2);
  });
  it("caps the list", () => {
    const c = ev({ id: 3, occurred_at: "2026-10-04T11:59:00Z" });
    expect(mergeIncoming([a, b], c, 2).map((e) => e.id)).toEqual([3, 1]);
  });
});
