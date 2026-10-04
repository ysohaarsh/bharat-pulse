import { describe, expect, it } from "vitest";
import { defaultPeriod, periodEndingAt } from "./period";

describe("defaultPeriod", () => {
  it("ends at the most recent full UTC hour and spans 24h", () => {
    const { start, end } = defaultPeriod(new Date("2026-10-04T13:47:12.345Z"));
    expect(end.toISOString()).toBe("2026-10-04T13:00:00.000Z");
    expect(start.toISOString()).toBe("2026-10-03T13:00:00.000Z");
  });
  it("keeps an exact hour as the end", () => {
    expect(defaultPeriod(new Date("2026-10-04T00:00:00Z")).end.toISOString()).toBe("2026-10-04T00:00:00.000Z");
  });
});

describe("periodEndingAt", () => {
  it("spans the 24h before the given end", () => {
    expect(periodEndingAt(new Date("2026-10-04T05:30:00Z")).start.toISOString()).toBe("2026-10-03T05:30:00.000Z");
  });
});
