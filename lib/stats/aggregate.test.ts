import { describe, expect, it } from "vitest";
import { CORE_SOURCES } from "@/lib/events/sports";
import {
  categoryShares,
  countByCategory,
  countBySource,
  kpis,
  parseWindow,
  severityDistribution,
  summarize,
  timeBuckets,
  topCountries,
  windowRange,
  type StatsEvent,
} from "./aggregate";

const NOW = new Date("2026-10-04T12:34:56Z");

function ev(p: Partial<StatsEvent> = {}): StatsEvent {
  return {
    category: "earthquake",
    severity: 2,
    country: "JP",
    source: "usgs",
    occurred_at: "2026-10-04T12:00:00Z",
    ...p,
  };
}

describe("empty input", () => {
  it("produces zeroed but well-formed output", () => {
    const s = summarize([], "24h", NOW);
    expect(s.kpis).toEqual({ total: 0, highSeverity: 0, countries: 0, topCategory: null });
    expect(s.categories).toEqual([]);
    expect(s.countries).toEqual([]);
    expect(s.timeline).toHaveLength(24);
    expect(s.timeline.every((b) => b.total === 0)).toBe(true);
    expect(s.sources.map((x) => x.count)).toEqual(CORE_SOURCES.map(() => 0));
    expect(s.severity).toEqual([1, 2, 3, 4, 5].map((severity) => ({ severity, count: 0 })));
    expect(Object.values(countByCategory([])).every((n) => n === 0)).toBe(true);
    expect(summarize([], "7d", NOW).timeline).toHaveLength(7);
  });
});

describe("parseWindow", () => {
  it("accepts known values and defaults to 24h", () => {
    expect(parseWindow("7d")).toBe("7d");
    expect(parseWindow(["7d", "24h"])).toBe("7d");
    expect(parseWindow("30d")).toBe("24h");
    expect(parseWindow(undefined)).toBe("24h");
  });
});

describe("windowRange", () => {
  it("aligns hourly buckets to UTC hours", () => {
    const r = windowRange("24h", NOW);
    expect(r.start.toISOString()).toBe("2026-10-03T13:00:00.000Z");
    expect(r.end.toISOString()).toBe("2026-10-04T13:00:00.000Z");
  });
  it("aligns daily buckets to UTC midnight", () => {
    const r = windowRange("7d", NOW);
    expect(r.start.toISOString()).toBe("2026-09-28T00:00:00.000Z");
    expect(r.end.toISOString()).toBe("2026-10-05T00:00:00.000Z");
  });
});

describe("timeBuckets", () => {
  it("buckets hourly in UTC regardless of the input offset", () => {
    const events = [
      ev({ occurred_at: "2026-10-04T12:10:00Z" }),
      // 21:59 in +09:00 is 12:59 UTC → same bucket as above
      ev({ occurred_at: "2026-10-04T21:59:00+09:00", category: "flood" }),
      // 08:30 in -04:00 is 12:30 UTC
      ev({ occurred_at: "2026-10-04T08:30:00-04:00" }),
      ev({ occurred_at: "2026-10-03T13:00:00Z" }), // first bucket boundary (inclusive)
      ev({ occurred_at: "2026-10-03T12:59:59Z" }), // before window → dropped
      ev({ occurred_at: "2026-10-04T13:00:00Z" }), // after window → dropped
      ev({ occurred_at: "not a date" }),
    ];
    const b = timeBuckets(events, "24h", NOW);
    expect(b[0].start).toBe("2026-10-03T13:00:00.000Z");
    expect(b[0].label).toBe("13:00");
    expect(b[0].total).toBe(1);
    const last = b[23];
    expect(last.label).toBe("12:00");
    expect(last.total).toBe(3);
    expect(last.earthquake).toBe(2);
    expect(last.flood).toBe(1);
    expect(b.reduce((n, x) => n + x.total, 0)).toBe(4);
  });

  it("buckets daily at UTC midnight", () => {
    const events = [
      ev({ occurred_at: "2026-10-03T23:30:00-02:00" }), // 2026-10-04T01:30Z → today
      ev({ occurred_at: "2026-10-04T00:30:00+05:00" }), // 2026-10-03T19:30Z → yesterday
      ev({ occurred_at: "2026-09-28T00:00:00Z" }), // first day
    ];
    const b = timeBuckets(events, "7d", NOW);
    expect(b.map((x) => x.label)).toEqual(["Sep 28", "Sep 29", "Sep 30", "Oct 1", "Oct 2", "Oct 3", "Oct 4"]);
    expect(b.map((x) => x.total)).toEqual([1, 0, 0, 0, 0, 1, 1]);
  });

  it("maps unknown categories to other", () => {
    const b = timeBuckets([ev({ category: "aliens" as never })], "24h", NOW);
    expect(b[23].other).toBe(1);
  });
});

