import { z } from "zod";
import type { NormalizedEvent, Severity } from "@/lib/types";
import { detectCountry } from "./geo";
import { toSummary } from "./rss";
import type { Ingester } from "./types";

/**
 * WHO Disease Outbreak News (DON). Content © WHO, licensed CC BY-NC-SA 3.0 IGO —
 * attribution required, non-commercial use only. Each DON post is its own event
 * (`external_id` = its UrlName, e.g. "2026-DON618"); follow-up posts on the same outbreak
 * are separate rows, matching how WHO publishes them.
 */
const SELECT = "Id,Title,OverrideTitle,UseOverrideTitle,UrlName,PublicationDate,Summary,DonId";
// `$select` trims the payload from ~600 KB to ~40 KB (the full records carry long HTML sections).
export const WHO_URL =
  "https://www.who.int/api/news/diseaseoutbreaknews" +
  `?$top=20&$orderby=${encodeURIComponent("PublicationDate desc")}&$select=${SELECT}`;

export const WHO_MAX_AGE_DAYS = 60;
const DAY_MS = 86_400_000;

const ItemSchema = z.object({
  Title: z.string().nullable().optional(),
  OverrideTitle: z.string().nullable().optional(),
  UseOverrideTitle: z.boolean().nullable().optional(),
  UrlName: z.string().regex(/^[\w-]+$/),
  PublicationDate: z.string().min(1),
  Summary: z.string().nullable().optional(),
  DonId: z.string().nullable().optional(),
});

const ResponseSchema = z.object({ value: z.array(z.unknown()) });

/**
 * The location part of a DON title: after the last dash ("Mpox - Democratic Republic of the
 * Congo") or, failing that, after the last comma ("Ebola …, Democratic Republic of the
 * Congo & Uganda"). Matching that first avoids disease names like "Japanese encephalitis".
 */
function titleLocation(title: string): string | null {
  const dash = title.split(/\s+[-–—]\s+/);
  if (dash.length > 1) return dash[dash.length - 1];
  const comma = title.lastIndexOf(", ");
  return comma >= 0 ? title.slice(comma + 2) : null;
}

const MULTI_COUNTRY = /\s(?:&|and)\s|\bmulti[- ]?(?:country|countries|location|locations|national)\b|\bglobal\b|\bmultiple countries\b/i;

/** Largest "<n> … deaths" count in the text (e.g. "including 3267 deaths"). */
function maxDeaths(text: string): number {
  let max = 0;
  for (const m of text.matchAll(/\b(\d{1,3}(?:,\d{3})+|\d+)\s+(?:[a-z-]+\s+){0,2}deaths\b/gi)) {
    max = Math.max(max, Number(m[1].replace(/,/g, "")));
  }
  return max;
}

/**
 * Severity: 3 by default (every DON is a notable outbreak); 4 when the title names several
 * countries / "Multi-country" / "Global", or the summary reports ≥ 10 deaths.
 */
export function whoSeverity(title: string, summary: string | null): Severity {
  const location = titleLocation(title) ?? "";
  if (MULTI_COUNTRY.test(location)) return 4;
  if (maxDeaths(summary ?? "") >= 10) return 4;
  return 3;
}

export function normalizeWho(raw: unknown, now: number = Date.now()): NormalizedEvent[] {
  const response = ResponseSchema.safeParse(raw);
  if (!response.success) return [];

  const cutoff = now - WHO_MAX_AGE_DAYS * DAY_MS;
  const seen = new Set<string>();
  const events: NormalizedEvent[] = [];
  for (const item of response.data.value) {
    const parsed = ItemSchema.safeParse(item);
    if (!parsed.success) continue;
    const it = parsed.data;

    const time = Date.parse(it.PublicationDate);
    if (Number.isNaN(time) || time < cutoff) continue;
    if (seen.has(it.UrlName)) continue;

    const title = ((it.UseOverrideTitle && it.OverrideTitle?.trim()) || it.Title?.trim() || "").replace(/\s+/g, " ");
    if (!title) continue;

    // Summary is sometimes plain text, sometimes HTML.
    const summary = toSummary(it.Summary ?? null);
    const location = titleLocation(title);
    const geo = (location && detectCountry(location)) || detectCountry(title);

    seen.add(it.UrlName);
    events.push({
      source: "who",
      external_id: it.UrlName,
      title,
      summary,
      category: "health",
      severity: whoSeverity(title, toSummary(it.Summary ?? null, 10_000)),
      lat: geo?.lat ?? null,
      lng: geo?.lng ?? null,
      country: geo?.country ?? null,
      url: `https://www.who.int/emergencies/disease-outbreak-news/item/${encodeURIComponent(it.UrlName)}`,
      occurred_at: new Date(time).toISOString(),
      // Keep the stored row small; the full record is one click away at `url`.
      raw: { Title: it.Title, UrlName: it.UrlName, DonId: it.DonId ?? null, PublicationDate: it.PublicationDate },
    });
  }
  return events;
}

export const whoIngester: Ingester = {
  source: "who",

  async fetchRaw() {
    const res = await fetch(WHO_URL, {
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`WHO DON fetch failed: ${res.status} ${res.statusText}`);
    return res.json();
  },

  normalize(raw) {
    return normalizeWho(raw);
  },
};
