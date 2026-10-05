import type { NormalizedEvent } from "@/lib/types";
import { classifyHindi } from "./classify";
import { isHttpUrl, parseRss } from "./rss";
import type { Ingester } from "./types";

/**
 * Press Information Bureau — every Government of India press release.
 *
 * The RSS endpoint redirects every language/region combination to the Hindi national feed
 * (`Lang=2&Regid=3&reg=48`) and items carry only <title> and <link> — no dates. So items are
 * Hindi (translated to English after ingest), stamped with the time we first saw them
 * (insert-only), and keyed by the press-release id (PRID).
 */
export const PIB_URL = "https://www.pib.gov.in/RssMain.aspx?ModId=6&Lang=2&Regid=3";

export interface PibRaw {
  fetchedAt: string;
  xml: string;
}

const PRID = /[?&]PRID=(\d+)/i;

export const pibIngester: Ingester<PibRaw> = {
  source: "pib",
  insertOnly: true,

  async fetchRaw() {
    // pib.gov.in answers 403 to any User-Agent that identifies as a bot ("compatible; …"),
    // so this one feed is fetched with a plain browser UA.
    const res = await fetch(PIB_URL, { signal: AbortSignal.timeout(20_000), cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`PIB fetch failed: ${res.status} ${res.statusText}`);
    return { fetchedAt: new Date().toISOString(), xml: await res.text() };
  },

  normalize(raw) {
    if (!raw || typeof raw.xml !== "string" || Number.isNaN(Date.parse(raw.fetchedAt))) return [];
    const out: NormalizedEvent[] = [];
    const seen = new Set<string>();
    for (const item of parseRss(raw.xml.replace(/^﻿/, ""))) {
      const title = item.title?.trim();
      const prid = item.link ? PRID.exec(item.link)?.[1] : undefined;
      if (!title || !prid || seen.has(prid)) continue;
      seen.add(prid);
      const { category, severity } = classifyHindi(title);
      out.push({
        source: "pib",
        external_id: prid,
        title,
        summary: null,
        // Press releases are announcements; keep them out of the threat picture.
        category: category === "other" ? "politics" : category,
        severity: Math.min(severity, 2) as 1 | 2,
        lat: null,
        lng: null,
        state: null,
        district: null,
        lang: "hi",
        url: isHttpUrl(item.link) ? `https://pib.gov.in/PressReleasePage.aspx?PRID=${prid}` : null,
        occurred_at: raw.fetchedAt,
        raw: { prid, link: item.link },
      });
    }
    return out;
  },
};
