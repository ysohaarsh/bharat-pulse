import { describe, expect, it } from "vitest";
import { eventMatchesWatchlist, type MatchableEvent, type WatchlistCriteria } from "./match";

const event: MatchableEvent = {
  severity: 3,
  country: "JP",
  category: "earthquake",
  title: "M6.1 earthquake near Honshu",
  summary: "Tsunami advisory issued for the coast",
};

const any: WatchlistCriteria = { min_severity: 1, countries: [], categories: [], keywords: [] };

describe("eventMatchesWatchlist", () => {
  it("matches everything when all criteria are empty", () => {
    expect(eventMatchesWatchlist(event, any)).toBe(true);
  });

  it("enforces min severity inclusively", () => {
    expect(eventMatchesWatchlist(event, { ...any, min_severity: 3 })).toBe(true);
    expect(eventMatchesWatchlist(event, { ...any, min_severity: 4 })).toBe(false);
  });

  it("filters by country; null country never matches a non-empty list", () => {
    expect(eventMatchesWatchlist(event, { ...any, countries: ["US", "JP"] })).toBe(true);
    expect(eventMatchesWatchlist(event, { ...any, countries: ["US"] })).toBe(false);
    expect(eventMatchesWatchlist({ ...event, country: null }, { ...any, countries: ["JP"] })).toBe(false);
    expect(eventMatchesWatchlist({ ...event, country: null }, any)).toBe(true);
  });

  it("filters by category", () => {
    expect(eventMatchesWatchlist(event, { ...any, categories: ["earthquake"] })).toBe(true);
    expect(eventMatchesWatchlist(event, { ...any, categories: ["storm", "flood"] })).toBe(false);
  });

  it("matches keywords case-insensitively in title or summary", () => {
    expect(eventMatchesWatchlist(event, { ...any, keywords: ["HONSHU"] })).toBe(true);
    expect(eventMatchesWatchlist(event, { ...any, keywords: ["nope", "tsunami"] })).toBe(true);
    expect(eventMatchesWatchlist(event, { ...any, keywords: ["typhoon"] })).toBe(false);
    expect(eventMatchesWatchlist({ ...event, summary: null }, { ...any, keywords: ["tsunami"] })).toBe(false);
  });

  it("treats LIKE wildcards in keywords literally (mirrors the SQL escaping)", () => {
    expect(eventMatchesWatchlist(event, { ...any, keywords: ["M6%"] })).toBe(false);
    expect(eventMatchesWatchlist(event, { ...any, keywords: ["M6_1"] })).toBe(false);
    expect(eventMatchesWatchlist(event, { ...any, keywords: ["M6.1"] })).toBe(true);
  });

  it("requires every criterion to hold", () => {
    const w: WatchlistCriteria = { min_severity: 2, countries: ["JP"], categories: ["earthquake"], keywords: ["tsunami"] };
    expect(eventMatchesWatchlist(event, w)).toBe(true);
    expect(eventMatchesWatchlist({ ...event, category: "storm" }, w)).toBe(false);
  });
});
