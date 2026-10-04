import type { Category, Severity } from "@/lib/types";

/**
 * Keyword classifier for news headlines/summaries.
 *
 * Category: each category has a keyword list; the category with the most keyword hits
 * wins, ties broken by the order below (specific natural hazards before broad
 * conflict/politics, so "Earthquake kills 12 in Turkey" is an earthquake, not conflict).
 * No hits → "other".
 *
 * Severity: max of matched severity rules; falls back to 2 for any recognised category
 * and 1 for "other".
 */

const w = (words: string[]) => new RegExp(`\\b(?:${words.join("|")})\\b`, "gi");

const CATEGORY_RULES: [Category, RegExp][] = [
  ["earthquake", w(["earthquakes?", "quakes?", "tremors?", "aftershocks?", "seismic", "tsunami"])],
  ["volcano", w(["volcano(?:es)?", "volcanic", "eruptions?", "erupts?", "erupted", "lava", "ash cloud"])],
  ["wildfire", w(["wildfires?", "bushfires?", "forest fires?", "brush ?fires?", "grass ?fires?"])],
  ["flood", w(["floods?", "flooding", "flooded", "flash floods?", "inundated", "landslides?", "mudslides?", "torrential rain"])],
  ["storm", w(["hurricanes?", "typhoons?", "cyclones?", "tornado(?:es)?", "tropical storm", "storms?", "blizzards?", "storm surge", "heavy winds?"])],
  ["health", w(["outbreaks?", "epidemics?", "pandemics?", "virus(?:es)?", "cholera", "ebola", "measles", "mpox", "covid(?:-19)?", "dengue", "malaria", "bird flu", "avian flu", "influenza", "infections?", "vaccines?", "vaccination", "disease", "polio", "marburg"])],
  ["conflict", w(["wars?", "warfare", "attacks?", "attacked", "airstrikes?", "air strikes?", "strikes? on", "missiles?", "drones?", "shelling", "bomb(?:s|ing|ings|ed)?", "troops", "military", "army", "militants?", "militia", "rebels?", "insurgents?", "gunmen", "shooting", "clashes", "fighting", "invasion", "invade[sd]?", "ceasefire", "truce", "hostages?", "terror(?:ists?|ism)?", "offensive", "frontline", "killed in", "armed forces", "massacres?", "riots?", "rioters", "abduct(?:ed|ion|ions)?", "kidnapp(?:ed|ing|ings)", "ieds?", "explosions?", "assassinat(?:ed|ion|ions)?", "casualties"])],
  ["economy", w(["economy", "economic", "inflation", "markets?", "stocks?", "shares", "trade", "tariffs?", "gdp", "recession", "oil prices?", "central bank", "interest rates?", "currency", "unemployment", "jobs", "debt", "budget", "imf", "investors?"])],
  ["politics", w(["elections?", "electoral", "votes?", "voting", "voters", "polls", "president(?:ial)?", "prime minister", "parliament(?:ary)?", "ministers?", "government", "opposition", "protests?", "protesters", "coup", "sanctions", "diplomat(?:s|ic)?", "summit", "talks", "referendum", "legislation", "lawmakers", "chancellor", "resign(?:s|ed|ation)?", "impeach(?:ment)?"])],
];

/** Severity rules, checked against the whole text; highest matching level wins. */
const SEVERITY_RULES: [Severity, RegExp][] = [
  [5, /\b(?:dozens|scores|hundreds|thousands) (?:of people )?(?:(?:are|were|feared|reported) )?(?:dead|killed|die|died)\b/i],
  [5, /\b(?:massacre|genocide|invasion|mass casualt(?:y|ies)|catastroph(?:e|ic)|nuclear (?:strike|attack))\b/i],
  [5, /\bmagnitude[- ](?:[7-9])(?:\.\d)?\b/i],
  [5, /\bcategory (?:4|5|four|five)\b/i],
  [4, /\b(?:killed|kills|dead|deaths?|death toll|fatalities|war|airstrikes?|air strikes?|bombing|missiles?|state of emergency|evacuat(?:e|ed|ion|ions)|coup)\b/i],
  [4, /\bmagnitude[- ]6(?:\.\d)?\b/i],
  [3, /\b(?:attacks?|attacked|clashes|injured|wounded|explosion|shooting|hostages?|hurricane|typhoon|cyclone|tornado|earthquake|outbreak|epidemic|wildfire|floods?|flooding|eruption|missing|drones?|riots?)\b/i],
  [2, /\b(?:protests?|sanctions|warning|storm|election|crisis|tensions?)\b/i],
];

export interface Classification {
  category: Category;
  severity: Severity;
}

function countKilled(text: string): number {
  let max = 0;
  for (const m of text.matchAll(/\b(\d{1,3}(?:,\d{3})*|\d+)\s+(?:people\s+|civilians\s+|others\s+)?(?:(?:are|were|have been|feared)\s+)?(?:killed|dead|die|died)\b/gi)) {
    max = Math.max(max, Number(m[1].replace(/,/g, "")));
  }
  for (const m of text.matchAll(/\b(?:kill(?:s|ed|ing)?|death toll (?:rises |climbs )?(?:to|of|at))\s+(?:at least\s+)?(\d{1,3}(?:,\d{3})*|\d+)\b/gi)) {
    max = Math.max(max, Number(m[1].replace(/,/g, "")));
  }
  return max;
}

export function classify(text: string | null | undefined): Classification {
  const t = text ?? "";

  let category: Category = "other";
  let bestHits = 0;
  for (const [cat, re] of CATEGORY_RULES) {
    const hits = t.match(re)?.length ?? 0;
    if (hits > bestHits) {
      bestHits = hits;
      category = cat;
    }
  }

  let severity: Severity = category === "other" ? 1 : 2;
  for (const [level, re] of SEVERITY_RULES) {
    if (level > severity && re.test(t)) severity = level;
  }

  const killed = countKilled(t);
  if (killed >= 20) severity = 5;
  else if (killed > 0 && severity < 4) severity = 4;

  return { category, severity };
}
