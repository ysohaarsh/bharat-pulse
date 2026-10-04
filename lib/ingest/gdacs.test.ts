import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GDACS_URL, gdacsCategory, gdacsCountry, gdacsIngester, gdacsSeverity, normalizeGdacs } from "./gdacs";

interface Feature {
  type: "Feature";
  geometry: { type: string; coordinates: unknown };
  properties: Record<string, unknown>;
}

const fixture = (): { type: string; features: Feature[] } =>
  JSON.parse(readFileSync(join(__dirname, "__fixtures__", "gdacs.json"), "utf8"));

const NOW = Date.parse("2026-10-04T16:00:00Z");

/** A fixture feature with overrides, for synthetic Orange/Red/polygon/invalid cases. */
function variant(index: number, props: Record<string, unknown>, geometry?: Feature["geometry"]): Feature {
  const f = structuredClone(fixture().features[index]);
  Object.assign(f.properties, props);
  if (geometry) f.geometry = geometry;
  return f;
}

describe("gdacsCategory", () => {
  it("maps GDACS event types", () => {
    expect(["EQ", "TC", "FL", "VO", "WF", "DR", "XX"].map(gdacsCategory)).toEqual([
      "earthquake",
      "storm",
      "flood",
      "volcano",
      "wildfire",
      "other",
      "other",
    ]);
  });
});

describe("gdacsSeverity", () => {
  it("maps alert levels: Green 2, Orange 4, Red 5", () => {
    expect(gdacsSeverity("Green", "EQ")).toBe(2);
    expect(gdacsSeverity("Orange", "FL")).toBe(4);
    expect(gdacsSeverity("Red", "TC")).toBe(5);
    expect(gdacsSeverity("purple", "TC")).toBe(2);
  });
  it("downgrades Orange to 3 when the hazard itself is small", () => {
    expect(gdacsSeverity("Orange", "EQ", { severity: 5.4, severityunit: "M" })).toBe(3);
    expect(gdacsSeverity("Orange", "EQ", { severity: 6.8, severityunit: "M" })).toBe(4);
    expect(gdacsSeverity("Orange", "TC", { severity: 95, severityunit: "km/h" })).toBe(3);
    expect(gdacsSeverity("Orange", "TC", { severity: 194, severityunit: "km/h" })).toBe(4);
    expect(gdacsSeverity("Orange", "WF", { severity: 5055, severityunit: "ha" })).toBe(3);
    expect(gdacsSeverity("Orange", "FL", { severity: 0, severityunit: "" })).toBe(4);
    expect(gdacsSeverity("Red", "EQ", { severity: 5.0, severityunit: "M" })).toBe(5);
  });
});

describe("gdacsCountry", () => {
  it("prefers the affected country matching iso3, falls back to the ISO-3 map", () => {
    expect(gdacsCountry("IDN", [{ iso2: "PG", iso3: "PNG" }, { iso2: "ID", iso3: "IDN" }])).toBe("ID");
    expect(gdacsCountry("PNG", [{ iso2: "PG", iso3: "PNG" }, { iso2: "ID", iso3: "IDN" }])).toBe("PG");
    expect(gdacsCountry("COD", [])).toBe("CD");
    expect(gdacsCountry("", [])).toBeNull();
    expect(gdacsCountry("ZZZ", null)).toBeNull();
  });
});

