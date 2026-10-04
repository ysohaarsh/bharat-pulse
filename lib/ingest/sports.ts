import { z } from "zod";
import type { NormalizedEvent } from "@/lib/types";
import { detectCountry } from "./geo";
import { parseRss, toSummary } from "./rss";
import type { Ingester } from "./types";

/**
 * Sports headlines from a few major outlets' RSS feeds.
 *
 * Sports is an opt-in side feed: it doesn't fit the geo/severity model, so every item is
 * category "sports", severity 1, and never goes through `classify` ("shooting", "attack",
 * "strikes", "clash" would otherwise read as conflict). Items get a pin only when the
 * headline itself names a country.
 */
export const SPORTS_FEEDS = [
  { feed: "bbc", url: "https://feeds.bbci.co.uk/sport/rss.xml" },
  { feed: "guardian", url: "https://www.theguardian.com/uk/sport/rss" },
  { feed: "sky", url: "https://www.skysports.com/rss/12040" },
  { feed: "espn", url: "https://www.espn.com/espn/rss/news" },
] as const;

/** Newest items kept per feed, so one chatty feed can't flood the table. */
export const SPORTS_PER_FEED = 25;

export interface SportsFeedRaw {
  feed: string;
  xml: string;
}

// UK outlets stamp pubDate with abbreviations Date.parse doesn't know (Sky uses "BST").
const TZ_OFFSETS: Record<string, string> = { BST: "+0100", CET: "+0100", CEST: "+0200" };

/** RFC 822 date → epoch ms (NaN when unparseable), accepting a few extra zone abbreviations. */
export function parseFeedDate(s: string): number {
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return t;
  return Date.parse(s.replace(/\b(BST|CEST|CET)\s*$/, (_, zone: string) => TZ_OFFSETS[zone]));
}

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

export const sportsIngester: Ingester<SportsFeedRaw[]> = {
  source: "sports",

  async fetchRaw() {
    const results = await Promise.allSettled(
      SPORTS_FEEDS.map(async ({ feed, url }) => {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(15_000),
          cache: "no-store",
          headers: { "User-Agent": "PulseBot/1.0 (+world events dashboard)" },
        });
        if (!res.ok) throw new Error(`${feed} sports RSS HTTP ${res.status}`);
        return { feed, xml: await res.text() };
      }),
    );
    return results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  },

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
        // BBC lists one article several times with guids differing only by "#0", "#1", ...
        const external_id = ((item.guid ?? item.link) as string).replace(/^(https?:\/\/[^#]+)#.*$/, "$1");
        if (seen.has(external_id)) continue;
        seen.add(external_id);
        kept++;

        const geo = detectCountry(item.title);
        out.push({
          source: "sports",
          external_id,
          title: item.title,
          summary: toSummary(item.description),
          category: "sports",
          severity: 1,
          lat: geo?.lat ?? null,
          lng: geo?.lng ?? null,
          country: geo?.country ?? null,
          url: item.link,
          occurred_at: new Date(time).toISOString(),
          raw: { feed: feed.data.feed, guid: item.guid, link: item.link, pubDate: item.pubDate },
        });
      }
    }
    return out;
  },
};
