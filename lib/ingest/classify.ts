import type { Category, Severity } from "@/lib/types";

/**
 * Keyword classifier for Indian news headlines/summaries (English).
 *
 * Category: each category has a keyword list; the category with the most keyword hits
 * wins, ties broken by the order below (specific hazards before broad security/politics,
 * so "Flood kills 12 in Assam" is a flood, not security). No hits → "other".
 *
 * Severity: max of matched severity rules; falls back to 2 for any recognised category
 * and 1 for "other".
 */

const w = (words: string[]) => new RegExp(`\\b(?:${words.join("|")})\\b`, "gi");

const CATEGORY_RULES: [Category, RegExp][] = [
  ["earthquake", w(["earthquakes?", "quakes?", "tremors?", "aftershocks?", "seismic", "tsunami"])],
  ["cyclone", w(["cyclones?", "cyclonic", "landfall", "storm surge", "deep depression", "super cyclone"])],
  ["flood", w(["floods?", "flooding", "flooded", "flash floods?", "inundat(?:ed|ion)", "waterlogg(?:ed|ing)", "landslides?", "landslips?", "cloudbursts?", "deluge", "breach(?:ed)?", "embankments?", "dam (?:gates|overflow)"])],
  ["heat", w(["heatwaves?", "heat waves?", "heatstrokes?", "heat strokes?", "sunstroke", "scorching", "mercury (?:soars|touches|crosses)", "hottest"])],
  ["weather", w(["rains?", "rainfall", "downpours?", "thunderstorms?", "lightning", "hailstorms?", "monsoon", "cold waves?", "dense fog", "fog", "snowfall", "imd", "orange alert", "red alert", "yellow alert", "squalls?"])],
  ["wildfire", w(["forest fires?", "wildfires?", "fires?", "blaze", "gutted", "fire tenders"])],
  ["air", w(["aqi", "air quality", "air pollution", "pollution", "smog", "stubble burning", "pm2\\.5", "grap"])],
  ["health", w(["dengue", "malaria", "cholera", "outbreaks?", "virus(?:es)?", "nipah", "h1n1", "swine flu", "chikungunya", "hospitals?", "aiims", "vaccines?", "vaccination", "tuberculosis", "disease", "food poisoning", "doctors?", "health"])],
  ["civic", w(["potholes?", "garbage", "waste", "water supply", "water cuts?", "power cuts?", "outages?", "sewage", "encroachments?", "streetlights?", "civic bod(?:y|ies)", "municipal", "corporation", "bbmp", "gba", "bmc", "mcd", "ghmc", "drainage", "water shortage", "tankers?", "stray dogs?"])],
  ["infrastructure", w(["metro", "expressways?", "highways?", "flyovers?", "bridges?", "construction", "projects?", "inaugurat(?:es|ed|ion)", "foundation stone", "nhai", "smart city", "tunnels?", "dams?", "ports?", "railway lines?", "vande bharat", "bullet train"])],
  ["transport", w(["trains?", "railways?", "derail(?:s|ed|ment)", "flights?", "airlines?", "indigo", "air india", "airports?", "road accidents?", "accidents?", "bus(?:es)?", "traffic", "collisions?", "crash(?:ed)?"])],
  ["security", w(["killed", "murder(?:ed)?", "rape[ds]?", "arrested", "police", "terror(?:ists?|ism)?", "militants?", "maoists?", "naxal(?:s|ites?)?", "encounter", "blasts?", "attacks?", "attacked", "firing", "shot", "crime", "gangs?", "stampede", "ied", "infiltration", "army", "jawans?", "ceasefire", "clashes", "violence", "riots?", "lynch(?:ed|ing)", "fraud", "scam", "cyber ?crime", "kidnapp(?:ed|ing)", "abducted"])],
  ["economy", w(["gdp", "inflation", "rbi", "repo rate", "sensex", "nifty", "rupee", "gst", "tax(?:es)?", "budget", "exports?", "imports?", "prices?", "fuel", "petrol", "diesel", "jobs", "unemployment", "startups?", "ipo", "economy", "economic", "markets?", "trade", "tariffs?", "investment", "msp", "farmers?", "mandi"])],
  ["politics", w(["elections?", "polls?", "bjp", "congress", "aap", "tmc", "dmk", "aiadmk", "jd\\(u\\)", "rjd", "sp", "bsp", "shiv sena", "ncp", "ministers?", "cm", "chief minister", "lok sabha", "rajya sabha", "assembly", "parliament", "governor", "mlas?", "mps?", "opposition", "voters?", "voter list", "electoral rolls?", "campaign", "modi", "rahul gandhi", "supreme court", "high court", "bill", "cabinet", "pm"])],
];

