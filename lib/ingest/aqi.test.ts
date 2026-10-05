import { describe, expect, it } from "vitest";
import { aqiBand, naqiFromPm } from "@/lib/india/aqi";
import { jsonFixture } from "@/lib/test/fixtures";
import { AQI_CITIES, aqiIngester, parseCpcbTime, readingsFromCpcb, readingsFromOpenMeteo, type AqiRaw } from "./aqi";

// cpcb.json is hand-made from published samples of the OGD resource (see aqi.ts header);
// openmeteo.json is a real response for AQI_CITIES.
const cpcb: AqiRaw = { kind: "cpcb", fetchedAt: "2026-10-05T04:00:00Z", records: jsonFixture<{ records: unknown[] }>("cpcb.json").records };
const model: AqiRaw = { kind: "openmeteo", fetchedAt: "2026-10-05T04:00:00Z", results: jsonFixture<unknown[]>("openmeteo.json") };

describe("NAQI", () => {
  it("computes sub-indices from PM concentrations", () => {
    expect(naqiFromPm(30, null)).toBe(50);
    expect(naqiFromPm(null, 100)).toBe(100);
    expect(naqiFromPm(75, 120)).toBe(150);
    expect(naqiFromPm(300, 0)).toBe(420);
    expect(naqiFromPm(null, null)).toBeNaN();
  });

  it("names bands", () => {
    expect(aqiBand(45).label).toBe("Good");
    expect(aqiBand(301).label).toBe("Very Poor");
    expect(aqiBand(480).label).toBe("Severe");
  });
});

describe("CPCB readings", () => {
  it("parses dd-mm-yyyy IST timestamps", () => {
    expect(parseCpcbTime("05-10-2026 09:00:00")).toBe("2026-10-05T03:30:00.000Z");
    expect(parseCpcbTime("2026-10-05")).toBeNull();
  });

  it("takes each station's worst pollutant, skipping NA values and bad rows", () => {
    const r = readingsFromCpcb(cpcb.kind === "cpcb" ? cpcb.records : []);
    const anand = r.find((x) => x.label.startsWith("Anand Vihar"))!;
    expect(anand).toMatchObject({ aqi: 412, dominant: "PM2.5", state: "IN-DL", modelled: false });
    expect(anand.lat).toBeCloseTo(28.6468, 3);
    const btm = r.find((x) => x.label.startsWith("BTM"))!;
    expect(btm).toMatchObject({ aqi: 38, dominant: "OZONE", state: "IN-KA" });
    // Station without coordinates falls back to the gazetteer.
    expect(r.find((x) => x.city === "Greater Noida")).toMatchObject({ state: "IN-UP" });
    expect(r.some((x) => x.label === "Broken row")).toBe(false);
  });
});

describe("aqiIngester", () => {
  it("emits one event per city above 300, worst station wins", () => {
    const events = aqiIngester.normalize(cpcb);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      title: "Delhi air quality Severe: AQI 412",
      severity: 5,
      category: "air",
      state: "IN-DL",
      external_id: "aqi:IN-DL:delhi:2026-10-05",
    });
  });

  it("exposes every station as a metric", () => {
    const metrics = aqiIngester.metrics!(cpcb);
    expect(metrics.map((m) => m.region).sort()).toEqual(
      ["cpcb:Anand Vihar, Delhi - DPCC", "cpcb:BTM Layout, Bengaluru - CPCB", "cpcb:Knowledge Park - III, Greater Noida - UPPCB", "cpcb:Lodhi Road, Delhi - IMD"],
    );
  });

  it("falls back to modelled readings for the 50 cities", () => {
    const readings = readingsFromOpenMeteo(model.kind === "openmeteo" ? model.results : []);
    expect(readings).toHaveLength(AQI_CITIES.length);
    expect(readings.every((r) => r.modelled && r.state)).toBe(true);
    const events = aqiIngester.normalize(model);
    for (const e of events) {
      expect(e.summary).toContain("Modelled");
      expect(e.severity).toBeGreaterThanOrEqual(4);
    }
  });
});
