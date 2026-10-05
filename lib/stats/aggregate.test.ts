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
  topStates,
  windowRange,
  type StatsEvent,
} from "./aggregate";

const NOW = new Date("2026-10-04T12:34:56Z");

function ev(p: Partial<StatsEvent> = {}): StatsEvent {
  return {
    category: "earthquake",
    severity: 2,
    state: "IN-MH",
    source: "ncs",
    occurred_at: "2026-10-04T12:40:00Z", // 18:10 IST: the current hourly bucket
    ...p,
  };
}

describe("empty input", () => {
  it("produces zeroed but well-formed output", () => {
    const s = summarize([], "24h", NOW);
    expect(s.kpis).toEqual({ total: 0, highSeverity: 0, states: 0, topCategory: null });
    expect(s.categories).toEqual([]);
    expect(s.states).toEqual([]);
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

// NOW is 18:04:56 IST on 4 Oct; buckets follow IST (UTC+05:30) hours and days.
describe("windowRange", () => {
  it("aligns hourly buckets to IST hours (:30 UTC)", () => {
    const r = windowRange("24h", NOW);
    expect(r.start.toISOString()).toBe("2026-10-03T13:30:00.000Z");
    expect(r.end.toISOString()).toBe("2026-10-04T13:30:00.000Z");
  });
  it("aligns daily buckets to IST midnight", () => {
    const r = windowRange("7d", NOW);
    expect(r.start.toISOString()).toBe("2026-09-27T18:30:00.000Z");
    expect(r.end.toISOString()).toBe("2026-10-04T18:30:00.000Z");
  });
});

describe("timeBuckets", () => {
  it("buckets hourly in IST regardless of the input offset", () => {
    const events = [
      ev({ occurred_at: "2026-10-04T12:40:00Z" }), // 18:10 IST
      // 21:59 in +09:00 is 12:59 UTC = 18:29 IST → same bucket as above
      ev({ occurred_at: "2026-10-04T21:59:00+09:00", category: "flood" }),
      ev({ occurred_at: "2026-10-04T18:20:00+05:30" }),
      ev({ occurred_at: "2026-10-03T13:30:00Z" }), // first bucket boundary (inclusive)
      ev({ occurred_at: "2026-10-03T13:29:59Z" }), // before window → dropped
      ev({ occurred_at: "2026-10-04T13:30:00Z" }), // after window → dropped
      ev({ occurred_at: "not a date" }),
    ];
    const b = timeBuckets(events, "24h", NOW);
    expect(b[0].start).toBe("2026-10-03T13:30:00.000Z");
    expect(b[0].label).toBe("19:00");
    expect(b[0].total).toBe(1);
    const last = b[23];
    expect(last.label).toBe("18:00");
    expect(last.total).toBe(3);
    expect(last.earthquake).toBe(2);
    expect(last.flood).toBe(1);
    expect(b.reduce((n, x) => n + x.total, 0)).toBe(4);
  });

  it("buckets daily at IST midnight", () => {
    const events = [
      ev({ occurred_at: "2026-10-04T01:30:00Z" }), // 07:00 IST, 4 Oct
      ev({ occurred_at: "2026-10-03T19:00:00Z" }), // 00:30 IST, 4 Oct
      ev({ occurred_at: "2026-10-03T18:00:00Z" }), // 23:30 IST, 3 Oct
      ev({ occurred_at: "2026-09-27T18:30:00Z" }), // 00:00 IST, 28 Sep (first day)
    ];
    const b = timeBuckets(events, "7d", NOW);
    expect(b.map((x) => x.label)).toEqual(["Sep 28", "Sep 29", "Sep 30", "Oct 1", "Oct 2", "Oct 3", "Oct 4"]);
    expect(b.map((x) => x.total)).toEqual([1, 0, 0, 0, 0, 1, 2]);
  });

  it("maps unknown categories to other", () => {
    const b = timeBuckets([ev({ category: "aliens" as never })], "24h", NOW);
    expect(b[23].other).toBe(1);
  });
});

describe("counts", () => {
  const events = [
    ev({ category: "wildfire", severity: 5, state: "in-dl", source: "firms" }),
    ev({ category: "wildfire", severity: 4, state: "IN-DL", source: "firms" }),
    ev({ category: "security", severity: 3, state: "IN-KA", source: "sachet" }),
    ev({ category: "earthquake", severity: 1, state: null, source: "ncs" }),
    ev({ category: "earthquake", severity: 2, state: "IN-MH", source: "ncs" }),
    ev({ category: "earthquake", severity: 2, state: "IN-MH", source: "ncs" }),
  ];

  it("counts per category and sorts shares", () => {
    expect(countByCategory(events)).toMatchObject({ earthquake: 3, wildfire: 2, security: 1, flood: 0 });
    const shares = categoryShares(events);
    expect(shares.map((s) => s.category)).toEqual(["earthquake", "wildfire", "security"]);
    expect(shares[0].color).toMatch(/^#/);
  });

  it("ranks states (case-insensitive, skipping null) and limits", () => {
    expect(topStates(events)).toEqual([
      { state: "IN-DL", count: 2 },
      { state: "IN-MH", count: 2 },
      { state: "IN-KA", count: 1 },
    ]);
    expect(topStates(events, 1)).toHaveLength(1);
    const many = Array.from({ length: 15 }, (_, i) => ev({ state: `C${i}` }));
    expect(topStates(many)).toHaveLength(10);
  });

  it("counts sources zero-filled", () => {
    expect(countBySource(events)).toEqual([
      { source: "ncs", count: 3 },
      { source: "firms", count: 2 },
      { source: "sachet", count: 1 },
      ...CORE_SOURCES.filter((x) => !["ncs", "firms", "sachet"].includes(x)).map((source) => ({ source, count: 0 })),
    ]);
  });

  it("builds severity distribution and KPIs", () => {
    expect(severityDistribution(events).map((s) => s.count)).toEqual([1, 2, 1, 1, 1]);
    expect(kpis(events)).toEqual({ total: 6, highSeverity: 2, states: 3, topCategory: "earthquake" });
  });
});

describe("sports exclusion", () => {
  it("leaves sports out of every figure", () => {
    const core = [ev({ category: "flood", state: "IN-UP", severity: 4 }), ev({ source: "news", category: "security" })];
    const sports = [
      ...Array.from({ length: 5 }, () => ev({ category: "sports", source: "sports", severity: 1, state: "IN-TN" })),
      ev({ category: "sports", source: "news" }),
      ev({ category: "other", source: "sports" }),
    ];
    const s = summarize([...core, ...sports], "24h", NOW);
    expect(s).toEqual(summarize(core, "24h", NOW));
    expect(s.kpis.total).toBe(2);
    expect(s.categories.map((c) => c.category)).not.toContain("sports");
    expect(s.sources.map((x) => x.source)).not.toContain("sports");
    expect(s.states.map((c) => c.state)).not.toContain("IN-TN");
    expect(s.timeline.every((b) => b.sports === 0)).toBe(true);
  });
});
