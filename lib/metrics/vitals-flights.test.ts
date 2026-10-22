import { describe, expect, it } from "vitest";
import { buildVitals } from "./vitals";

const NOW = Date.parse("2026-10-22T06:00:00Z");
const at = (mins: number) => new Date(NOW - mins * 60_000).toISOString();
const f = (key: string, value: number) => ({ key, region: "IN", label: "", value, state: null, observed_at: at(10) });

describe("buildVitals flights", () => {
  it("reads the national flight counts, null when any is missing", () => {
    const rows = [f("flights.total", 300), f("flights.airborne", 260), f("flights.ground", 40)];
    expect(buildVitals(rows, [], NOW).flights).toEqual({ total: 300, airborne: 260, ground: 40, observedAt: at(10) });
    expect(buildVitals(rows.slice(0, 2), [], NOW).flights).toBeNull();
  });
});
