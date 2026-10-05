import { describe, expect, it } from "vitest";
import { mynetaSearch, prsMpTrack, prsSlug } from "./links";
import { parseWhois } from "./whois";

describe("links", () => {
  it("builds PRS slugs the way prsindia.org does", () => {
    expect(prsSlug("Bansuri Swaraj")).toBe("bansuri-swaraj");
    expect(prsSlug("Dr. Shashi Tharoor")).toBe("shashi-tharoor");
    expect(prsMpTrack("P C Mohan")).toBe("https://prsindia.org/mptrack/18th-lok-sabha/p-c-mohan");
  });

  it("encodes MyNeta searches", () => {
    expect(mynetaSearch("Bangalore Central")).toBe("https://www.myneta.info/search_myneta.php?q=Bangalore%20Central");
  });
});

describe("parseWhois", () => {
  const raw = {
    lat: 12.97,
    lng: 77.59,
    boundaries: [
      { kind: "ac", code: "AC:IN-KA:162", name: "Shivajinagar", name_hi: null, state_code: "IN-KA", meta: {} },
      { kind: "pc", code: "PC:S10_25", name: "Bangalore Central", name_hi: null, state_code: "IN-KA", meta: {} },
      { kind: "district", code: "DT:572", name: "Bangalore", name_hi: null, state_code: "IN-KA", meta: {} },
      { kind: "state", code: "IN-KA", name: "Karnataka", name_hi: null, state_code: "IN-KA", meta: {} },
    ],
    representatives: [
      {
        house: "ls",
        boundary_code: "PC:S10_25",
        constituency: "Bangalore Central",
        name: "P C Mohan",
        party: "Bharatiya Janata Party",
        party_short: "BJP",
        email: "pc.mohan@mpls.sansad.in",
        photo_url: null,
        profile_url: "https://sansad.in/ls/members/biography/4413?from=members",
        source: "sansad.in",
        refreshed_at: "2026-10-05T00:00:00Z",
      },
    ],
  };

  it("indexes boundaries and matches the MP to the seat", () => {
    const w = parseWhois(raw)!;
    expect(w.pc?.name).toBe("Bangalore Central");
    expect(w.ac?.name).toBe("Shivajinagar");
    expect(w.state?.code).toBe("IN-KA");
    expect(w.mp?.name).toBe("P C Mohan");
    expect(w.mla).toBeNull();
    expect(w.ward).toBeNull();
  });

  it("reports a vacant seat as no MP", () => {
    expect(parseWhois({ ...raw, representatives: [] })!.mp).toBeNull();
  });

  it("rejects malformed payloads", () => {
    expect(parseWhois(null)).toBeNull();
    expect(parseWhois({ lat: 1 })).toBeNull();
  });
});
