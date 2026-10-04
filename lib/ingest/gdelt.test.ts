import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  categorize,
  isNewsworthyTitle,
  decodeEntities,
  GDELT_LASTUPDATE_URL,
  gdeltIngester,
  MAX_EVENTS,
  parseEventRow,
  parseGdeltDate,
  parseGkgTitles,
  parseLastUpdate,
  passesNoiseGate,
  toGcsUrl,
  unzipSingle,
  type GdeltRaw,
} from "./gdelt";

/*
 * Fixtures (trimmed from the real 2026-10-04 15:15 / 16:15 UTC GDELT windows):
 * - gdelt.export.tsv: 42 export rows — 30 real conflict/protest rows for 17 articles, 4 rows
 *   with ignored CAMEO roots, plus synthetic edge cases on example.com (missing title, bad /
 *   missing lat, truncated row, ftp url, single-mention row, flood-protest in Australia,
 *   future-dated riot in Austria).
 * - gdelt.gkg.tsv: matching GKG rows reduced to their first five columns + the PAGE_TITLE
 *   extra (real rows are ~10 KB each), a few unrelated docs and one without a PAGE_TITLE.
 * - gdelt.lastupdate.txt: a real lastupdate.txt.
 * - gdelt.sample.zip: a tiny Info-ZIP deflate archive of five TSV lines.
 */
const fixturePath = (name: string) => join(__dirname, "__fixtures__", name);
const fixture = (name: string) => readFileSync(fixturePath(name), "utf8");
const raw: GdeltRaw = { events: fixture("gdelt.export.tsv"), gkg: fixture("gdelt.gkg.tsv") };
const exportLines = raw.events.split("\n").filter(Boolean);

const NOW = new Date("2026-10-04T16:20:00Z");

/** Minimal single-entry zip (local header + data only), like GDELT's. */
function makeZip(text: string, { method = 8, flags = 0 } = {}): Buffer {
  const name = Buffer.from("x.CSV");
  const body = Buffer.from(text, "utf8");
  const data = method === 8 ? deflateRawSync(body) : body;
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0);
  h.writeUInt16LE(20, 4);
  h.writeUInt16LE(flags, 6);
  h.writeUInt16LE(method, 8);
  h.writeUInt32LE(data.length, 18);
  h.writeUInt32LE(body.length, 22);
  h.writeUInt16LE(name.length, 26);
  h.writeUInt16LE(0, 28);
  return Buffer.concat([h, name, data]);
}

describe("unzipSingle", () => {
  it("inflates a real single-entry deflate zip", () => {
    const text = unzipSingle(readFileSync(fixturePath("gdelt.sample.zip")));
    expect(text.split("\n").filter(Boolean)).toEqual([
      "1\talpha\tcafé",
      "2\tbeta\tcafé",
      "3\tgamma\tcafé",
      "4\tdelta\tcafé",
      "5\tepsilon\tcafé",
    ]);
  });

  it("round-trips a generated zip", () => {
    expect(unzipSingle(makeZip("a\tb\nc\td\n"))).toBe("a\tb\nc\td\n");
  });

  it("rejects things it cannot handle", () => {
    expect(() => unzipSingle(Buffer.from("not a zip at all, definitely not one"))).toThrow("not a zip");
    expect(() => unzipSingle(makeZip("x", { method: 0 }))).toThrow("compression method 0");
    expect(() => unzipSingle(makeZip("x", { flags: 0x0008 }))).toThrow("data descriptor");
    expect(() => unzipSingle(makeZip("hello world").subarray(0, 36))).toThrow("truncated");
  });
});

