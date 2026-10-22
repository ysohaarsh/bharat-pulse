import { describe, expect, it } from "vitest";
import { isStale, mToFt, msToKmh, parseFlightPositions, snapshotAgeMin } from "./positions";

const fields = ["icao24", "callsign", "lat", "lng", "alt_m", "heading", "velocity_ms", "country", "on_ground"];
const meta = {
  fields,
  aircraft: [
    ["800abc", "AIC101  ", 19.1, 72.9, 10668, 270, 230, "India", 0],
    ["abc123", "", 28.5, 77.1, null, null, null, "Qatar", 1],
    ["bad", "X", null, 77, 1, 1, 1, "India", 0],
    "junk",
  ],
};

describe("parseFlightPositions", () => {
  it("maps rows to features and skips malformed ones", () => {
    const s = parseFlightPositions(meta, "2026-10-22T10:00:00Z")!;
    expect(s.features).toHaveLength(2);
    expect(s.features[0].geometry.coordinates).toEqual([72.9, 19.1]);
    expect(s.features[0].properties).toMatchObject({ callsign: "AIC101", india: true, ground: false, alt: 10668 });
    expect(s.features[1].properties).toMatchObject({ india: false, ground: true, alt: null, heading: 0 });
  });
  it("returns null for a bad payload", () => {
    expect(parseFlightPositions(null, "x")).toBeNull();
    expect(parseFlightPositions({ fields: ["icao24"], aircraft: [] }, "x")).toBeNull();
  });
});

describe("helpers", () => {
  it("age, stale and unit conversions", () => {
    const now = Date.parse("2026-10-22T12:00:00Z");
    expect(snapshotAgeMin("2026-10-22T11:30:00Z", now)).toBe(30);
    expect(isStale(91)).toBe(true);
    expect(isStale(90)).toBe(false);
    expect(mToFt(10668)).toBe(35000);
    expect(msToKmh(250)).toBe(900);
  });
});
