import { describe, expect, it } from "vitest";
import { aqiBand, naqiFromPm } from "@/lib/india/aqi";
import { jsonFixture } from "@/lib/test/fixtures";
import { AQI_CITIES, aqiIngester, parseCpcbTime, readingsFromCpcb, readingsFromOpenMeteo, type AqiRaw } from "./aqi";

// cpcb.json is a trimmed REAL response of the OGD resource (35 rows, 5 stations, fetched 2026-10-22 11:00 IST):
// Wazirpur (Delhi), Knowledge Park III and V (Greater Noida), Kurla (Mumbai) and
// Kherwadi (Mumbai, all "NA" but ozone). openmeteo.json is a real response for AQI_CITIES.
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

  it("computes NAQI sub-indices from concentrations; station AQI is the max", () => {
    const r = readingsFromCpcb(cpcb.kind === "cpcb" ? cpcb.records : []);
    // Wazirpur (avg_value, ug/m3): PM2.5 225, PM10 254, NO2 93, SO2 12, NH3 3, O3 9 (CO excluded).
    //  PM2.5 225 is in 120-250 -> 300-400:  300 + 100 * (225-120)/(250-120) = 300 + 80.77 = 380.77 -> 381
    //  PM10  254 is in 250-350 -> 200-300:  200 + 100 * (254-250)/100       = 204
    //  NO2    93 is in 80-180  -> 100-200:  100 + 100 * (93-80)/100         = 113
    //  SO2    12 -> 12/40*50 = 15;  NH3 3 -> 3/200*50 = 0.75 -> 1;  O3 9 -> 9/50*50 = 9
    //  max = 381 (PM2.5) -> "Very Poor" (301-400). The raw max, 254 (PM10), is what the old code reported.
    const wazirpur = r.find((x) => x.label.startsWith("Wazirpur"))!;
    expect(wazirpur).toMatchObject({ aqi: 381, dominant: "PM2.5", state: "IN-DL", city: "Delhi", modelled: false });
    expect(aqiBand(wazirpur.aqi).label).toBe("Very Poor");
    expect(wazirpur.subIndices).toEqual({ "PM2.5": 381, PM10: 204, NO2: 113, SO2: 15, NH3: 1, OZONE: 9 });
    expect(wazirpur.lat).toBeCloseTo(28.6998, 3);
    expect(wazirpur.observedAt).toBe("2026-10-22T05:30:00.000Z");
    // Knowledge Park - V: PM2.5 167 -> 300 + 100*47/130 = 336 beats PM10 226 -> 184.
    expect(r.find((x) => x.label.startsWith("Knowledge Park - V"))).toMatchObject({ aqi: 336, dominant: "PM2.5", state: "IN-UP" });
  });

  it("skips NA values: Knowledge Park III has NO2 'NA' but still has 5 valid pollutants", () => {
    const r = readingsFromCpcb(cpcb.kind === "cpcb" ? cpcb.records : []);
    const kp3 = r.find((x) => x.label.startsWith("Knowledge Park - III"))!;
    expect(kp3.aqi).toBe(335); // PM2.5 165 -> 300 + 100*45/130 = 334.6
    expect(Object.keys(kp3.subIndices!).sort()).toEqual(["NH3", "OZONE", "PM10", "PM2.5", "SO2"]);
  });

  it("drops stations that fail CPCB's rule (>= 3 pollutants incl. a PM)", () => {
    const r = readingsFromCpcb(cpcb.kind === "cpcb" ? cpcb.records : []);
    expect(r.some((x) => x.label.startsWith("Kherwadi"))).toBe(false); // only ozone is non-NA
    expect(r.map((x) => x.label).sort()).toEqual([
      "Knowledge Park - III, Greater Noida - UPPCB",
      "Knowledge Park - V, Greater Noida - UPPCB",
      "Kurla, Mumbai - MPCB",
      "Wazirpur, Delhi - DPCC",
    ]);
    // Kurla: PM2.5 81 -> 100 + 100*(81-60)/30 = 170 (Moderate) beats PM10 101 -> 101.
    expect(r.find((x) => x.label.startsWith("Kurla"))).toMatchObject({ aqi: 170, dominant: "PM2.5", state: "IN-MH" });
  });

  it("ignores CO (unit unclear) and malformed rows", () => {
    const base = { state: "Delhi", city: "Delhi", station: "T", last_update: "22-10-2026 11:00:00", latitude: "28.6", longitude: "77.2" };
    const row = (pollutant_id: string, v: string) => ({ ...base, pollutant_id, min_value: v, max_value: v, avg_value: v });
    const rows = [row("PM10", "60"), row("NO2", "20"), row("CO", "9999"), { nonsense: true }, { ...row("SO2", "x"), station: "T" }];
    expect(readingsFromCpcb(rows)).toEqual([]); // CO and bad SO2 don't count: only 2 valid pollutants
    // Plenty of gases but no PM2.5/PM10 -> not reportable.
    expect(readingsFromCpcb([row("NO2", "20"), row("SO2", "10"), row("OZONE", "30"), row("NH3", "5")])).toEqual([]);
    expect(readingsFromCpcb([...rows, row("SO2", "10")])[0]).toMatchObject({ aqi: 60, dominant: "PM10" }); // PM10 60 -> 50 + 50*10/50 = 60
  });
});

describe("aqiIngester", () => {
  it("emits one event per city above 300, worst station wins", () => {
    const events = aqiIngester.normalize(cpcb);
    expect(events.map((e) => e.title).sort()).toEqual([
      "Delhi air quality Very Poor: AQI 381",
      "Greater Noida air quality Very Poor: AQI 336",
    ]);
    expect(events.find((e) => e.state === "IN-DL")).toMatchObject({
      severity: 4,
      category: "air",
      external_id: "aqi:IN-DL:delhi:2026-10-22",
    });
  });

  it("exposes qualifying stations as metrics with the dominant pollutant in meta", () => {
    const metrics = aqiIngester.metrics!(cpcb);
    expect(metrics.map((m) => m.region).sort()).toEqual([
      "cpcb:Knowledge Park - III, Greater Noida - UPPCB",
      "cpcb:Knowledge Park - V, Greater Noida - UPPCB",
      "cpcb:Kurla, Mumbai - MPCB",
      "cpcb:Wazirpur, Delhi - DPCC",
    ]);
    expect(metrics.find((m) => m.region === "cpcb:Wazirpur, Delhi - DPCC")).toMatchObject({
      value: 381,
      unit: "AQI",
      meta: { dominant: "PM2.5", band: "Very Poor", pollutants: 6, modelled: false },
    });
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
