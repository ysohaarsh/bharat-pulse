import { describe, expect, it } from "vitest";
import { eventMatchesWatchlist, type MatchableEvent, type WatchlistCriteria } from "./match";

const event: MatchableEvent = {
  severity: 3,
  state: "IN-MH",
  category: "earthquake",
  title: "M6.1 earthquake near Honshu",
  summary: "Tsunami advisory issued for the coast",
};

const any: WatchlistCriteria = { min_severity: 1, states: [], categories: [], keywords: [] };

describe("eventMatchesWatchlist", () => {
  it("matches everything when all criteria are empty", () => {
    expect(eventMatchesWatchlist(event, any)).toBe(true);
  });

  it("enforces min severity inclusively", () => {
    expect(eventMatchesWatchlist(event, { ...any, min_severity: 3 })).toBe(true);
    expect(eventMatchesWatchlist(event, { ...any, min_severity: 4 })).toBe(false);
  });

  it("filters by state; null state never matches a non-empty list", () => {
    expect(eventMatchesWatchlist(event, { ...any, states: ["IN-DL", "IN-MH"] })).toBe(true);
    expect(eventMatchesWatchlist(event, { ...any, states: ["IN-DL"] })).toBe(false);
    expect(eventMatchesWatchlist({ ...event, state: null }, { ...any, states: ["IN-MH"] })).toBe(false);
    expect(eventMatchesWatchlist({ ...event, state: null }, any)).toBe(true);
  });

  it("filters by category", () => {
    expect(eventMatchesWatchlist(event, { ...any, categories: ["earthquake"] })).toBe(true);
    expect(eventMatchesWatchlist(event, { ...any, categories: ["cyclone", "flood"] })).toBe(false);
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
    const w: WatchlistCriteria = { min_severity: 2, states: ["IN-MH"], categories: ["earthquake"], keywords: ["tsunami"] };
    expect(eventMatchesWatchlist(event, w)).toBe(true);
    expect(eventMatchesWatchlist({ ...event, category: "cyclone" }, w)).toBe(false);
  });
});