describe("normalizeGdacs", () => {
  const events = normalizeGdacs(fixture(), NOW);
  const byId = (id: string) => events.find((e) => e.external_id === id)!;

  it("keeps started, non-green-wildfire features", () => {
    // Green wildfires are dropped; the flood forecast starts after NOW so it waits.
    expect(events.map((e) => e.external_id)).toEqual(["TC-1001329", "EQ-1569463"]);
    for (const e of events) {
      expect(e.source).toBe("gdacs");
      expect(e.severity).toBe(2); // all Green
      expect(e.url).toMatch(/^https:\/\/www\.gdacs\.org\/report\.aspx\?/);
    }
  });

  it("maps a tropical cyclone", () => {
    expect(byId("TC-1001329")).toMatchObject({
      title: "Tropical Cyclone RACHEL-26",
      category: "storm",
      lat: 20.2,
      lng: -113.8,
      country: "MX",
      occurred_at: "2026-09-27T09:00:00.000Z",
      url: "https://www.gdacs.org/report.aspx?eventid=1001329&episodeid=30&eventtype=TC",
    });
    expect(byId("TC-1001329").summary).toMatch(/^Green alert · Hurricane\/Typhoon > 74 mph/);
  });

  it("maps an offshore earthquake: magnitude in title, no country, UTC time", () => {
    expect(byId("EQ-1569463")).toMatchObject({
      title: "M5.0 Earthquake in South Of Panama",
      category: "earthquake",
      country: null,
      lat: 5.3695,
      lng: -82.7171,
      occurred_at: "2026-10-04T14:06:10.000Z",
    });
  });

  it("drops Green wildfires but keeps Orange ones", () => {
    const out = normalizeGdacs({ features: [variant(2, {}), variant(4, { alertlevel: "Orange" })] }, NOW);
    expect(out.map((e) => e.external_id)).toEqual(["WF-1032527"]);
    expect(out[0]).toMatchObject({ category: "wildfire", severity: expect.any(Number) });
  });

  it("resolves countries from affectedcountries or the ISO-3 map", () => {
    const out = normalizeGdacs(
      { features: [2, 4, 5].map((i) => variant(i, { alertlevel: "Orange" })) },
      NOW,
    );
    const country = (id: string) => out.find((e) => e.external_id === id)!.country;
    expect(country("WF-1032561")).toBe("AU");
    expect(country("WF-1032527")).toBe("PG");
    expect(country("WF-1032552")).toBe("CD");
  });

  it("skips events that haven't started yet, keeps them once they have", () => {
    expect(normalizeGdacs({ features: [variant(3, {})] }, NOW)).toEqual([]);
    const later = Date.parse("2026-10-05T06:00:00Z");
    const [flood] = normalizeGdacs({ features: [variant(3, {})] }, later);
    expect(flood).toMatchObject({ category: "flood", occurred_at: "2026-10-05T01:00:00.000Z" });
    expect(flood.summary).not.toMatch(/Magnitude 0/);
  });

  it("applies alert levels and Orange downgrade", () => {
    const out = normalizeGdacs(
      {
        features: [
          variant(0, { eventid: 1, alertlevel: "Red" }),
          variant(0, { eventid: 2, alertlevel: "Orange" }),
          variant(1, { eventid: 3, alertlevel: "Orange" }), // M5 quake
          variant(1, { eventtype: "VO", eventid: 4, alertlevel: "Orange", severitydata: null }),
          variant(1, { eventtype: "DR", eventid: 5 }),
        ],
      },
      NOW,
    );
    expect(out.map((e) => [e.external_id, e.category, e.severity])).toEqual([
      ["TC-1", "storm", 5],
      ["TC-2", "storm", 4],
      ["EQ-3", "earthquake", 3],
      ["VO-4", "volcano", 4],
      ["DR-5", "other", 2],
    ]);
  });

  it("keys rows by event, not episode (duplicates in one payload collapse to the first)", () => {
    const out = normalizeGdacs(
      { features: [variant(0, { episodeid: 31 }), variant(0, { episodeid: 30 })] },
      NOW,
    );
    expect(out).toHaveLength(1);
    expect(out[0].external_id).toBe("TC-1001329");
  });

  it("takes the vertex centroid of polygons", () => {
    const ring = [
      [10, 0],
      [12, 0],
      [12, 2],
      [10, 2],
      [10, 0],
    ];
    const out = normalizeGdacs(
      {
        features: [
          variant(2, { eventid: 7, alertlevel: "Orange" }, { type: "Polygon", coordinates: [ring] }),
          variant(2, { eventid: 8, alertlevel: "Orange" }, { type: "MultiPolygon", coordinates: [[ring]] }),
        ],
      },
      NOW,
    );
    expect(out.map((e) => [e.lng, e.lat])).toEqual([
      [11, 1],
      [11, 1],
    ]);
  });

  it("skips invalid features instead of throwing", () => {
    const out = normalizeGdacs(
      {
        features: [
          null,
          { nope: true },
          variant(0, { eventid: 10 }, { type: "LineString", coordinates: [[0, 0], [1, 1]] }),
          variant(0, { eventid: 11 }, { type: "Point", coordinates: [200, 10] }),
          variant(0, { eventid: 12, fromdate: "garbage" }),
          variant(0, { eventid: 13, name: "", description: "" }),
          variant(0, { eventid: null }),
          variant(0, { eventid: 14, alertlevel: undefined }),
          variant(0, { eventid: 15, url: { report: "http://insecure.example/report" } }),
        ],
      },
      NOW,
    );
    expect(out.map((e) => e.external_id)).toEqual(["TC-15"]);
    expect(out[0].url).toBeNull();
    expect(normalizeGdacs(null, NOW)).toEqual([]);
    expect(normalizeGdacs({ features: "x" }, NOW)).toEqual([]);
  });

  it("is what the ingester's normalize uses", () => {
    expect(gdacsIngester.normalize(fixture()).map((e) => e.external_id)).toEqual(events.map((e) => e.external_id));
  });
});

describe("gdacsIngester.fetchRaw", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fetches the event list and throws on non-2xx", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(fixture()), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const raw = await gdacsIngester.fetchRaw();
    expect(fetchMock).toHaveBeenCalledWith(GDACS_URL, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(gdacsIngester.normalize(raw).map((e) => e.external_id)).toEqual(
      expect.arrayContaining(["TC-1001329", "EQ-1569463"]),
    );

    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    await expect(gdacsIngester.fetchRaw()).rejects.toThrow(/503/);
  });
});