/** Severity rules, checked against the whole text; highest matching level wins. */
const SEVERITY_RULES: [Severity, RegExp][] = [
  [5, /\b(?:dozens|scores|hundreds|thousands) (?:of people )?(?:(?:are|were|feared|reported) )?(?:dead|killed|die|died)\b/i],
  [5, /\b(?:massacre|mass casualt(?:y|ies)|catastroph(?:e|ic)|super cyclone|extremely severe cyclonic)\b/i],
  [5, /\bmagnitude[- ](?:[7-9])(?:\.\d)?\b/i],
  [5, /\bred alert\b/i],
  [4, /\b(?:killed|kills|dead|deaths?|death toll|fatalities|bodies|stampede|blast|terror attack|severe cyclonic|state of emergency|evacuat(?:e|ed|ion|ions)|rescue operations?|ndrf|sdrf|collapse[ds]?)\b/i],
  [4, /\bmagnitude[- ]6(?:\.\d)?\b/i],
  [4, /\b(?:orange alert|severe plus|grap stage (?:3|4|iii|iv))\b/i],
  [4, /\baqi\b[^.]{0,25}?\b[4-9]\d\d\b/i],
  [3, /\b(?:attacks?|attacked|clashes|injured|hurt|wounded|explosion|firing|encounter|cyclone|earthquake|outbreak|landslide|floods?|flooding|cloudburst|heatwave|derail(?:s|ed|ment)|missing|stranded|riots?|violence)\b/i],
  [2, /\b(?:protests?|warning|yellow alert|alert|crisis|tensions?|strike|bandh|shortage|power cut|waterlogging|potholes?)\b/i],
];

/**
 * Hindi (Devanagari) keywords for Hindi-language feeds (PIB, BBC Hindi). JS word boundaries
 * don't work on Devanagari, so these are plain substring matches; first matching rule wins.
 */
const HINDI_RULES: [Category, RegExp][] = [
  ["earthquake", /भूकंप|सुनामी/],
  ["cyclone", /चक्रवात|तूफ़ान|तूफान/],
  ["flood", /बाढ़|भूस्खलन|बादल फटा|जलभराव/],
  ["heat", /लू |हीटवेव|भीषण गर्मी/],
  ["weather", /बारिश|वर्षा|आकाशीय बिजली|वज्रपात|मानसून|कोहरा|शीतलहर|मौसम/],
  ["air", /प्रदूषण|वायु गुणवत्ता|एक्यूआई|AQI/],
  ["health", /स्वास्थ्य|डेंगू|मलेरिया|अस्पताल|टीका|बीमारी/],
  ["security", /हत्या|गिरफ्तार|पुलिस|आतंक|नक्सली|मुठभेड़|हमला|दुष्कर्म|हिंसा/],
  ["transport", /रेल|ट्रेन|उड़ान|हादसा|दुर्घटना|सड़क हादसा/],
  ["infrastructure", /परियोजना|शिलान्यास|उद्घाटन|मेट्रो|राजमार्ग|एक्सप्रेसवे|पुल/],
  ["economy", /अर्थव्यवस्था|जीडीपी|महंगाई|आरबीआई|बाज़ार|बाजार|निर्यात|किसान|व्यापार|जीएसटी/],
  ["sports", /खेल|क्रिकेट|ओलंपिक|एशियाई खेल|पदक/],
  ["politics", /चुनाव|मंत्री|प्रधानमंत्री|संसद|लोकसभा|राज्यसभा|विधानसभा|मुख्यमंत्री|राष्ट्रपति|सरकार/],
];

/** Category for Hindi text; severity 2 when recognised (we don't parse Hindi casualty counts). */
export function classifyHindi(text: string | null | undefined): Classification {
  const t = text ?? "";
  for (const [category, re] of HINDI_RULES) if (re.test(t)) return { category, severity: 2 };
  return { category: "other", severity: 1 };
}

export interface Classification {
  category: Category;
  severity: Severity;
}

function countKilled(text: string): number {
  let max = 0;
  for (const m of text.matchAll(/\b(\d{1,3}(?:,\d{3})*|\d+)\s+(?:people\s+|persons\s+|civilians\s+|jawans\s+|others\s+)?(?:(?:are|were|have been|feared)\s+)?(?:killed|dead|die|died)\b/gi)) {
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
