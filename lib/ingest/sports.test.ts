import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseFeedDate, SPORTS_FEEDS, SPORTS_PER_FEED, sportsIngester, type SportsFeedRaw } from "./sports";

const fixture = (name: string) => readFileSync(join(__dirname, "__fixtures__", name), "utf8");

const FEEDS: SportsFeedRaw[] = [
  { feed: "bbc", xml: fixture("sports.bbc.xml") }, // 30 items: exercises the per-feed cap
  { feed: "guardian", xml: fixture("sports.guardian.xml") },
  { feed: "sky", xml: fixture("sports.sky.xml") }, // no <guid>, "BST" dates
  { feed: "espn", xml: fixture("sports.espn.xml") }, // single-line XML, CDATA links, "EST" dates
];

const EDGE_XML = `<?xml version="1.0"?><rss version="2.0"><channel><title>Edge</title>
  <item>
    <title>Gunners' late strike sinks rivals after shooting practice clash</title>
    <link>https://example.com/a</link>
    <description>&lt;p&gt;Attack wins it.&lt;/p&gt;</description>
    <pubDate>Sun, 04 Oct 2026 08:00:00 GMT</pubDate>
  </item>
  <item>
    <title>Same story, different URL</title>
    <link>https://example.com/a</link>
    <pubDate>Sun, 04 Oct 2026 09:00:00 GMT</pubDate>
  </item>
  <item><link>https://example.com/no-title</link><pubDate>Sun, 04 Oct 2026 08:00:00 GMT</pubDate></item>
  <item><title>Bad date</title><link>https://example.com/b</link><pubDate>yesterday-ish</pubDate></item>
  <item><title>No id at all</title><pubDate>Sun, 04 Oct 2026 08:00:00 GMT</pubDate></item>
  <item>
    <title>Repeat listing one</title><link>https://example.com/c?rss</link>
    <guid isPermaLink="false">https://example.com/c#0</guid><pubDate>Sun, 04 Oct 2026 07:00:00 GMT</pubDate>
  </item>
  <item>
    <title>Repeat listing two</title><link>https://example.com/c?rss</link>
    <guid isPermaLink="false">https://example.com/c#3</guid><pubDate>Sun, 04 Oct 2026 06:00:00 GMT</pubDate>
  </item>
</channel></rss>`;

describe("parseFeedDate", () => {
  it("parses standard RFC 822 dates and the zone abbreviations UK outlets use", () => {
    expect(parseFeedDate("Sun, 04 Oct 2026 10:32:37 GMT")).toBe(Date.parse("2026-10-04T10:32:37Z"));
    expect(parseFeedDate("Sun, 4 Oct 2026 11:55:22 EST")).toBe(Date.parse("2026-10-04T16:55:22Z"));
    expect(parseFeedDate("Sun, 04 Oct 2026 16:24:00 BST")).toBe(Date.parse("2026-10-04T15:24:00Z"));
    expect(parseFeedDate("Sun, 04 Oct 2026 16:24:00 CEST ")).toBe(Date.parse("2026-10-04T14:24:00Z"));
    expect(parseFeedDate("garbage")).toBeNaN();
  });
});

describe("sportsIngester.normalize", () => {
  const events = sportsIngester.normalize(FEEDS);
  const byFeed = (feed: string) => events.filter((e) => (e.raw as { feed: string }).feed === feed);

  it("caps each feed and keeps items from every feed", () => {
    expect(byFeed("bbc")).toHaveLength(SPORTS_PER_FEED);
    expect(byFeed("guardian")).toHaveLength(4);
    expect(byFeed("sky")).toHaveLength(5);
    expect(byFeed("espn")).toHaveLength(5);
  });

  it("keeps the newest items of a capped feed", () => {
    const kept = byFeed("bbc").map((e) => Date.parse(e.occurred_at));
    expect(kept).toEqual([...kept].sort((a, b) => b - a));
  });

  it("always emits category sports, severity 1, source sports", () => {
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      expect(e.source).toBe("sports");
      expect(e.category).toBe("sports");
      expect(e.severity).toBe(1);
      expect(Number.isNaN(Date.parse(e.occurred_at))).toBe(false);
    }
  });

  it("dedupes by external_id", () => {
    const ids = events.map((e) => e.external_id);
    expect(new Set(ids).size).toBe(ids.length);
    // The same feed twice yields nothing new.
    expect(sportsIngester.normalize([...FEEDS, FEEDS[1]])).toHaveLength(events.length);
  });

  it("uses guid when present, falls back to link (Sky has no guid)", () => {
    const espn = byFeed("espn")[0];
    expect(espn.external_id).toBe("US-EN-50099890");
    expect(espn.url).toBe(
      "https://www.espn.com/nfl/story/_/id/50099890/marcus-mariota-injured-commanders-turn-rookie-qb-athan-kaliakmanis",
    );
    for (const e of byFeed("sky")) expect(e.external_id).toBe(e.url);
  });

  it("geolocates only from the headline and leaves the rest unlocated", () => {
    const verstappen = events.find((e) => e.title.startsWith("Verstappen wins in Malaysia"))!;
    expect(verstappen).toMatchObject({ country: "MY" });
    expect(verstappen.lat).toBeTypeOf("number");
    const marquez = events.find((e) => e.title.startsWith("Marquez wins in Japan"));
    expect(marquez?.country).toBe("JP");

    const mariota = events.find((e) => e.title.startsWith("Mariota ruled out"))!;
    expect(mariota).toMatchObject({ country: null, lat: null, lng: null });

    for (const e of events) expect(e.lat === null).toBe(e.country === null);
  });

  it("parses Sky's BST dates", () => {
    const sky = byFeed("sky")[0];
    expect(sky.occurred_at).toMatch(/^2026-10-04T/);
  });

  it("never classifies: violent sports idioms stay sports, and bad items are skipped", () => {
    const out = sportsIngester.normalize([{ feed: "edge", xml: EDGE_XML }]);
    // Newest of each duplicate pair wins; BBC-style "#n" guid fragments don't make a new story.
    expect(out.map((e) => e.title)).toEqual(["Same story, different URL", "Repeat listing one"]);
    expect(out[0]).toMatchObject({ category: "sports", severity: 1, external_id: "https://example.com/a" });
    expect(out[1].external_id).toBe("https://example.com/c");
  });

  it("tolerates junk input", () => {
    expect(sportsIngester.normalize(null as unknown as SportsFeedRaw[])).toEqual([]);
    expect(sportsIngester.normalize([{ feed: 1 } as unknown as SportsFeedRaw])).toEqual([]);
    expect(sportsIngester.normalize([{ feed: "x", xml: "<html>not rss</html>" }])).toEqual([]);
  });
});

describe("sportsIngester.fetchRaw", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fetches every feed with a timeout and drops failed ones", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      if (url.includes("espn")) throw new Error("network down");
      if (url.includes("skysports")) return new Response("nope", { status: 503 });
      return new Response(`<rss>${url}</rss>`, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const raw = await sportsIngester.fetchRaw();
    expect(fetchMock).toHaveBeenCalledTimes(SPORTS_FEEDS.length);
    expect(raw.map((r) => r.feed)).toEqual(["bbc", "guardian"]);
  });
});
