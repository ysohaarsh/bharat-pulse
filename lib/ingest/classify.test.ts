import { describe, expect, it } from "vitest";
import { classify } from "./classify";

describe("classify", () => {
  it.each([
    ["Flash floods and landslides hit Himachal; 6 dead", "flood", 4],
    ["Cyclone Montha to make landfall near Kakinada tonight", "cyclone", 3],
    ["IMD issues orange alert for heavy rain in coastal Karnataka", "weather", 4],
    ["Heatwave grips Rajasthan, mercury touches 47°C", "heat", 3],
    ["Earthquake of magnitude 4.2 jolts Assam", "earthquake", 3],
    ["Delhi AQI slips to 412, GRAP stage 3 invoked", "air", 4],
    ["Dengue cases rise in Bengaluru hospitals", "health", 2],
    ["Potholes on Outer Ring Road: BBMP says repairs in a week", "civic", 2],
    ["PM lays foundation stone for metro and expressway projects", "infrastructure", 2],
    ["Goods train derails near Balasore, services hit", "transport", 3],
    ["Three Maoists killed in encounter in Bijapur", "security", 4],
    ["Sensex falls 600 points as rupee weakens", "economy", 2],
    ["BJP, Congress spar over voter list revision in Lok Sabha", "politics", 2],
    ["Actor launches new film trailer", "other", 1],
  ] as const)("%s → %s / %d", (text, category, severity) => {
    expect(classify(text)).toEqual({ category, severity });
  });

  it("treats counted deaths as severe", () => {
    expect(classify("Bus falls into gorge, 25 people killed").severity).toBe(5);
    expect(classify("Wall collapse: death toll rises to 3").severity).toBe(4);
  });

  it("handles empty input", () => {
    expect(classify(null)).toEqual({ category: "other", severity: 1 });
  });
});
