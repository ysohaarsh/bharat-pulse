import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanTitle,
  decodeEntities,
  MAX_ITEMS_PER_FEED,
  parseFeedDate,
  parseRss,
  RSS_FEEDS,
  rssIngester,
  toSummary,
  type RssFeedRaw,
} from "./rss";

const fixture = (name: string) => readFileSync(join(__dirname, "__fixtures__", name), "utf8");

const FEEDS: RssFeedRaw[] = [
  { feed: "bbc", xml: fixture("rss.bbc.xml") },
  { feed: "aljazeera", xml: fixture("rss.aljazeera.xml") },
  { feed: "npr", xml: fixture("rss.npr.xml") },
  { feed: "guardian", xml: fixture("rss.guardian.xml") },
];

const EDGE_XML = `<?xml version="1.0"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/"><channel>
  <title>Edge cases</title>
  <atom:link href="https://example.com/feed" rel="self"/>
  <item>
    <title><![CDATA[Floods & landslides kill 12 in Nepal <live>]]></title>
    <media:title>ignore me</media:title>
    <link>https://example.com/a?x=1&amp;y=2</link>
    <description>&lt;p&gt;Rescuers search for &lt;b&gt;missing&lt;/b&gt; villagers &amp;amp; livestock.&lt;/p&gt;</description>
    <pubDate>Sun, 04 Oct 2026 08:00:00 GMT</pubDate>
  </item>
  <item>
    <title>Tom &amp; Jerry&#8217;s &#x201C;art&#x201D; show opens</title>
    <link>https://example.com/b</link>
    <guid isPermaLink="false">b-guid</guid>
    <pubDate>not a date</pubDate>
  </item>
  <item>
    <link>https://example.com/no-title</link>
    <pubDate>Sun, 04 Oct 2026 08:00:00 GMT</pubDate>
  </item>
  <item>
    <title>Duplicate of first</title>
    <link>https://example.com/a?x=1&amp;y=2</link>
    <pubDate>Sun, 04 Oct 2026 09:00:00 GMT</pubDate>
  </item>
  <item>
    <title>Scientists unveil a faster battery</title>
    <guid>c-guid</guid>
    <pubDate>Sun, 04 Oct 2026 07:00:00 +0200</pubDate>
  </item>
</channel></rss>`;

describe("decodeEntities", () => {
  it("decodes named and numeric entities", () => {
    expect(decodeEntities("a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39; &#8211; &#x2019; &nbsp;")).toBe(
      "a & b <c> \"d\" 'e' – ’  ",
    );
    expect(decodeEntities("&unknown; stays")).toBe("&unknown; stays");
  });
});

describe("parseRss", () => {
  const items = parseRss(EDGE_XML);

  it("finds every <item>", () => {
    expect(items).toHaveLength(5);
  });

  it("keeps CDATA verbatim and decodes entities outside CDATA", () => {
    expect(items[0].title).toBe("Floods & landslides kill 12 in Nepal <live>");
    expect(items[0].link).toBe("https://example.com/a?x=1&y=2");
    expect(items[1].title).toBe("Tom & Jerry’s “art” show opens");
  });

  it("does not confuse namespaced tags", () => {
    expect(items[0].title).not.toBe("ignore me");
    expect(parseRss(EDGE_XML).some((i) => i.link === "https://example.com/feed")).toBe(false);
  });

  it("returns null for missing fields", () => {
    expect(items[0].guid).toBeNull();
    expect(items[2].title).toBeNull();
    expect(items[4].link).toBeNull();
  });

  it("parses real feeds", () => {
    const bbc = parseRss(fixture("rss.bbc.xml"));
    expect(bbc).toHaveLength(3);
    expect(bbc[0]).toMatchObject({
      title: "Kyiv bridge hit in further Russian drone attack as German chancellor makes surprise visit",
      link: "https://www.bbc.co.uk/news/articles/ckreyjzzzywqo?at_medium=RSS&at_campaign=rss",
      guid: "https://www.bbc.co.uk/news/articles/ckreyjzzzywqo#0",
      pubDate: "Sun, 04 Oct 2026 11:25:35 GMT",
    });
  });
});

