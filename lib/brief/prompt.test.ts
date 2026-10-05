import { describe, expect, it } from "vitest";
import { buildBriefPrompt, formatEventLine } from "./prompt";
import { ev } from "./test-utils";

const events = [
  ev({
    title: "River Kosi at Kursela continues to flow in severe flood situation",
    category: "flood",
    severity: 4,
    state: "IN-BR",
    source: "sachet",
    occurred_at: "2026-10-03T08:00:00.000Z",
  }),
  ev({ title: "M4.6 earthquake — Assam", category: "earthquake", severity: 2, state: "IN-AS", source: "ncs" }),
  // A Hindi PIB release: the prompt must use the English machine translation.
  ev({ title: "प्रधानमंत्री ने एशियाई खेल में भारतीय दल की सराहना की", title_en: "PM lauds Indian contingent at Asian Games", category: "politics", severity: 2, state: null, source: "pib" }),
];
const messages = buildBriefPrompt({
  events,
  periodStart: "2026-10-02T12:00:00.000Z",
  periodEnd: "2026-10-03T12:00:00.000Z",
});
const [system, user] = messages;

describe("buildBriefPrompt", () => {
  it("returns a system and a user message", () => {
    expect(messages.map((m) => m.role)).toEqual(["system", "user"]);
  });

  it("instructs neutrality, no speculation and only the given events", () => {
    expect(system.content).toMatch(/neutral/i);
    expect(system.content).toMatch(/speculat/i);
    expect(system.content).toMatch(/ONLY the events provided/);
    expect(system.content).toMatch(/250-400 words/);
    expect(system.content).toMatch(/India Brief/);
  });

  it("specifies the markdown format and India sections", () => {
    expect(system.content).toContain("# Overview");
    expect(system.content).toContain("## Disasters & Weather");
    expect(system.content).toContain("## Governance & Politics");
    expect(system.content).toContain("## Economy & Development");
    expect(system.content).toContain("`- ` bullets");
    expect(system.content).toMatch(/Omit any section/);
    expect(system.content).toMatch(/state names/i);
  });

  it("includes the period and every event with its fields", () => {
    expect(user.content).toContain("2026-10-02T12:00:00.000Z to 2026-10-03T12:00:00.000Z");
    expect(user.content).toContain("3 most important events");
    expect(user.content).toContain("River Kosi at Kursela");
    expect(user.content).toContain("Bihar");
    expect(user.content).toContain("Assam");
    expect(user.content).toContain("[Flood & landslide]");
    expect(user.content).toContain("severity 4/5");
    expect(user.content).toContain("sachet");
    expect(user.content).toContain("2026-10-03T08:00:00.000Z");
  });

  it("uses English translations for non-English headlines", () => {
    expect(user.content).toContain("PM lauds Indian contingent at Asian Games");
    expect(user.content).not.toContain("प्रधानमंत्री");
  });
});

describe("formatEventLine", () => {
  it("numbers lines, uses 'unknown' for missing state and collapses whitespace", () => {
    const e = ev({ title: "A \n  b", state: null, category: "health", severity: 3, source: "news", occurred_at: "T" });
    expect(formatEventLine(e, 0)).toBe("1. [Health] severity 3/5 | unknown | T | news | A b");
  });
});
