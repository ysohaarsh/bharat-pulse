import { describe, expect, it } from "vitest";
import { isNearDuplicate, normalizeTitle, selectEvents } from "./select";
import { ev } from "./test-utils";

describe("normalizeTitle", () => {
  it("lowercases, strips punctuation and diacritics, collapses whitespace", () => {
    expect(normalizeTitle("  Ceasefire  Talks: São Paulo — UPDATED! ")).toBe("ceasefire talks sao paulo updated");
  });
});

describe("isNearDuplicate", () => {
  it("matches titles that differ only in punctuation/case", () => {
    expect(isNearDuplicate("Floods hit Pakistan!", "floods hit pakistan")).toBe(true);
  });
  it("matches long titles with one extra word", () => {
    expect(
      isNearDuplicate(
        "Major earthquake strikes central Turkey killing dozens",
        "Major earthquake strikes central Turkey, killing dozens overnight",
      ),
    ).toBe(true);
  });
  it("does not match different stories", () => {
    expect(isNearDuplicate("M 5.2 - 19 km ESE of Feke, Turkey", "M 4.8 - 40 km N of Hualien, Taiwan")).toBe(false);
    expect(isNearDuplicate("Fire in Spain", "Fire in Chile")).toBe(false);
  });
});

describe("selectEvents", () => {
  it("orders by severity desc then recency", () => {
    const a = ev({ severity: 3, occurred_at: "2026-10-03T10:00:00Z", category: "flood" });
    const b = ev({ severity: 5, occurred_at: "2026-10-03T01:00:00Z", category: "conflict" });
    const c = ev({ severity: 3, occurred_at: "2026-10-03T11:00:00Z", category: "storm" });
    expect(selectEvents([a, b, c]).map((e) => e.id)).toEqual([b.id, c.id, a.id]);
  });

  it("never picks sports items", () => {
    const quake = ev({ severity: 2, category: "earthquake", source: "usgs" });
    const events = [
      ev({ title: "Cup final shock", category: "sports", source: "sports", severity: 1 }),
      ev({ title: "Mislabelled sports item", category: "sports", source: "rss", severity: 5 }),
      ev({ title: "Sports feed item", category: "other", source: "sports", severity: 5 }),
      quake,
    ];
    expect(selectEvents(events).map((e) => e.id)).toEqual([quake.id]);
  });

  it("caps the total", () => {
    const cats = ["flood", "storm", "conflict", "politics", "economy"] as const;
    const sources = ["rss", "gdelt", "usgs", "eonet"] as const;
    const events = Array.from({ length: 100 }, (_, i) =>
      ev({ title: `Unique story number ${i}`, category: cats[i % 5], source: sources[i % 4] }),
    );
    expect(selectEvents(events)).toHaveLength(40);
    expect(selectEvents(events, { max: 7 })).toHaveLength(7);
  });

  it("caps per category so one category can't dominate", () => {
    const events = [
      ...Array.from({ length: 30 }, (_, i) =>
        ev({ title: `Quake ${i} somewhere`, category: "earthquake", severity: 5, source: "usgs" }),
      ),
      ev({ title: "Minor protest", category: "politics", severity: 1 }),
    ];
    const picked = selectEvents(events, { perCategory: 10 });
    expect(picked.filter((e) => e.category === "earthquake")).toHaveLength(10);
    expect(picked.some((e) => e.category === "politics")).toBe(true);
  });

  it("caps per source", () => {
    const cats = ["conflict", "politics", "economy", "health"] as const;
    const events = Array.from({ length: 30 }, (_, i) =>
      ev({ title: `Gdelt item ${i}`, category: cats[i % 4], source: "gdelt" }),
    );
    expect(selectEvents(events, { perSource: 5 })).toHaveLength(5);
  });

  it("dedupes near-identical titles, keeping the most important", () => {
    const strong = ev({ title: "Explosion reported in Kabul", severity: 4 });
    const weak = ev({ title: "Explosion reported in Kabul.", severity: 2 });
    expect(selectEvents([weak, strong]).map((e) => e.id)).toEqual([strong.id]);
  });

  it("does not mutate input and handles empty input", () => {
    const input = [ev({ severity: 1 }), ev({ severity: 5 })];
    const copy = [...input];
    selectEvents(input);
    expect(input).toEqual(copy);
    expect(selectEvents([])).toEqual([]);
  });
});
