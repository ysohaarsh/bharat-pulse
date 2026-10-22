import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { flightMetrics, parseStates, POSITION_FIELDS } from "./flights";

const raw: unknown = JSON.parse(readFileSync(join(process.cwd(), "lib", "jobs", "__fixtures__", "flights.states.json"), "utf8"));

describe("flights", () => {
  it("parses the saved OpenSky response", () => {
    const p = parseStates(raw)!;
    expect(p.aircraft).toHaveLength(30);
    expect(p.aircraft.filter((a) => a.onGround)).toHaveLength(6);
  });

  it("skips bad rows and out-of-box points", () => {
    const good = (raw as { states: unknown[] }).states[0];
    const p = parseStates({
      time: 1,
      states: [good, "x", [1, 2], ["abc", null, null, null, null, 200, 20, null, false, null, null], ["abc", null, null, null, null, 77, 28, null, "no", null, null]],
    })!;
    expect(p.aircraft).toHaveLength(1);
    expect(parseStates({ nope: 1 })).toBeNull();
    expect(parseStates({ time: 1, states: null })!.aircraft).toEqual([]);
  });

  it("builds counts and a compact snapshot", () => {
    const { counts, positions } = flightMetrics(raw, "2026-01-01T00:00:00Z");
    const by = Object.fromEntries(counts.map((c) => [c.key, c.value]));
    expect(by["flights.total"]).toBe(30);
    expect(by["flights.airborne"]).toBe(24);
    expect(by["flights.ground"]).toBe(6);
    expect(counts[0].observed_at).toBe(new Date((raw as { time: number }).time * 1000).toISOString());
    const aircraft = positions!.meta!.aircraft as unknown[][];
    expect(aircraft).toHaveLength(30);
    expect(aircraft[0]).toHaveLength(POSITION_FIELDS.length);
    expect(flightMetrics({}, "x")).toEqual({ counts: [], positions: null });
  });
});
