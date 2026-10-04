import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/eonet.json";
import { eonetIngester, eonetSeverity, mapCategory } from "./eonet";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe("eonetIngester.normalize", () => {
  const events = eonetIngester.normalize(fixture);
  const byId = (id: string) => events.find((e) => e.external_id === id);

  it("normalizes every valid event in the fixture", () => {
    expect(events).toHaveLength(fixture.events.length);
    expect(events).toHaveLength(7);
  });

  it("maps fields using the most recent geometry", () => {
    const e = byId("EONET_24962");
    expect(e).toMatchObject({
      source: "eonet",
      title: "Typhoon Choi-wan",
      category: "storm",
      severity: 5, // 125 kts
      url: "https://eonet.gsfc.nasa.gov/api/v3/events/EONET_24962",
      occurred_at: "2026-10-04T06:00:00.000Z",
      summary: "125 kts",
      country: null,
    });
    const last = fixture.events[0].geometry[2];
    expect([e?.lng, e?.lat]).toEqual(last.coordinates);
    expect(e?.raw).toEqual(fixture.events[0]);
  });

  it("uses the centroid of the first ring for Polygon geometry", () => {
    const e = byId("EONET_24965");
    expect(e?.category).toBe("wildfire");
    expect(e?.lng).toBeCloseTo(-80.5952778, 6);
    expect(e?.lat).toBeCloseTo(26.1341667, 6);
  });

  it("maps categories and severity", () => {
    expect(byId("EONET_24875")?.severity).toBe(4); // hurricane 80 kts
    expect(byId("EONET_24909")?.severity).toBe(3); // storm 30 kts
    expect(byId("EONET_24963")?.severity).toBe(2); // wildfire 5000 acres
    expect(byId("EONET_5359")).toMatchObject({ category: "other", severity: 2 }); // iceberg
    expect(byId("EONET_24964")?.summary).toBe("2 Miles S from LA CASITA, TX · 510 acres");

    expect(["wildfires", "severeStorms", "volcanoes", "floods", "seaLakeIce", "dustHaze"].map(mapCategory)).toEqual([
      "wildfire",
      "storm",
      "volcano",
      "flood",
      "other",
      "other",
    ]);
    expect(eonetSeverity("volcano")).toBe(3);
    expect(eonetSeverity("wildfire", 10_000, "acres")).toBe(3);
    expect(eonetSeverity("wildfire", 250_000, "acres")).toBe(4);
    expect(eonetSeverity("storm", 64, "kts")).toBe(4);
    expect(eonetSeverity("storm", 96, "kts")).toBe(5);
    expect(eonetSeverity("other", 9999, "NM^2")).toBe(2);
  });

  it("keeps coordinates within valid ranges", () => {
    for (const e of events) {
      expect(Math.abs(e.lat!)).toBeLessThanOrEqual(90);
      expect(Math.abs(e.lng!)).toBeLessThanOrEqual(180);
    }
  });

  it("falls back to the first source url when link is missing", () => {
    const raw = clone(fixture);
    raw.events = [{ ...raw.events[3], link: null as unknown as string }];
    expect(eonetIngester.normalize(raw)[0].url).toBe("https://irwin.doi.gov/observer/incidents/2026-TXRGR-000402");
  });

  it("skips invalid events instead of throwing", () => {
    const raw = clone(fixture) as { events: unknown[] };
    raw.events.push(
      { ...clone(fixture.events[3]), id: "bad-no-geometry", geometry: [] },
      { ...clone(fixture.events[3]), id: "bad-categories", categories: "nope" },
      { id: "bad-shape" },
      null,
    );
    const out = eonetIngester.normalize(raw);
    expect(out).toHaveLength(7);
    expect(out.map((e) => e.external_id).some((id) => id.startsWith("bad"))).toBe(false);
  });

  it("returns [] for a malformed payload", () => {
    expect(eonetIngester.normalize(undefined)).toEqual([]);
    expect(eonetIngester.normalize({ events: "x" })).toEqual([]);
  });
});
