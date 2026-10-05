import { describe, expect, it } from "vitest";
import { jsonFixture } from "@/lib/test/fixtures";
import {
  categoryFromDisasterType,
  parseCentroid,
  parseSachetTime,
  sachetIngester,
  severityFromColor,
  stateFromSource,
} from "./sachet";

const raw = jsonFixture<unknown[]>("sachet.json");

describe("SACHET helpers", () => {
  it("parses Java-style IST timestamps", () => {
    expect(new Date(parseSachetTime("Mon Oct 05 00:15:00 IST 2026")).toISOString()).toBe("2026-10-04T18:45:00.000Z");
    expect(parseSachetTime("garbage")).toBeNaN();
  });

  it("parses lng,lat centroids", () => {
    expect(parseCentroid("77.52990483931778,13.81568148849419")).toEqual({ lat: 13.81568148849419, lng: 77.52990483931778 });
    expect(parseCentroid("")).toBeNull();
    expect(parseCentroid("abc,1")).toBeNull();
  });

  it("maps colours, disaster types and SDMA names", () => {
    expect(severityFromColor("red")).toBe(5);
    expect(severityFromColor("Orange")).toBe(4);
    expect(severityFromColor(undefined)).toBe(2);
    expect(categoryFromDisasterType("Thunderstorm with Lightning")).toBe("weather");
    expect(categoryFromDisasterType("Flood")).toBe("flood");
    expect(categoryFromDisasterType("Cyclone")).toBe("cyclone");
    expect(categoryFromDisasterType("Heat Wave")).toBe("heat");
    expect(categoryFromDisasterType("Tsunami")).toBe("earthquake");
    expect(stateFromSource("Uttar Pradesh SDMA")).toBe("IN-UP");
    expect(stateFromSource("CWC")).toBeNull();
    expect(stateFromSource("IMD Chennai")).toBeNull();
  });
});

describe("sachetIngester.normalize", () => {
  const events = sachetIngester.normalize(raw);

  it("keeps every well-formed alert from the real feed", () => {
    expect(events.length).toBe(raw.length);
    expect(new Set(events.map((e) => e.external_id)).size).toBe(events.length);
  });

  it("uses the warning as the title in its own language, with English context in the summary", () => {
    const telugu = events.find((e) => e.lang === "te")!;
    expect(telugu.title).toMatch(/[ఀ-౿]/); // Telugu script
    expect(telugu.summary).toContain("Lightning");
    expect(telugu.summary).toContain("Andhra Pradesh SDMA");
    expect(telugu.state).toBe("IN-AP");
    expect(telugu.severity).toBe(4);
    expect(telugu.lat).toBeCloseTo(13.8157, 3);
  });

  it("links to the CAP XML and stores valid ISO times", () => {
    for (const e of events) {
      expect(e.url).toMatch(/^https:\/\/sachet\.ndma\.gov\.in\/cap_public_website\/FetchXMLFile\?identifier=\d+$/);
      expect(Number.isNaN(Date.parse(e.occurred_at))).toBe(false);
      expect(e.source).toBe("sachet");
    }
  });

  it("classifies CWC river forecasts as floods", () => {
    expect(events.filter((e) => e.summary?.includes("CWC")).every((e) => e.category === "flood")).toBe(true);
  });

  it("skips malformed items instead of throwing", () => {
    expect(sachetIngester.normalize([{ nope: true }, null, 5])).toEqual([]);
    expect(sachetIngester.normalize({})).toEqual([]);
  });
});