describe("parseLastUpdate / toGcsUrl", () => {
  it("picks the export and GKG zips and rewrites them to the GCS mirror", () => {
    expect(parseLastUpdate(fixture("gdelt.lastupdate.txt"))).toEqual({
      exportUrl: "https://storage.googleapis.com/data.gdeltproject.org/gdeltv2/20261004161500.export.CSV.zip",
      gkgUrl: "https://storage.googleapis.com/data.gdeltproject.org/gdeltv2/20261004161500.gkg.csv.zip",
    });
  });

  it("rewrites http and https origins, leaves others alone", () => {
    expect(toGcsUrl("https://data.gdeltproject.org/gdeltv2/x.zip")).toBe(
      "https://storage.googleapis.com/data.gdeltproject.org/gdeltv2/x.zip",
    );
    expect(toGcsUrl("https://example.com/gdeltv2/x.zip")).toBe("https://example.com/gdeltv2/x.zip");
  });

  it("throws when a file is missing", () => {
    expect(() => parseLastUpdate("")).toThrow("not found");
    expect(() => parseLastUpdate("1 abc http://data.gdeltproject.org/gdeltv2/1.export.CSV.zip")).toThrow("not found");
  });
});

describe("parsing helpers", () => {
  it("parseGdeltDate parses DATEADDED as UTC and rejects junk", () => {
    expect(parseGdeltDate("20261004161500")).toBe("2026-10-04T16:15:00.000Z");
    expect(parseGdeltDate("20261304161500")).toBeNull();
    expect(parseGdeltDate("20261004256000")).toBeNull();
    expect(parseGdeltDate("2026-10-04")).toBeNull();
  });

  it("decodeEntities handles numeric and basic named entities", () => {
    expect(decodeEntities("A &#x2013; B &#39;c&#39; &amp; &quot;d&quot; &#xA3;5 &bogus;")).toBe(
      "A – B 'c' & \"d\" £5 &bogus;",
    );
  });

  it("parseGkgTitles joins DocumentIdentifier → decoded PAGE_TITLE", () => {
    const titles = parseGkgTitles(raw.gkg);
    expect(titles.get("https://www.mirror.co.uk/news/uk-news/landlord-fined-hackney-council-property-37733379")).toBe(
      "Rogue landlord fined £30,000 by Hackney Council after leaving tenants at risk in unsafe home",
    );
    // Row without a PAGE_TITLE extra is skipped.
    expect(titles.has("https://salinapost.com/posts/e01beaa8-ef8a-4283-b510-76784cf95827")).toBe(false);
    expect(titles.size).toBe(26);

    const only = parseGkgTitles(raw.gkg, new Set(["https://example.com/bad-lat"]));
    expect([...only]).toEqual([["https://example.com/bad-lat", "Bad latitude row"]]);
  });

  it("parseEventRow validates shape, root code, coordinates and url", () => {
    const byUrl = (u: string) => exportLines.find((l) => l.endsWith(u))!;
    expect(parseEventRow(byUrl("https://example.com/flood-protest"))).toMatchObject({
      rootCode: "14",
      eventCode: "141",
      geoCountry: "AS",
      lat: -33.8833,
      lng: 151.217,
      numMentions: 4,
      numSources: 1,
      numArticles: 4,
      geoType: 4,
    });
    expect(parseEventRow(byUrl("https://example.com/bad-lat"))).toBeNull();
    expect(parseEventRow(byUrl("https://example.com/no-geo"))).toBeNull();
    expect(parseEventRow(byUrl("ftp://example.com/not-http"))).toBeNull();
    expect(parseEventRow(byUrl("prince-harrys-uk-life-laid-153800000.html"))).toBeNull(); // root 04
    expect(parseEventRow(exportLines.find((l) => l.split("\t").length < 61)!)).toBeNull();
    expect(parseEventRow("")).toBeNull();
  });
});

describe("passesNoiseGate", () => {
  const row = { rootCode: "19", geoType: 4, numSources: 1, numArticles: 5 };
  it("needs at least two articles or two sources", () => {
    expect(passesNoiseGate(row)).toBe(true);
    expect(passesNoiseGate({ ...row, numArticles: 1 })).toBe(false);
    expect(passesNoiseGate({ ...row, numArticles: 1, numSources: 2 })).toBe(true);
  });
  it("requires a second outlet for root 17 (coerce) and US state/city geocodes", () => {
    expect(passesNoiseGate({ ...row, rootCode: "17" })).toBe(false);
    expect(passesNoiseGate({ ...row, rootCode: "17", numSources: 2 })).toBe(true);
    expect(passesNoiseGate({ ...row, geoType: 3 })).toBe(false);
    expect(passesNoiseGate({ ...row, geoType: 2 })).toBe(false);
    expect(passesNoiseGate({ ...row, geoType: 2, numSources: 2 })).toBe(true);
    expect(passesNoiseGate({ ...row, geoType: 1 })).toBe(true); // country-level US is fine
  });
});

