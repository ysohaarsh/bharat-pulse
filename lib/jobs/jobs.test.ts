import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STATES } from "@/lib/india/states";
import { jsonFixture } from "@/lib/test/fixtures";
import { mandiMetrics, median } from "./mandi";
import { overpassQuery, projectKind, projectsFromOverpass, statesForRun } from "./osm";
import { numberFromHtml, powerMetrics } from "./power";
import { representativesFromSansad, seatKey, type PcBoundary } from "./sansad";

const pcs: PcBoundary[] = JSON.parse(readFileSync(join(process.cwd(), "public", "geo", "pc.geojson"), "utf8")).features.map(
  (f: { properties: PcBoundary }) => ({ code: f.properties.code, name: f.properties.name, state_code: f.properties.state_code }),
);

describe("power", () => {
  it("pulls numbers out of display HTML", () => {
    expect(numberFromHtml("<span class='counter'>            217</span><span>&nbsp;GW</span>")).toBe(217);
    expect(numberFromHtml("7.60 &nbsp;&#x20B9;/Unit")).toBe(7.6);
    expect(numberFromHtml(null)).toBeNull();
  });

  it("reads the live dashboard payload", () => {
    const rows = powerMetrics(jsonFixture("power.top.json"), "2026-10-05T00:00:00Z");
    expect(rows.find((r) => r.key === "power.demand")).toMatchObject({ value: 217, unit: "GW", region: "IN" });
    expect(rows.find((r) => r.key === "power.price")).toMatchObject({ value: 7.6 });
    expect(powerMetrics([], "x")).toEqual([]);
  });

  it("ignores a zero demand reading", () => {
    expect(powerMetrics([{ demand: "0 GW" }], "2026-10-05T00:00:00Z")).toEqual([]);
  });
});

describe("mandi", () => {
  it("computes medians", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });

  // mandi.onion.json = 20 real rows (2 pages of 10) from the live feed on 2026-10-22: numeric prices, dd/mm/yyyy.
  it("computes national + per-state medians from the real feed shape", () => {
    const records = jsonFixture<{ records: unknown[] }>("mandi.onion.json").records;
    const rows = mandiMetrics("Onion", records);
    const national = rows.find((r) => r.region === "IN")!;
    expect(national).toMatchObject({ key: "mandi:Onion", value: 6000, unit: "₹/qtl", meta: { markets: 20 } });
    expect(national.observed_at).toBe("2026-10-22T06:30:00.000Z");
    expect(rows.find((r) => r.region === "IN-TN")).toMatchObject({ value: 6000, meta: { markets: 17 } });
    expect(rows.find((r) => r.region === "IN-PB")!.value).toBe(5000);
    expect(rows.find((r) => r.region === "IN-KL")!.value).toBe(6000); // feed says "Keralam"
    expect(mandiMetrics("Onion", [])).toEqual([]);
  });

  it("uses the latest arrival date only and skips rows without a price", () => {
    const [a, b, c] = jsonFixture<{ records: Record<string, unknown>[] }>("mandi.onion.json").records;
    const rows = mandiMetrics("Onion", [
      { ...a, arrival_date: "21/10/2026", modal_price: 9999 },
      { ...b, modal_price: "" },
      c,
    ]);
    expect(rows.find((r) => r.region === "IN")).toMatchObject({ value: c.modal_price, meta: { markets: 1 } });
  });
});

describe("sansad", () => {
  it("normalises seat names", () => {
    expect(seatKey("Anantnag-Rajouri (ex Anantnag)")).toBe(seatKey("Anantnag-Rajouri"));
    expect(seatKey("Daman & Diu")).toBe(seatKey("Daman and Diu"));
    expect(seatKey("Guwahati")).toBe(seatKey("Gauhati"));
  });

  it("matches every sitting MP to exactly one Lok Sabha seat polygon", () => {
    const reps = representativesFromSansad(jsonFixture("sansad.seats.json"), pcs);
    // 544 listed: Nanded twice (died + by-election winner); Nagaon, Basirhat, Shillong vacant.
    expect(reps).toHaveLength(540);
    expect(reps.filter((r) => !r.boundary_code).map((r) => r.constituency)).toEqual([]);
    expect(new Set(reps.map((r) => r.boundary_code)).size).toBe(540);
  });

  it("keeps only official contact details", () => {
    const reps = representativesFromSansad(jsonFixture("sansad.json"), pcs);
    const blr = reps.find((r) => r.constituency === "Bangalore Central")!;
    expect(blr.email).toMatch(/@mpls\.sansad\.in$/);
    expect(blr.state_code).toBe("IN-KA");
    expect(blr.photo_url).toMatch(/^https:\/\/sansad\.in\//);
    expect(reps.every((r) => !r.email?.includes("example.com"))).toBe(true);
    expect(reps.filter((r) => r.constituency === "Nanded")).toHaveLength(1);
  });
});

describe("osm", () => {
  it("rotates through every state", () => {
    const seen = new Set<string>();
    for (let h = 0; h < 6; h++) for (const s of statesForRun(new Date(h * 3_600_000))) seen.add(s);
    expect(seen.size).toBe(STATES.length);
    expect(overpassQuery("IN-KA")).toContain('area["ISO3166-2"="IN-KA"]');
  });

  it("classifies construction tags", () => {
    expect(projectKind({ railway: "construction", construction: "subway" })).toBe("metro");
    expect(projectKind({ railway: "construction", name: "Namma Metro Pink Line" })).toBe("metro");
    expect(projectKind({ railway: "construction" })).toBe("railway");
    expect(projectKind({ highway: "construction" })).toBe("highway");
    expect(projectKind({ landuse: "construction" })).toBeNull();
    expect(projectKind({ amenity: "school" })).toBeNull();
  });

  it("groups segments into named projects", () => {
    const rows = projectsFromOverpass("IN-KA", jsonFixture("osm.ka.json"));
    expect(rows.length).toBeGreaterThan(0);
    const expressway = rows.find((r) => r.name === "Mysuru-Kushalnagar Expressway");
    expect(expressway?.kind).toBe("highway");
    expect(expressway!.segments).toBeGreaterThan(1);
    expect(rows.every((r) => r.state === "IN-KA" && r.name && !/\(u\/c\)/i.test(r.name))).toBe(true);
    expect(new Set(rows.map((r) => r.external_id)).size).toBe(rows.length);
  });
});