describe("toSummary", () => {
  it("strips HTML, collapses whitespace and drops 'Continue reading'", () => {
    expect(toSummary('<p>Hello <b>world</b></p>\n<p>Again</p> <a href="x">Continue reading...</a>')).toBe(
      "Hello world Again",
    );
  });
  it("truncates on a word boundary with an ellipsis", () => {
    const s = toSummary("word ".repeat(100))!;
    expect(s.length).toBeLessThanOrEqual(280);
    expect(s.endsWith("word…")).toBe(true);
  });
  it("returns null for empty input", () => {
    expect(toSummary(null)).toBeNull();
    expect(toSummary("<p> </p>")).toBeNull();
  });
});

describe("rssIngester.normalize", () => {
  it("normalizes edge-case items: skips bad date/no title, dedupes, keeps no-country items", () => {
    const events = rssIngester.normalize([{ feed: "edge", xml: EDGE_XML }]);
    // Non-URL guids are namespaced by feed.
    expect(events.map((e) => e.external_id)).toEqual(["https://example.com/a?x=1&y=2", "edge:c-guid"]);

    expect(events[0]).toMatchObject({
      source: "rss",
      title: "Floods & landslides kill 12 in Nepal <live>",
      summary: "Rescuers search for missing villagers & livestock.",
      category: "flood",
      severity: 4,
      country: "NP",
      url: "https://example.com/a?x=1&y=2",
      occurred_at: "2026-10-04T08:00:00.000Z",
    });
    expect(events[1]).toMatchObject({
      external_id: "edge:c-guid",
      url: null,
      summary: null,
      country: null,
      lat: null,
      lng: null,
      category: "other",
      severity: 1,
      occurred_at: "2026-10-04T05:00:00.000Z",
    });
  });

  it("normalizes the real feed fixtures", () => {
    const events = rssIngester.normalize(FEEDS);
    expect(events).toHaveLength(10);

    const kyiv = events.find((e) => e.title.startsWith("Kyiv bridge"))!;
    expect(kyiv).toMatchObject({ country: "UA", category: "conflict", lat: 50.45, lng: 30.52 });
    expect(kyiv.raw).toMatchObject({ feed: "bbc" });

    const tigray = events.find((e) => e.title.startsWith("Ethiopian"))!;
    expect(tigray).toMatchObject({ country: "ET", category: "conflict" });

    const brazil = events.find((e) => e.title.startsWith("Brazil votes"))!;
    expect(brazil).toMatchObject({ country: "BR", category: "politics", severity: 2 });

    const libya = events.find((e) => e.title.startsWith("Libyan unity"))!;
    expect(libya.country).toBe("LY");
    expect(libya.summary!.length).toBeLessThanOrEqual(280);
    expect(libya.summary).not.toMatch(/<|&lt;|&amp;/);

    for (const e of events) {
      expect(Number.isNaN(Date.parse(e.occurred_at))).toBe(false);
      expect(e.severity).toBeGreaterThanOrEqual(1);
      expect(e.severity).toBeLessThanOrEqual(5);
    }
  });

  it("ignores malformed raw input", () => {
    expect(rssIngester.normalize([])).toEqual([]);
    expect(rssIngester.normalize([{ feed: "x" } as unknown as RssFeedRaw])).toEqual([]);
    expect(rssIngester.normalize(null as unknown as RssFeedRaw[])).toEqual([]);
  });
});

describe("rssIngester.fetchRaw", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fetches all feeds in parallel and drops failing ones", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("bbci")) return new Response(fixture("rss.bbc.xml"), { status: 200 });
        if (url.includes("npr")) return new Response("nope", { status: 503 });
        if (url.includes("guardian")) throw new Error("network down");
        if (url.includes("apnews")) return new Response("rate limited", { status: 429 });
        return new Response(fixture("rss.aljazeera.xml"), { status: 200 });
      }),
    );
    const raw = await rssIngester.fetchRaw();
    expect(raw.map((r) => r.feed)).toEqual(["bbc", "aljazeera", "dw", "france24", "crisisgroup", "reuters"]);
    expect(RSS_FEEDS).toHaveLength(9);
  });

  it("configures every feed over https with a unique name", () => {
    expect(new Set(RSS_FEEDS.map((f) => f.feed)).size).toBe(RSS_FEEDS.length);
    for (const f of RSS_FEEDS) expect(f.url.startsWith("https://")).toBe(true);
  });
});

