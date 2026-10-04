import { describe, expect, it } from "vitest";
import { classify } from "./classify";

describe("classify category", () => {
  it.each([
    ["Magnitude 6.1 earthquake strikes off coast", "earthquake"],
    ["Volcano erupts, ash cloud grounds flights", "volcano"],
    ["Wildfires force thousands from homes", "wildfire"],
    ["Flash floods sweep through villages", "flood"],
    ["Typhoon makes landfall", "storm"],
    ["Cholera outbreak spreads in camps", "health"],
    ["Russian drone attack hits Kyiv bridge", "conflict"],
    ["Inflation slows as central bank holds interest rates", "economy"],
    ["Brazil votes in presidential election", "politics"],
    ["Museum unveils new mural", "other"],
  ])("%s → %s", (text, category) => {
    expect(classify(text).category).toBe(category);
  });

  it("prefers the natural hazard over generic conflict words when tied", () => {
    expect(classify("Earthquake kills 12, military deployed").category).toBe("earthquake");
  });

  it("uses hit counts, so a protest about a war is conflict", () => {
    expect(classify("Troops open fire on protest as war and airstrikes escalate").category).toBe("conflict");
  });
});

describe("classify severity", () => {
  it("defaults to 1 for other and 2 for recognised categories", () => {
    expect(classify("Museum unveils new mural").severity).toBe(1);
    expect(classify("Parliament debates budget").severity).toBe(2);
  });

  it("ranks casualties and war higher", () => {
    expect(classify("Clashes leave several injured").severity).toBe(3);
    expect(classify("Three killed in shooting").severity).toBe(4);
    expect(classify("War enters second year").severity).toBe(4);
    expect(classify("Airstrike: dozens dead in overnight raid").severity).toBe(5);
    expect(classify("Full-scale invasion feared").severity).toBe(5);
    expect(classify("Bombing kills at least 45 people").severity).toBe(5);
    expect(classify("30 people killed in market blast").severity).toBe(5);
  });

  it("scales with earthquake magnitude", () => {
    expect(classify("Magnitude 7.4 earthquake").severity).toBe(5);
    expect(classify("Magnitude 6.2 earthquake").severity).toBe(4);
    expect(classify("Small earthquake felt").severity).toBe(3);
  });

  it("handles empty input", () => {
    expect(classify("")).toEqual({ category: "other", severity: 1 });
    expect(classify(null)).toEqual({ category: "other", severity: 1 });
  });
});
