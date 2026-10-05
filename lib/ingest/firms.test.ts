import { describe, expect, it } from "vitest";
import { fixture } from "@/lib/test/fixtures";
import { firmsIngester, firmsUrl, parseFirmsCsv, severityForCell } from "./firms";

// Hand-made fixture in the documented VIIRS NRT CSV layout (a real one needs a MAP_KEY).
const csv = fixture("firms.csv");

describe("FIRMS", () => {
  it("builds the area URL over India's box", () => {
    expect(firmsUrl("KEY")).toBe(
      "https://firms.modaps.eosdis.nasa.gov/api/area/csv/KEY/VIIRS_SNPP_NRT/67,5,98.5,38/1",
    );
  });

  it("parses rows, dropping low-confidence and malformed ones", () => {
    const rows = parseFirmsCsv(csv);
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.confidence !== "l")).toBe(true);
    expect(parseFirmsCsv("")).toEqual([]);
    expect(parseFirmsCsv("a,b\n1,2")).toEqual([]);
  });

  it("aggregates hotspots into one event per 0.25° cell per day", () => {
    const events = firmsIngester.normalize(csv);
    expect(events).toHaveLength(2);
    const punjab = events.find((e) => e.lat! > 30)!;
    expect(punjab.title).toBe("3 active fires detected by satellite");
    expect(punjab.occurred_at).toBe("2026-10-04T09:54:00.000Z"); // latest pass in the cell
    expect(punjab.summary).toContain("35 MW");
    const odisha = events.find((e) => e.lat! < 30)!;
    expect(odisha.title).toBe("Active fire detected by satellite");
    expect(odisha.category).toBe("wildfire");
  });

  it("scales severity with count and fire power", () => {
    expect(severityForCell(1, 5)).toBe(1);
    expect(severityForCell(5, 5)).toBe(2);
    expect(severityForCell(20, 5)).toBe(3);
    expect(severityForCell(2, 400)).toBe(4);
  });
});
