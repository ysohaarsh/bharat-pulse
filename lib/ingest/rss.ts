/**
 * Minimal RSS 2.0 parsing shared by the news, sports and PIB ingesters. No dependencies:
 * every Indian feed we use is plain RSS 2.0, often with CDATA-wrapped fields.
 */

export interface RssItem {
  title: string | null;
  link: string | null;
  description: string | null;
  pubDate: string | null;
  guid: string | null;
  /** First `<category>`; The Hindu uses it for the state ("Karnataka"). */
  category: string | null;
}

export interface RssFeedRaw {
  feed: string;
  xml: string;
}

export const SUMMARY_MAX = 280;

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
  rupee: "₹",
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
      category: tag(block, "category"),
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
      .replace(/<a\b[^>]*>\s*(?:Continue reading|Read more)\.*\s*<\/a>/gi, " ")
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

/** RFC 822 / ISO dates; NaN when unparseable. */
export function parseFeedDate(s: string): number {
  return Date.parse(s.trim().replace(/\bIST$/, "+0530"));
}

export const isHttpUrl = (s: string | null): s is string => s !== null && /^https?:\/\//i.test(s);

/**
 * URL guids are global, so they're used as-is (and dedupe across feeds). Opaque guids
 * (The Hindu "article-71544377") are namespaced by feed so two feeds' ids can't collide.
 */
export function itemId(feed: string, guid: string | null, link: string | null): string | null {
  if (guid !== null) return isHttpUrl(guid) ? guid : `${feed}:${guid}`;
  return link;
}

export const BOT_HEADERS = {
  // Several Indian publishers (and pib.gov.in) answer 403 to non-browser user agents.
  "User-Agent": "Mozilla/5.0 (compatible; BharatPulse/1.0; +https://github.com/)",
  Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
};

/** Fetch several feeds in parallel; failed feeds are dropped (one dead feed mustn't fail the run). */
export async function fetchFeeds(feeds: readonly { feed: string; url: string }[]): Promise<RssFeedRaw[]> {
  const results = await Promise.allSettled(
    feeds.map(async ({ feed, url }) => {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000), cache: "no-store", headers: BOT_HEADERS });
      if (!res.ok) throw new Error(`${feed} RSS HTTP ${res.status}`);
      return { feed, xml: await res.text() };
    }),
  );
  return results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
}
