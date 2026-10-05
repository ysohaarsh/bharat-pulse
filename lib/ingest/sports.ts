import { z } from "zod";
import type { NormalizedEvent } from "@/lib/types";
import { fetchFeeds, isHttpUrl, itemId, parseFeedDate, parseRss, toSummary, type RssFeedRaw } from "./rss";
import type { Ingester } from "./types";

/**
 * Sports headlines (cricket first, this being India).
 *
 * Sports is an opt-in side feed: it doesn't fit the geo/severity model, so every item is
 * category "sports", severity 1, never goes through `classify` ("shooting", "attack",
 * "strikes" would otherwise read as security) and is never pinned (team names are places).
 */
export const SPORTS_FEEDS = [
  { feed: "thehindu", url: "https://www.thehindu.com/sport/feeder/default.rss" },
  { feed: "cricinfo", url: "https://www.espncricinfo.com/rss/content/story/feeds/0.xml" },
] as const;

/** Newest items kept per feed, so one chatty feed can't flood the table. */
export const SPORTS_PER_FEED = 25;

const feedSchema = z.object({ feed: z.string(), xml: z.string() });

const itemSchema = z
  .object({
    title: z.string().min(1),
    link: z.string().url().nullable(),
    description: z.string().nullable(),
    pubDate: z.string().min(1),
    guid: z.string().min(1).nullable(),
  })
  .refine((i) => i.guid !== null || i.link !== null, "needs guid or link");

export const sportsIngester: Ingester<RssFeedRaw[]> = {
  source: "sports",

  fetchRaw: () => fetchFeeds(SPORTS_FEEDS),

  normalize(raw) {
    const feeds = Array.isArray(raw) ? raw : [];
    const seen = new Set<string>();
    const out: NormalizedEvent[] = [];
    for (const f of feeds) {
      const feed = feedSchema.safeParse(f);
      if (!feed.success) continue;

      const items = parseRss(feed.data.xml).flatMap((rawItem) => {
        const parsed = itemSchema.safeParse(rawItem);
        if (!parsed.success) return [];
        const time = parseFeedDate(parsed.data.pubDate);
        return Number.isNaN(time) ? [] : [{ item: parsed.data, time }];
      });
      items.sort((a, b) => b.time - a.time);

      let kept = 0;
      for (const { item, time } of items) {
        if (kept >= SPORTS_PER_FEED) break;
        const external_id = itemId(feed.data.feed, item.guid, item.link);
        if (!external_id || seen.has(external_id)) continue;
        seen.add(external_id);
        kept++;
        const summary = toSummary(item.description);
        out.push({
          source: "sports",
          external_id,
          title: item.title.trim(),
          summary: summary && summary !== item.title.trim() ? summary : null,
          category: "sports",
          severity: 1,
          lat: null,
          lng: null,
          state: null,
          district: null,
          lang: "en",
          url: isHttpUrl(item.link) ? item.link : null,
          occurred_at: new Date(time).toISOString(),
          raw: { feed: feed.data.feed, guid: item.guid, link: item.link, pubDate: item.pubDate },
        });
      }
    }
    return out;
  },
};