describe("parseFeedDate", () => {
  it("parses RFC 822 and Crisis Group's Drupal format (as UTC)", () => {
    expect(new Date(parseFeedDate("Sun, 4 Oct 2026 14:24:00 GMT")).toISOString()).toBe("2026-10-04T14:24:00.000Z");
    expect(new Date(parseFeedDate("Friday, September 25, 2026 - 15:56")).toISOString()).toBe(
      "2026-09-25T15:56:00.000Z",
    );
    expect(parseFeedDate("not a date")).toBeNaN();
  });
});

describe("cleanTitle", () => {
  it("strips the Google News publisher suffix", () => {
    expect(cleanTitle("Quake hits Japan - Reuters", "Reuters", true)).toBe("Quake hits Japan");
    expect(cleanTitle("Quake hits Japan - AP News", "AP News", true)).toBe("Quake hits Japan");
    // No <source>: Google News feeds still drop the last " - X" segment.
    expect(cleanTitle("Kyiv - a city under fire - AP News", null, true)).toBe("Kyiv - a city under fire");
  });
  it("leaves other titles alone", () => {
    expect(cleanTitle("Kyiv - a city under fire", null)).toBe("Kyiv - a city under fire");
    expect(cleanTitle("Reuters", "Reuters", true)).toBe("Reuters");
  });
});

