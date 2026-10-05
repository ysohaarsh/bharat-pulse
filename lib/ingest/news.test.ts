import { describe, expect, it } from "vitest";
import { fixture } from "@/lib/test/fixtures";
import { MAX_ITEMS_PER_FEED, NEWS_FEEDS, newsIngester } from "./news";
import { pibIngester } from "./pib";
import { decodeEntities, itemId, parseFeedDate, parseRss, toSummary } from "./rss";
import { SPORTS_PER_FEED, sportsIngester } from "./sports";

const feeds = NEWS_FEEDS.map(({ feed }) => ({ feed, xml: fixture(`news.${feed}.xml`) }));

describe("RSS helpers", () => {
  it("parses CDATA fields and the first category", () => {
    const [item] = parseRss(fixture("news.thehindu.xml"));
    expect(item.title).toBeTruthy();
    expect(item.link).toMatch(/^https:\/\/www\.thehindu\.com\//);
    expect(item.pubDate).toMatch(/\+0530$/);
    expect(item.category).toBeTruthy();
  });

  it("decodes entities and summarises HTML", () => {
    expect(decodeEntities("Tom &amp; Jerry&#8217;s &#x201C;show&#x201D; &rupee;")).toBe("Tom & Jerry’s “show” ₹");
    expect(toSummary("<p>Hello <b>world</b></p>")).toBe("Hello world");
    expect(toSummary("word ".repeat(100), 40)!.length).toBeLessThanOrEqual(40);
    expect(toSummary(null)).toBeNull();
  });

  it("parses IST and RFC 822 dates", () => {
    expect(new Date(parseFeedDate("Mon, 05 Oct 2026 00:33:07 +0530")).toISOString()).toBe("2026-10-04T19:03:07.000Z");
    expect(new Date(parseFeedDate("Mon, 05 Oct 2026 00:33:07 IST")).toISOString()).toBe("2026-10-04T19:03:07.000Z");
  });

  it("namespaces opaque guids by feed", () => {
    expect(itemId("thehindu", "article-1", null)).toBe("thehindu:article-1");
    expect(itemId("x", "https://a.b/c", null)).toBe("https://a.b/c");
    expect(itemId("x", null, "https://a.b/d")).toBe("https://a.b/d");
    expect(itemId("x", null, null)).toBeNull();
  });
});

describe("newsIngester", () => {
  const events = newsIngester.normalize(feeds);

  it("ingests every feed, capped per feed, without duplicate ids", () => {
    const perFeed = new Map<string, number>();
    for (const e of events) {
      const feed = (e.raw as { feed: string }).feed;
      perFeed.set(feed, (perFeed.get(feed) ?? 0) + 1);
    }
    expect([...perFeed.keys()].sort()).toEqual(NEWS_FEEDS.map((f) => f.feed).sort());
    for (const n of perFeed.values()) expect(n).toBeLessThanOrEqual(MAX_ITEMS_PER_FEED);
    expect(new Set(events.map((e) => e.external_id)).size).toBe(events.length);
  });

  it("geolocates a good share of Indian headlines to a state", () => {
    const english = events.filter((e) => e.lang === "en");
    const located = english.filter((e) => e.state);
    expect(located.length / english.length).toBeGreaterThan(0.3);
    for (const e of located) {
      expect(e.state).toMatch(/^IN-[A-Z]{2}$/);
      expect(e.lat).not.toBeNull();
    }
  });

  it("tags BBC Hindi items as Hindi and classifies them with Hindi keywords", () => {
    const hindi = events.filter((e) => e.lang === "hi");
    expect(hindi.length).toBeGreaterThan(0);
    expect(hindi.some((e) => e.category !== "other")).toBe(true);
  });

  it("classifies most English headlines", () => {
    const english = events.filter((e) => e.lang === "en");
    expect(english.filter((e) => e.category !== "other").length / english.length).toBeGreaterThan(0.5);
  });

  it("drops a summary that only repeats the headline", () => {
    for (const e of events) expect(e.summary).not.toBe(e.title);
  });
});

describe("pibIngester", () => {
  const events = pibIngester.normalize({ fetchedAt: "2026-10-05T00:00:00.000Z", xml: fixture("pib.xml") });

  it("keys press releases by PRID and keeps them insert-only in Hindi", () => {
    expect(pibIngester.insertOnly).toBe(true);
    expect(events.length).toBe(20);
    for (const e of events) {
      expect(e.external_id).toMatch(/^\d+$/);
      expect(e.url).toBe(`https://pib.gov.in/PressReleasePage.aspx?PRID=${e.external_id}`);
      expect(e.lang).toBe("hi");
      expect(e.severity).toBeLessThanOrEqual(2);
      expect(e.occurred_at).toBe("2026-10-05T00:00:00.000Z");
    }
  });

  it("rejects malformed input", () => {
    expect(pibIngester.normalize({ fetchedAt: "nope", xml: "" })).toEqual([]);
  });
});

describe("sportsIngester", () => {
  const events = sportsIngester.normalize([
    { feed: "thehindu", xml: fixture("sports.thehindu.xml") },
    { feed: "cricinfo", xml: fixture("sports.cricinfo.xml") },
  ]);

  it("keeps sports unpinned, unclassified and capped", () => {
    expect(events.length).toBeGreaterThan(0);
    expect(events.length).toBeLessThanOrEqual(2 * SPORTS_PER_FEED);
    for (const e of events) {
      expect(e).toMatchObject({ category: "sports", severity: 1, lat: null, state: null });
    }
  });
});
