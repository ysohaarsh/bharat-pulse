import { describe, expect, it } from "vitest";
import { fixture } from "@/lib/test/fixtures";
import { inIndiaBox } from "./geo";
import { extractEvents, ncsIngester, parseMagnitudeDepth, parseOriginTime, severityFromMagnitude } from "./ncs";

const html = fixture("ncs.html");

describe("NCS helpers", () => {
  it("parses IST origin times", () => {
    expect(new Date(parseOriginTime("2026-10-05 00:11:02 IST")).toISOString()).toBe("2026-10-04T18:41:02.000Z");
    expect(parseOriginTime("2026-10-05")).toBeNaN();
  });

  it("parses magnitude and depth", () => {
    expect(parseMagnitudeDepth("M: 3.7 , D: 104km")).toEqual({ mag: 3.7, depthKm: 104 });
    expect(parseMagnitudeDepth(null)).toEqual({ mag: null, depthKm: null });
  });

  it("maps magnitude to severity", () => {
    expect([3.9, 4.0, 5.5, 6.1, 7.2].map(severityFromMagnitude)).toEqual([1, 2, 3, 4, 5]);
  });

  it("extracts every data-json payload", () => {
    expect(extractEvents(html)).toHaveLength(40);
  });
});

describe("ncsIngester.normalize", () => {
  const events = ncsIngester.normalize(html);

  it("keeps quakes inside India's box only", () => {
    expect(events.length).toBeGreaterThan(0);
    expect(events.length).toBeLessThanOrEqual(40);
    for (const e of events) expect(inIndiaBox(e.lat!, e.lng!)).toBe(true);
  });

  it("builds readable titles and summaries", () => {
    const e = events[0];
    expect(e.title).toMatch(/^M\d\.\d earthquake — .+/);
    expect(e.summary).toMatch(/Magnitude \d\.\d/);
    expect(e.category).toBe("earthquake");
    expect(e.lang).toBe("en");
  });

  it("returns nothing for non-HTML input", () => {
    expect(ncsIngester.normalize(42 as unknown as string)).toEqual([]);
  });
});