describe("categorize", () => {
  it("maps CAMEO roots to conflict/politics with root-based severity floors", () => {
    expect(categorize("20", "Something happened")).toEqual({ category: "conflict", severity: 5 });
    expect(categorize("19", "Something happened")).toEqual({ category: "conflict", severity: 4 });
    expect(categorize("18", "Something happened")).toEqual({ category: "conflict", severity: 3 });
    expect(categorize("17", "Something happened")).toEqual({ category: "conflict", severity: 3 });
    expect(categorize("14", "Something happened")).toEqual({ category: "politics", severity: 2 });
  });

  it("keeps classify's specific hazard/health category and higher severity", () => {
    expect(categorize("14", "Flash floods spark protests")).toEqual({ category: "flood", severity: 3 });
    expect(categorize("18", "Cholera outbreak in camp")).toMatchObject({ category: "health" });
    expect(categorize("14", "Protest after dozens killed in market bombing")).toEqual({
      category: "politics",
      severity: 5,
    });
    // Broad classify categories (economy/conflict/other) never override the root.
    expect(categorize("14", "Tariffs and inflation hit markets")).toMatchObject({ category: "politics" });
  });
});

describe("gdeltIngester.normalize", () => {
  beforeAll(() => {
    vi.useFakeTimers({ now: NOW });
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  const run = () => gdeltIngester.normalize(raw);

  it("keeps one event per qualifying article, strongest first", () => {
    expect(run().map((e) => e.title)).toEqual([
      "Ukraine Invasion Day 1,683: RU further disrupts UKR's economy and civilian life.",
      "Palestinian factions condemn latest zionist massacre in Gaza City - Islamic Invitation Turkey",
      "Israel's IOF Continue Attacks on Palestinians",
      "Yemeni armed forces strike Saudi Aramco oil facilities in Riyadh: Spokesman",
      "2 killed, dozens injured at Vienna, Georgia, block party shooting",
      "Lukashenko pledges unconditional loyalty to Putin as Belarus to 'mobilise troops' to Ukraine - London Business News",
      "Police 'locate' camp where abducted NYSC members are held, say IED threat delaying rescue - Latest News In Nigeria, Nigeria News Today, Your Online Nigerian Newspaper",
      "Riot-hit France closes up to 500 schools amid fears of fresh violence",
      "Flash floods spark protests over slow relief in Sydney",
      'Police and protesters clash in Vienna & Graz – "night of anger"',
      "Pro-Palestine protesters bring traffic to standstill at Londons Oxford Circus",
    ]);
  });

  it("drops noise and invalid rows", () => {
    const urls = new Set(run().map((e) => e.url));
    const dropped = [
      "https://www.kait8.com/2026/10/03/man-found-guilty-burglary-connection-with-july-2022-break-in-pemiscot-co-home/", // root 17, US state
      "https://www.nbcchicago.com/news/local/2-men-shot-following-altercation-with-off-duty-chicago-police-officer/3997486/", // US city
      "https://www.mirror.co.uk/news/uk-news/landlord-fined-hackney-council-property-37733379", // root 17
      "https://en.antaranews.com/news/434089/indonesian-police-arrest-12-suspected-terrorists-across-six-provinces", // root 17
      "https://www.thehindu.com/news/national/manipur/kuki-man-found-dead-a-day-after-abduction-in-manipur/article71543865.ece", // no geo
      "https://www.express.co.uk/news/royal/2254374/prince-harrys-uk-life-laid", // root 04
      "https://example.com/no-title",
      "https://example.com/bad-lat",
      "https://example.com/no-geo",
      "ftp://example.com/not-http",
      "https://example.com/single-mention",
    ];
    for (const u of dropped) expect(urls.has(u), u).toBe(false);
  });

  it("maps fields from the most-mentioned row of each article", () => {
    const ukraine = run()[0];
    expect(ukraine).toEqual({
      source: "gdelt",
      external_id: "https://www.dailykos.com/stories/2026/10/3/800107349/community/1684/",
      url: "https://www.dailykos.com/stories/2026/10/3/800107349/community/1684/",
      title: "Ukraine Invasion Day 1,683: RU further disrupts UKR's economy and civilian life.",
      summary: "Karpivka, Krym, Avtonomna Respublika, Ukraine · 1 source",
      category: "conflict",
      severity: 5, // "invasion" in the title beats the root-19 floor of 4
      lat: 45.5244,
      lng: 34.0801,
      country: "UA",
      occurred_at: "2026-10-04T16:15:00.000Z",
      raw: {
        globalEventId: "1326260488",
        eventCode: "190",
        rootCode: "19",
        quadClass: 4,
        goldstein: -10,
        isRootEvent: false,
        numMentions: 8,
        numSources: 1,
        numArticles: 8,
        geoType: 4,
        geoFullName: "Karpivka, Krym, Avtonomna Respublika, Ukraine",
        geoCountryFips: "UP",
        dateAdded: "20261004161500",
      },
    });
  });

  it("converts FIPS country codes to ISO", () => {
    const byTitle = (s: string) => run().find((e) => e.title.startsWith(s))!;
    expect(byTitle("Flash floods").country).toBe("AU"); // FIPS AS
    expect(byTitle("Police and protesters clash in Vienna").country).toBe("AT"); // FIPS AU
    expect(byTitle("Yemeni armed forces").country).toBe("YE"); // FIPS YM
    expect(byTitle("Police 'locate'").country).toBe("NG"); // FIPS NI
    expect(byTitle("Israel's IOF").country).toBe("IL"); // FIPS IS
    expect(byTitle("2 killed, dozens injured").country).toBe("US");
  });

  it("assigns categories and severities", () => {
    const byTitle = (s: string) => run().find((e) => e.title.startsWith(s))!;
    expect(byTitle("Palestinian factions")).toMatchObject({ category: "conflict", severity: 5 }); // root 20
    expect(byTitle("Yemeni armed forces")).toMatchObject({ category: "conflict", severity: 4 });
    expect(byTitle("Riot-hit France")).toMatchObject({ category: "politics", severity: 3 });
    expect(byTitle("Pro-Palestine")).toMatchObject({ category: "politics", severity: 2 });
    expect(byTitle("Flash floods")).toMatchObject({ category: "flood", severity: 3 });
    expect(byTitle("Police and protesters")).toMatchObject({ summary: "Vienna, Wien, Austria · 1 source" });
    expect(byTitle("2 killed, dozens injured")).toMatchObject({ summary: "Georgia, United States · 2 sources" });
  });

  it("clamps future DATEADDED to now", () => {
    const riot = run().find((e) => e.url === "https://example.com/vienna-riot")!;
    expect(riot.occurred_at).toBe(NOW.toISOString());
  });

  it("dedupes by url and by identical title", () => {
    const events = run();
    expect(new Set(events.map((e) => e.external_id)).size).toBe(events.length);

    const yemen = exportLines.find((l) => l.endsWith("Yemen-Saud-Aramco-Saree-"))!.split("\t");
    yemen[60] = "https://syndicated.example.com/aramco";
    const gkgCopy = `x\t20261004161500\t1\tsyndicated.example.com\thttps://syndicated.example.com/aramco${"\t".repeat(22)}<PAGE_TITLE>Yemeni armed forces strike Saudi Aramco oil facilities in Riyadh: Spokesman</PAGE_TITLE>`;
    const withCopy = gdeltIngester.normalize({ events: `${raw.events}${yemen.join("\t")}\n`, gkg: `${raw.gkg}${gkgCopy}\n` });
    expect(withCopy).toHaveLength(events.length);
    expect(withCopy.filter((e) => e.title.startsWith("Yemeni armed forces"))[0].url).toBe(
      "https://www.presstv.co.uk/Detail/2026/10/04/777604/Yemen-Saud-Aramco-Saree-",
    );
  });

  it(`caps output at ${MAX_EVENTS} events`, () => {
    const base = exportLines.find((l) => l.endsWith("https://example.com/flood-protest"))!.split("\t");
    const events: string[] = [];
    const gkg: string[] = [];
    for (let i = 0; i < MAX_EVENTS + 50; i++) {
      const cols = [...base];
      cols[60] = `https://example.com/bulk/${i}`;
      events.push(cols.join("\t"));
      gkg.push(`x\t1\t1\texample.com\thttps://example.com/bulk/${i}${"\t".repeat(22)}<PAGE_TITLE>Protest number ${i}</PAGE_TITLE>`);
    }
    expect(gdeltIngester.normalize({ events: events.join("\n"), gkg: gkg.join("\n") })).toHaveLength(MAX_EVENTS);
  });

  it("tolerates garbage input", () => {
    expect(gdeltIngester.normalize({ events: "", gkg: "" })).toEqual([]);
    expect(gdeltIngester.normalize({ events: "a\tb\nc", gkg: "nope" })).toEqual([]);
    expect(gdeltIngester.normalize(null as unknown as GdeltRaw)).toEqual([]);
    expect(gdeltIngester.normalize({ events: raw.events, gkg: "" })).toEqual([]); // no titles → nothing
  });
});

describe("gdeltIngester.fetchRaw", () => {
  afterEach(() => vi.unstubAllGlobals());

  const EXPORT_URL = "https://storage.googleapis.com/data.gdeltproject.org/gdeltv2/20261004161500.export.CSV.zip";
  const GKG_URL = "https://storage.googleapis.com/data.gdeltproject.org/gdeltv2/20261004161500.gkg.csv.zip";

  const stub = (overrides: Record<string, () => Response> = {}) => {
    const routes: Record<string, () => Response> = {
      [GDELT_LASTUPDATE_URL]: () => new Response(fixture("gdelt.lastupdate.txt")),
      [EXPORT_URL]: () => new Response(new Uint8Array(makeZip(raw.events))),
      [GKG_URL]: () => new Response(new Uint8Array(makeZip(raw.gkg))),
      ...overrides,
    };
    const f = vi.fn(async (input: string | URL | Request) => {
      const route = routes[String(input)];
      return route ? route() : new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", f);
    return f;
  };

  it("downloads lastupdate, then the export + GKG zips from the GCS mirror", async () => {
    const f = stub();
    await expect(gdeltIngester.fetchRaw()).resolves.toEqual(raw);
    expect(f.mock.calls.map((c) => String(c[0]))).toEqual([GDELT_LASTUPDATE_URL, EXPORT_URL, GKG_URL]);
  });

  it("throws on non-2xx instead of soft-failing", async () => {
    stub({ [GDELT_LASTUPDATE_URL]: () => new Response("nope", { status: 503 }) });
    await expect(gdeltIngester.fetchRaw()).rejects.toThrow("GDELT lastupdate HTTP 503");

    stub({ [EXPORT_URL]: () => new Response("nope", { status: 500 }) });
    await expect(gdeltIngester.fetchRaw()).rejects.toThrow("GDELT export HTTP 500");

    stub({ [GKG_URL]: () => new Response("slow down", { status: 429 }) });
    await expect(gdeltIngester.fetchRaw()).rejects.toThrow("GDELT GKG HTTP 429");
  });

  it("throws on an unparseable lastupdate or a corrupt zip", async () => {
    stub({ [GDELT_LASTUPDATE_URL]: () => new Response("<html>oops</html>") });
    await expect(gdeltIngester.fetchRaw()).rejects.toThrow("not found");

    stub({ [GKG_URL]: () => new Response("PK but not really") });
    await expect(gdeltIngester.fetchRaw()).rejects.toThrow("unzip");
  });
});

describe("isNewsworthyTitle", () => {
  it("drops headlines with no recognisable news keyword", () => {
    expect(isNewsworthyTitle("10 Best Far Side Comics About Crime")).toBe(false);
    expect(isNewsworthyTitle("UA&P: Ube sector must improve planting materials, productivity")).toBe(false);
  });
  it("keeps conflict/politics/hazard headlines", () => {
    expect(isNewsworthyTitle("Airstrike kills 12 in northern Gaza")).toBe(true);
    expect(isNewsworthyTitle("Thousands protest election results in capital")).toBe(true);
  });
});
