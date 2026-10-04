import type { BriefEvent } from "./types";

let nextId = 1;
/** Build a BriefEvent for tests with sensible defaults. */
export function ev(overrides: Partial<BriefEvent> = {}): BriefEvent {
  const id = overrides.id ?? nextId++;
  return {
    id,
    title: `Event ${id}`,
    category: "other",
    severity: 2,
    country: null,
    occurred_at: "2026-10-03T12:00:00.000Z",
    source: "rss",
    ...overrides,
  };
}