describe("new feeds", () => {
  const norm = (feed: string, file: string) => rssIngester.normalize([{ feed, xml: fixture(file) }]);

  it("parses DW (opaque numeric guids are namespaced)", () => {
    const events = norm("dw", "rss.dw.xml");
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({
      external_id: "dw:79534734",
      title: "Germany's Merz visits Kyiv as Russia strikes bridge",
      url: "https://www.dw.com/en/germany-s-merz-visits-kyiv-as-russia-strikes-bridge/a-79534734?maca=en-rss-en-all-1573-xml-mrss",
      occurred_at: "2026-10-04T14:24:00.000Z",
    });
    expect(events[0].summary).toMatch(/^As air raid sirens sounded in Kyiv/);
    const spain = events.find((e) => e.title.startsWith("Torrential rain"))!;
    expect(spain).toMatchObject({ country: "ES", category: "flood" });
  });

  it("parses France 24", () => {
    const events = norm("france24", "rss.france24.xml");
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      external_id: "france24:ff58f06e-bffe-11f1-a9b4-214dbeca3573",
      title: 'German Chancellor in Kyiv: "Ukraine will need our support"',
      country: "UA",
      occurred_at: "2026-10-04T14:37:56.000Z",
    });
    expect(events[0].summary).toMatch(/^German Chancellor Friedrich Merz visited Ukraine/);
  });

  it("parses Crisis Group: Drupal dates, drops non-English editions", () => {
    const events = norm("crisisgroup", "rss.crisisgroup.xml");
    expect(events.map((e) => e.title)).toEqual([
      "Updates from the UN General Assembly 2026",
      "Arresting the Dangerous Descent Back into War in Northern Ethiopia",
    ]);
    expect(events[0]).toMatchObject({ external_id: "crisisgroup:28555", occurred_at: "2026-09-25T15:56:00.000Z" });
    expect(events[1]).toMatchObject({ country: "ET", category: "conflict" });
    expect(events.every((e) => !e.url!.includes("/fr/"))).toBe(true);
  });

  it("parses Google News feeds: clean titles, no echo summary, redirect links, newest first", () => {
    const reuters = norm("reuters", "rss.googlenews-reuters.xml");
    expect(reuters.map((e) => e.title)).toEqual([
      "EXCLUSIVE: Saudi Arabia quietly shelving NEOM Stadium, one of 2034 World Cup venues",
      "Trump names intelligence chief Clayton as AI czar, to head task force",
      "AI's race to transform the world before the money runs out",
    ]);
    expect(reuters[0]).toMatchObject({ summary: null, country: "SA", occurred_at: "2026-10-04T08:03:13.000Z" });
    for (const e of reuters) {
      expect(e.external_id).toMatch(/^reuters:CBMi/);
      expect(e.url).toMatch(/^https:\/\/news\.google\.com\/rss\/articles\//);
      expect(e.title).not.toMatch(/ - Reuters$/);
    }

    const ap = norm("ap", "rss.googlenews-ap.xml");
    expect(ap.map((e) => e.title)).toEqual([
      "Daily life around the world, in photos",
      "Heat-trapping gas once frozen in Arctic ground is slowly leaking and warming the planet",
    ]);
    expect(ap.every((e) => e.summary === null && e.external_id.startsWith("ap:"))).toBe(true);
  });

  it(`caps each feed to its newest ${MAX_ITEMS_PER_FEED} items`, () => {
    const items = Array.from(
      { length: 40 },
      (_, i) =>
        `<item><title>Story ${i}</title><link>https://example.com/${i}</link>` +
        `<pubDate>${new Date(Date.UTC(2026, 9, 1, i)).toUTCString()}</pubDate></item>`,
    ).join("");
    const big = `<rss><channel>${items}</channel></rss>`;
    const small = `<rss><channel><item><title>Other</title><link>https://example.org/x</link><pubDate>Sun, 04 Oct 2026 08:00:00 GMT</pubDate></item></channel></rss>`;
    const events = rssIngester.normalize([
      { feed: "big", xml: big },
      { feed: "small", xml: small },
    ]);
    const fromBig = events.filter((e) => e.external_id.startsWith("https://example.com/"));
    expect(fromBig).toHaveLength(MAX_ITEMS_PER_FEED);
    expect(fromBig[0].title).toBe("Story 39");
    expect(fromBig.at(-1)!.title).toBe(`Story ${40 - MAX_ITEMS_PER_FEED}`);
    expect(events.at(-1)!.title).toBe("Other");
  });

  it("dedupes URL guids across feeds (first feed wins) and drops non-http links", () => {
    const a = `<rss><channel><item><title>Shared story</title><guid>https://example.com/shared</guid><link>https://example.com/shared</link><pubDate>Sun, 04 Oct 2026 08:00:00 GMT</pubDate></item></channel></rss>`;
    const b = `<rss><channel>
      <item><title>Shared story again</title><guid>https://example.com/shared</guid><pubDate>Sun, 04 Oct 2026 09:00:00 GMT</pubDate></item>
      <item><title>Same opaque id</title><guid>123</guid><pubDate>Sun, 04 Oct 2026 09:00:00 GMT</pubDate></item>
      <item><title>Script link</title><guid>456</guid><link>javascript:alert(1)</link><pubDate>Sun, 04 Oct 2026 09:00:00 GMT</pubDate></item>
    </channel></rss>`;
    const c = `<rss><channel><item><title>Different feed, same opaque id</title><guid>123</guid><pubDate>Sun, 04 Oct 2026 09:00:00 GMT</pubDate></item></channel></rss>`;
    const events = rssIngester.normalize([
      { feed: "a", xml: a },
      { feed: "b", xml: b },
      { feed: "c", xml: c },
    ]);
    expect(events.map((e) => e.external_id)).toEqual(["https://example.com/shared", "b:123", "b:456", "c:123"]);
    expect(events[0].title).toBe("Shared story");
    expect(events.find((e) => e.external_id === "b:456")!.url).toBeNull();
  });

  it("keeps all fixtures together within the per-feed cap and unique", () => {
    const events = rssIngester.normalize([
      ...FEEDS,
      { feed: "dw", xml: fixture("rss.dw.xml") },
      { feed: "france24", xml: fixture("rss.france24.xml") },
      { feed: "crisisgroup", xml: fixture("rss.crisisgroup.xml") },
      { feed: "reuters", xml: fixture("rss.googlenews-reuters.xml") },
      { feed: "ap", xml: fixture("rss.googlenews-ap.xml") },
    ]);
    expect(events).toHaveLength(10 + 3 + 2 + 2 + 3 + 2);
    expect(new Set(events.map((e) => e.external_id)).size).toBe(events.length);
  });
});
