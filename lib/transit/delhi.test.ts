import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { transit_realtime } from "gtfs-realtime-bindings";
import { decodeVehiclePositions } from "./delhi";
import { busSnapshotSchema } from "./types";

const fixture = readFileSync(new URL("./__fixtures__/delhi-vehicle-positions.pb", import.meta.url));

describe("decodeVehiclePositions", () => {
  const snap = decodeVehiclePositions(fixture);

  it("decodes a realistic feed, skipping unusable entities", () => {
    // 18 buses + label-only bus; (0,0), no-position, trip-update dropped; duplicate merged.
    expect(snap.count).toBe(19);
    expect(snap.vehicles).toHaveLength(19);
    expect(snap.ts).toBe(1790000000);
    expect(busSnapshotSchema.safeParse(snap).success).toBe(true);
  });

  it("converts m/s to km/h and keeps route, position, bearing, fix time", () => {
    const bus = snap.vehicles.find((r) => r[0] === "DL1PC4521")!;
    expect(bus).toEqual(["DL1PC4521", "10121", 28.6139, 77.209, 22, 90, 1790000000 - 12]);
  });

  it("keeps the newest fix for a duplicated vehicle id", () => {
    expect(snap.vehicles.filter((r) => r[0] === "DL1PC4521")).toHaveLength(1);
  });

  it("falls back to label, empty route, no speed, unknown bearing", () => {
    expect(snap.vehicles.find((r) => r[0] === "LBL-77")).toEqual(["LBL-77", "", 28.61, 77.3, 0, -1, 1790000000 - 60]);
  });

  it("drops (0,0) fixes and entities without a position", () => {
    const ids = snap.vehicles.map((r) => r[0]);
    expect(ids).not.toContain("DL1PZ0001");
    expect(ids).not.toContain("DL1PZ0002");
  });

  it("handles an empty feed and rejects garbage", () => {
    const empty = transit_realtime.FeedMessage.encode({ header: { gtfsRealtimeVersion: "2.0" }, entity: [] }).finish();
    expect(decodeVehiclePositions(empty)).toEqual({ ts: 0, count: 0, vehicles: [] });
    expect(() => decodeVehiclePositions(new TextEncoder().encode("<html>nope</html>"))).toThrow();
  });
});
