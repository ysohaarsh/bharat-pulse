import { describe, expect, it } from "vitest";
import { detectPlace, inIndiaBox, statePoint } from "./geo";

describe("detectPlace", () => {
  it("finds a state", () => {
    expect(detectPlace("Heavy rain lashes Kerala; schools shut")).toMatchObject({ state: "IN-KL", district: null });
  });

  it("prefers a district over its state, and maps modern city names", () => {
    expect(detectPlace("Bengaluru potholes: Karnataka HC pulls up civic body")).toMatchObject({
      state: "IN-KA",
      district: "Bangalore",
    });
    expect(detectPlace("Prayagraj gears up for Magh Mela")).toMatchObject({ state: "IN-UP", district: "Allahabad" });
    expect(detectPlace("Gurugram waterlogging after 2 hours of rain")).toMatchObject({ state: "IN-HR", district: "Gurgaon" });
  });

  it("prefers the longest alias at a position", () => {
    expect(detectPlace("Navi Mumbai airport opens")).toMatchObject({ district: "Thane" });
    expect(detectPlace("Tourists stranded in North Goa")).toMatchObject({ district: "North Goa" });
  });

  it("treats plain Delhi as the state and New Delhi as the district", () => {
    expect(detectPlace("Delhi air quality slips to severe")).toMatchObject({ state: "IN-DL", district: null });
    expect(detectPlace("Protest at Jantar Mantar in New Delhi")).toMatchObject({ state: "IN-DL", district: "New Delhi" });
  });

  it("resolves districts shared by two states only when the state is named", () => {
    expect(detectPlace("Bus accident in Aurangabad")).toBeNull();
    expect(detectPlace("Bus accident in Aurangabad, Bihar")).toMatchObject({ state: "IN-BR", district: "Aurangabad" });
    expect(detectPlace("Landslide near Bilaspur in Himachal Pradesh")).toMatchObject({ state: "IN-HP", district: "Bilaspur" });
  });

  it("ignores district names that are ordinary words", () => {
    expect(detectPlace("Onion prices in the mandi fall")).toBeNull();
    expect(detectPlace("Shooter wins gold, punches the air")).toBeNull();
    expect(detectPlace("Five arrested in East Delhi")).toMatchObject({ state: "IN-DL", district: null });
  });

  it("does not pin IPL teams, seas or foreign places", () => {
    expect(detectPlace("Mumbai Indians beat Chennai Super Kings")).toBeNull();
    expect(detectPlace("Low pressure area forms over Bay of Bengal")).toBeNull();
    expect(detectPlace("India tour of West Indies announced")).toBeNull();
    expect(detectPlace("Trade talks with the US resume")).toBeNull();
  });

  it("is case-insensitive and respects letter boundaries", () => {
    expect(detectPlace("KERALA FLOODS")).toMatchObject({ state: "IN-KL" });
    expect(detectPlace("Assam's tea gardens")).toMatchObject({ state: "IN-AS" });
    expect(detectPlace("Indoreans celebrate")).toBeNull();
  });

  it("picks the most-mentioned place, earliest on ties", () => {
    expect(detectPlace("Chennai rain: Chennai schools shut; Madurai dry")).toMatchObject({ district: "Chennai" });
    expect(detectPlace("Patna and Ranchi brace for heat")).toMatchObject({ district: "Patna" });
  });
});

describe("statePoint / inIndiaBox", () => {
  it("returns a point inside India for every state", () => {
    const p = statePoint("IN-TN");
    expect(p).toMatchObject({ state: "IN-TN", district: null });
    expect(inIndiaBox(p!.lat, p!.lng)).toBe(true);
    expect(statePoint("XX")).toBeNull();
  });

  it("knows India's bounding box", () => {
    expect(inIndiaBox(28.6, 77.2)).toBe(true);
    expect(inIndiaBox(35.9, 70.6)).toBe(true); // Hindu Kush quakes are within the margin
    expect(inIndiaBox(51.5, -0.1)).toBe(false);
  });
});