describe("counts", () => {
  const events = [
    ev({ category: "wildfire", severity: 5, country: "us", source: "eonet" }),
    ev({ category: "wildfire", severity: 4, country: "US", source: "eonet" }),
    ev({ category: "conflict", severity: 3, country: "UA", source: "gdelt" }),
    ev({ category: "earthquake", severity: 1, country: null, source: "usgs" }),
    ev({ category: "earthquake", severity: 2, country: "JP", source: "usgs" }),
    ev({ category: "earthquake", severity: 2, country: "JP", source: "usgs" }),
  ];

  it("counts per category and sorts shares", () => {
    expect(countByCategory(events)).toMatchObject({ earthquake: 3, wildfire: 2, conflict: 1, flood: 0 });
    const shares = categoryShares(events);
    expect(shares.map((s) => s.category)).toEqual(["earthquake", "wildfire", "conflict"]);
    expect(shares[0].color).toMatch(/^#/);
  });

  it("ranks countries (case-insensitive, skipping null) and limits", () => {
    expect(topCountries(events)).toEqual([
      { country: "JP", count: 2 },
      { country: "US", count: 2 },
      { country: "UA", count: 1 },
    ]);
    expect(topCountries(events, 1)).toHaveLength(1);
    const many = Array.from({ length: 15 }, (_, i) => ev({ country: `C${i}` }));
    expect(topCountries(many)).toHaveLength(10);
  });

  it("counts sources zero-filled", () => {
    expect(countBySource(events)).toEqual([
      { source: "usgs", count: 3 },
      { source: "eonet", count: 2 },
      { source: "gdelt", count: 1 },
      { source: "rss", count: 0 },
      ...CORE_SOURCES.slice(4).map((source) => ({ source, count: 0 })),
    ]);
  });

  it("builds severity distribution and KPIs", () => {
    expect(severityDistribution(events).map((s) => s.count)).toEqual([1, 2, 1, 1, 1]);
    expect(kpis(events)).toEqual({ total: 6, highSeverity: 2, countries: 3, topCategory: "earthquake" });
  });
});

describe("sports exclusion", () => {
  it("leaves sports out of every figure", () => {
    const core = [ev({ category: "flood", country: "PK", severity: 4 }), ev({ source: "rss", category: "conflict" })];
    const sports = [
      ...Array.from({ length: 5 }, () => ev({ category: "sports", source: "sports", severity: 1, country: "GB" })),
      ev({ category: "sports", source: "rss" }),
      ev({ category: "other", source: "sports" }),
    ];
    const s = summarize([...core, ...sports], "24h", NOW);
    expect(s).toEqual(summarize(core, "24h", NOW));
    expect(s.kpis.total).toBe(2);
    expect(s.categories.map((c) => c.category)).not.toContain("sports");
    expect(s.sources.map((x) => x.source)).not.toContain("sports");
    expect(s.countries.map((c) => c.country)).not.toContain("GB");
    expect(s.timeline.every((b) => b.sports === 0)).toBe(true);
  });
});
