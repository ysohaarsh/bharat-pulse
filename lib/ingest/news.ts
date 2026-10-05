import { z } from "zod";
import { stateByName } from "@/lib/india/states";
import type { NormalizedEvent } from "@/lib/types";
import { classify, classifyHindi } from "./classify";
import { detectPlace, statePoint } from "./geo";
import { fetchFeeds, isHttpUrl, itemId, parseFeedDate, parseRss, toSummary, type RssFeedRaw } from "./rss";
import type { Ingester } from "./types";

export interface NewsFeedConfig {
  feed: string;
  url: string;
  lang: "en" | "hi";
}

/** Indian national news feeds (verified 2026-10-05). Mongabay India sits behind a Cloudflare challenge. */
export const NEWS_FEEDS: readonly NewsFeedConfig[] = [
  { feed: "thehindu", url: "https://www.thehindu.com/news/national/feeder/default.rss", lang: "en" },
  { feed: "indianexpress", url: "https://indianexpress.com/section/india/feed/", lang: "en" },
  { feed: "hindustantimes", url: "https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml", lang: "en" },
  { feed: "theprint", url: "https://theprint.in/category/india/feed/", lang: "en" },
  { feed: "businessline", url: "https://www.thehindubusinessline.com/economy/feeder/default.rss", lang: "en" },
  { feed: "bbchindi", url: "https://feeds.bbci.co.uk/hindi/rss.xml", lang: "hi" },
];

const FEED_LANG = new Map(NEWS_FEEDS.map((f) => [f.feed, f.lang]));

/** Keep only the newest N items per feed so one busy feed (Indian Express lists 200) can't flood a run. */
export const MAX_ITEMS_PER_FEED = 25;

const feedSchema = z.object({ feed: z.string(), xml: z.string() });

const itemSchema = z
  .object({
    title: z.string().min(1),
    link: z.string().url().nullable(),
    description: z.string().nullable(),
    pubDate: z.string().min(1),
    guid: z.string().min(1).nullable(),
    category: z.string().nullable(),
  })
  .refine((i) => i.guid !== null || i.link !== null, "needs guid or link");

export const newsIngester: Ingester<RssFeedRaw[]> = {
  source: "news",

  fetchRaw: () => fetchFeeds(NEWS_FEEDS),

  normalize(raw) {
    const feeds = Array.isArray(raw) ? raw : [];
    const seen = new Set<string>();
    const out: NormalizedEvent[] = [];
    for (const f of feeds) {
      const feed = feedSchema.safeParse(f);
      if (!feed.success) continue;
      const name = feed.data.feed;
      const lang = FEED_LANG.get(name) ?? "en";

      const candidates: { time: number; event: NormalizedEvent }[] = [];
      const local = new Set<string>();
      for (const rawItem of parseRss(feed.data.xml)) {
        const parsed = itemSchema.safeParse(rawItem);
        if (!parsed.success) continue;
        const item = parsed.data;
        const time = parseFeedDate(item.pubDate);
        if (Number.isNaN(time)) continue;
        const external_id = itemId(name, item.guid, item.link);
        if (!external_id || local.has(external_id)) continue;
        local.add(external_id);

        const title = item.title.trim();
        const rawSummary = toSummary(item.description);
        // Some feeds repeat the headline as the description.
        const summary = rawSummary && rawSummary !== title ? rawSummary : null;
        const { category, severity } = lang === "hi" ? classifyHindi(`${title} ${summary ?? ""}`) : classify(`${title}. ${summary ?? ""}`);
        // Headline place first, then the summary, then the feed's own section tag (The Hindu: "Karnataka").
        const place = detectPlace(title) ?? detectPlace(summary) ?? statePoint(stateByName(item.category)?.code);

        candidates.push({
          time,
          event: {
            source: "news",
            external_id,
            title,
            summary,
            category,
            severity,
            lat: place?.lat ?? null,
            lng: place?.lng ?? null,
            state: place?.state ?? null,
            district: place?.district ?? null,
            lang,
            url: isHttpUrl(item.link) ? item.link : null,
            occurred_at: new Date(time).toISOString(),
            raw: { feed: name, ...item },
          },
        });
      }

      candidates.sort((a, b) => b.time - a.time);
      for (const { event } of candidates.slice(0, MAX_ITEMS_PER_FEED)) {
        if (seen.has(event.external_id)) continue;
        seen.add(event.external_id);
        out.push(event);
      }
    }
    return out;
  },
};
