import { z } from "zod";
import type { NormalizedEvent } from "@/lib/types";
import { classify } from "./classify";
import { detectCountry } from "./geo";
import type { Ingester } from "./types";

export interface RssFeedConfig {
  feed: string;
  url: string;
  /** Google News search feed: titles end in " - <Publisher>", descriptions only repeat the title. */
  googleNews?: boolean;
  /** Items whose link matches are dropped (e.g. non-English editions). */
  excludeLink?: RegExp;
}

const googleNewsSearch = (q: string) => `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;

export const RSS_FEEDS: readonly RssFeedConfig[] = [
  { feed: "bbc", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { feed: "aljazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { feed: "npr", url: "https://feeds.npr.org/1004/rss.xml" },
  { feed: "guardian", url: "https://www.theguardian.com/world/rss" },
  { feed: "dw", url: "https://rss.dw.com/xml/rss-en-all" },
  { feed: "france24", url: "https://www.france24.com/en/rss" },
  // Crisis Group's feed mixes in other-language editions under /fr/, /es/, ...
  {
    feed: "crisisgroup",
    url: "https://www.crisisgroup.org/rss",
    excludeLink: /^https?:\/\/(?:www\.)?crisisgroup\.org\/[a-z]{2}\//i,
  },
  // Google News search feeds are relevance-ordered and link via news.google.com redirects.
  { feed: "reuters", url: googleNewsSearch("site:reuters.com+world"), googleNews: true },
  { feed: "ap", url: googleNewsSearch("site:apnews.com+world"), googleNews: true },
];

const FEED_CONFIG = new Map(RSS_FEEDS.map((f) => [f.feed, f]));

/** Keep only the newest N items per feed so one busy feed (DW lists ~130) can't flood a run. */
export const MAX_ITEMS_PER_FEED = 25;

export interface RssFeedRaw {
  feed: string;
  xml: string;
}

export interface RssItem {
  title: string | null;
  link: string | null;
  description: string | null;
  pubDate: string | null;
  guid: string | null;
  /** `<source>` publisher name, set by aggregators such as Google News. */
  source: string | null;
}

const SUMMARY_MAX = 280;

// ---------- minimal RSS 2.0 parsing ----------

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ent: string) => {
    if (ent[0] === "#") {
      const code = ent[1] === "x" || ent[1] === "X" ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[ent.toLowerCase()] ?? whole;
  });
}

/** Text content of an element: CDATA sections are taken verbatim, the rest entity-decoded. */
function textContent(inner: string): string {
  let out = "";
  let last = 0;
  for (const m of inner.matchAll(/<!\[CDATA\[([\s\S]*?)\]\]>/g)) {
    out += decodeEntities(inner.slice(last, m.index)) + m[1];
    last = m.index + m[0].length;
  }
  out += decodeEntities(inner.slice(last));
  return out.trim();
}

function tag(block: string, name: string): string | null {
  // `<name` followed by space, `>` or `/` — so `<link` never matches `<atom:link`, and
  // `<title` never matches `<media:title`.
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i").exec(block);
  if (!m) return null;
  const v = textContent(m[1]);
  return v === "" ? null : v;
}

export function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = [];
  for (const m of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)) {
    const block = m[1];
    items.push({
      title: tag(block, "title"),
      link: tag(block, "link"),
      description: tag(block, "description"),
      pubDate: tag(block, "pubDate"),
      guid: tag(block, "guid"),
      source: tag(block, "source"),
    });
  }
  return items;
}

/** Strip HTML tags, decode entities, collapse whitespace, truncate on a word boundary. */
export function toSummary(html: string | null, max = SUMMARY_MAX): string | null {
  if (!html) return null;
  const text = decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<a\b[^>]*>\s*Continue reading\.*\s*<\/a>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.]+$/, "") + "…";
}

// ---------- ingester ----------

const feedSchema = z.object({ feed: z.string(), xml: z.string() });

const itemSchema = z
  .object({
    title: z.string().min(1),
    link: z.string().url().nullable(),
    description: z.string().nullable(),
    pubDate: z.string().min(1),
    guid: z.string().min(1).nullable(),
    source: z.string().nullable(),
  })
  .refine((i) => i.guid !== null || i.link !== null, "needs guid or link");

const isHttpUrl = (s: string | null): s is string => s !== null && /^https?:\/\//i.test(s);

const MONTH_DAY_YEAR_TIME = /^(?:[A-Za-z]+,\s*)?([A-Za-z]+ \d{1,2}, \d{4})\s*-\s*(\d{1,2}:\d{2})$/;

/**
 * RFC 822 / ISO dates via Date.parse, plus Drupal's "Friday, September 25, 2026 - 15:56"
 * (Crisis Group), which carries no zone and is read as UTC.
 */
export function parseFeedDate(s: string): number {
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return t;
  const m = MONTH_DAY_YEAR_TIME.exec(s.trim());
  return m ? Date.parse(`${m[1]} ${m[2]} UTC`) : NaN;
}

/** Drop the " - Reuters" style publisher suffix Google News appends to every headline. */
export function cleanTitle(title: string, source: string | null, googleNews = false): string {
  if (source) {
    const suffix = ` - ${source}`;
    if (title.endsWith(suffix) && title.length > suffix.length) return title.slice(0, -suffix.length).trim();
  }
  if (googleNews) {
    const cut = title.lastIndexOf(" - ");
    if (cut > 0) return title.slice(0, cut).trim();
  }
  return title;
}

/**
 * URL guids are global, so they're used as-is (and dedupe across feeds). Opaque guids
 * (DW "79534734", Crisis Group "28555", Google News article ids) are namespaced by feed so
 * two feeds' numeric ids can't collide.
 */
function itemId(feed: string, guid: string | null, link: string | null): string {
  if (guid === null) return link as string;
  return isHttpUrl(guid) ? guid : `${feed}:${guid}`;
}

export const rssIngester: Ingester<RssFeedRaw[]> = {
  source: "rss",

  async fetchRaw() {
    const results = await Promise.allSettled(
      RSS_FEEDS.map(async ({ feed, url }) => {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(15_000),
          cache: "no-store",
          headers: { "User-Agent": "PulseBot/1.0 (+world events dashboard)" },
        });
        if (!res.ok) throw new Error(`${feed} RSS HTTP ${res.status}`);
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
      const name = feed.data.feed;
      const config = FEED_CONFIG.get(name);

      // Dedupe within the feed in document order (first occurrence wins), then keep the
      // newest MAX_ITEMS_PER_FEED, then dedupe against earlier feeds.
      const local = new Set<string>();
      const candidates: { time: number; event: NormalizedEvent }[] = [];
      for (const rawItem of parseRss(feed.data.xml)) {
        const parsed = itemSchema.safeParse(rawItem);
        if (!parsed.success) continue;
        const item = parsed.data;
        const time = parseFeedDate(item.pubDate);
        if (Number.isNaN(time)) continue;
        if (config?.excludeLink && item.link && config.excludeLink.test(item.link)) continue;
        const external_id = itemId(name, item.guid, item.link);
        if (local.has(external_id)) continue;
        local.add(external_id);

        const title = cleanTitle(item.title, item.source, config?.googleNews);
        // Google News descriptions are just the headline + publisher again.
        const summary = config?.googleNews ? null : toSummary(item.description);
        const text = `${title}. ${summary ?? ""}`;
        // Prefer the headline's country; fall back to the summary.
        const geo = detectCountry(title) ?? detectCountry(summary);
        const { category, severity } = classify(text);
        candidates.push({
          time,
          event: {
            source: "rss",
            external_id,
            title,
            summary,
            category,
            severity,
            lat: geo?.lat ?? null,
            lng: geo?.lng ?? null,
            country: geo?.country ?? null,
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
