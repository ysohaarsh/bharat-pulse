import { describe, expect, it } from "vitest";
import { buildBriefPrompt, formatEventLine } from "./prompt";
import { ev } from "./test-utils";

const events = [
  ev({
    title: "Shelling reported near Kharkiv",
    category: "conflict",
    severity: 5,
    country: "UA",
    source: "gdelt",
    occurred_at: "2026-10-03T08:00:00.000Z",
  }),
  ev({ title: "M 6.1 - 30 km S of Hualien", category: "earthquake", severity: 4, country: "TW", source: "usgs" }),
  ev({ title: "Central bank raises rates", category: "economy", severity: 2, country: null, source: "rss" }),
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
  });

  it("specifies the markdown format and sections", () => {
    expect(system.content).toContain("# Overview");
    expect(system.content).toContain("## Conflict & Security");
    expect(system.content).toContain("## Natural Hazards");
    expect(system.content).toContain("## Politics & Economy");
    expect(system.content).toContain("`- ` bullets");
    expect(system.content).toMatch(/Omit any section/);
    expect(system.content).toMatch(/country names/i);
  });

  it("includes the period and every event with its fields", () => {
    expect(user.content).toContain("2026-10-02T12:00:00.000Z to 2026-10-03T12:00:00.000Z");
    expect(user.content).toContain("3 most important events");
    expect(user.content).toContain("Shelling reported near Kharkiv");
    expect(user.content).toContain("Central bank raises rates");
    expect(user.content).toContain("Ukraine");
    expect(user.content).toContain("Taiwan");
    expect(user.content).toContain("[Conflict]");
    expect(user.content).toContain("severity 5/5");
    expect(user.content).toContain("gdelt");
    expect(user.content).toContain("2026-10-03T08:00:00.000Z");
  });
});

describe("formatEventLine", () => {
  it("numbers lines, uses 'unknown' for missing country and collapses whitespace", () => {
    const e = ev({ title: "A \n  b", country: null, category: "health", severity: 3, source: "rss", occurred_at: "T" });
    expect(formatEventLine(e, 0)).toBe("1. [Health] severity 3/5 | unknown | T | rss | A b");
  });
});
