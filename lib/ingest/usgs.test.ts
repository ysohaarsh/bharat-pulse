import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/usgs.json";
import { severityFromMagnitude, usgsIngester } from "./usgs";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe("usgsIngester.normalize", () => {
  const events = usgsIngester.normalize(fixture);

  it("normalizes every valid feature in the fixture", () => {
    expect(events).toHaveLength(fixture.features.length);
    expect(events).toHaveLength(7);
  });

  it("maps fields from a GeoJSON feature", () => {
    const e = events.find((x) => x.external_id === "us6000tzip");
    expect(e).toMatchObject({
      source: "usgs",
      external_id: "us6000tzip",
      title: "M 5.2 - 19 km ESE of Feke, Turkey",
      summary: "M5.2 · depth 10 km",
      category: "earthquake",
      severity: 3,
      lat: 37.7409,
      lng: 36.1075,
      country: null,
      url: "https://earthquake.usgs.gov/earthquakes/eventpage/us6000tzip",
      occurred_at: new Date(1791114203185).toISOString(),
    });
    expect(e?.raw).toEqual(fixture.features.find((f) => f.id === "us6000tzip"));
  });

  it("flags tsunami in the summary", () => {
    const e = events.find((x) => x.external_id === "us6000tzer");
    expect(e?.summary).toBe("M5.9 · depth 46 km · tsunami alert");
  });

  it("handles a null magnitude", () => {
    const e = events.find((x) => x.external_id === "us6000tzid");
    expect(e?.severity).toBe(1);
    expect(e?.summary).toBe("M? · depth 10 km");
  });

  it("buckets severity from magnitude", () => {
    const bySev = Object.fromEntries(events.map((e) => [e.external_id, e.severity]));
    expect(bySev).toMatchObject({
      aka2026tpogqq: 1, // 2.5
      pr2026277001: 1, // 3.99
      us6000tzif: 2, // 4.7
      us6000tzip: 3, // 5.2
      us6000tzer: 3, // 5.9
    });
    expect([3.9, 4, 4.9, 5, 5.9, 6, 6.9, 7, 9.1].map(severityFromMagnitude)).toEqual([1, 2, 2, 3, 3, 4, 4, 5, 5]);
  });

  it("keeps coordinates within valid ranges and ISO timestamps", () => {
    for (const e of events) {
      expect(e.lat).not.toBeNull();
      expect(Math.abs(e.lat!)).toBeLessThanOrEqual(90);
      expect(Math.abs(e.lng!)).toBeLessThanOrEqual(180);
      expect(new Date(e.occurred_at).toISOString()).toBe(e.occurred_at);
    }
  });

  it("skips invalid features instead of throwing", () => {
    const raw = clone(fixture) as { features: unknown[] };
    const noGeometry = { ...clone(fixture.features[0]), id: "bad-1", geometry: null };
    const badLat = clone(fixture.features[1]);
    badLat.id = "bad-2";
    badLat.geometry.coordinates = [10, 123, 5];
    raw.features.push(noGeometry, badLat, "garbage", null);
    const out = usgsIngester.normalize(raw);
    expect(out).toHaveLength(7);
    expect(out.map((e) => e.external_id)).not.toContain("bad-1");
    expect(out.map((e) => e.external_id)).not.toContain("bad-2");
  });

  it("returns [] for a malformed payload", () => {
    expect(usgsIngester.normalize(null)).toEqual([]);
    expect(usgsIngester.normalize({ foo: 1 })).toEqual([]);
  });
});
