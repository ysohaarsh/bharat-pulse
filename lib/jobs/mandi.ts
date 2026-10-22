import { z } from "zod";
import { fetchOgdPages } from "@/lib/ingest/ogd";
import { stateByName } from "@/lib/india/states";
import type { MetricRow } from "@/lib/types";

/**
 * Agmarknet daily mandi (APMC market) prices via the OGD API (data.gov.in; key in
 * DATA_GOV_IN_API_KEY). For a handful of kitchen staples we publish the national median of
 * the modal price across reporting markets, plus a per-state median.
 * Resource: "Current daily price of various commodities from various markets (Mandi)".
 * Verified against the live feed 2026-10-22: field ids match; prices are JSON numbers (₹/quintal),
 * `arrival_date` is dd/mm/yyyy and the resource holds only the current day. Paged with limit/offset.
 */
export const MANDI_RESOURCE = "9ef84268-d588-465a-a308-a864a43d0070";
export const MANDI_COMMODITIES = ["Onion", "Tomato", "Potato", "Wheat", "Rice"] as const;

export const MANDI_HISTORY_RESOURCE = "35985678-0d79-46b4-9ed6-6f13308a1d24";
/** Look back this many days for the comparison day, then fall back up to MANDI_FALLBACK_DAYS earlier. */
export const MANDI_WOW_DAYS = 7;
export const MANDI_FALLBACK_DAYS = 3;
/** Fewer matched markets than this and a week-on-week figure would be noise. */
export const MANDI_MIN_MATCHED = 10;

export const mandiUrl = (key: string, commodity: string, offset = 0) =>
  `https://api.data.gov.in/resource/${MANDI_RESOURCE}?api-key=${encodeURIComponent(key)}&format=json&limit=2000&offset=${offset}` +
  `&filters%5Bcommodity%5D=${encodeURIComponent(commodity)}`;

/**
 * History resource: capitalised field ids, filterable by Commodity + Arrival_Date (dd/mm/yyyy, exact), one row per
 * market x variety x grade (~180-870 rows per commodity-day, always under limit=1000), lags ~1 day.
 */
export const mandiHistoryUrl = (key: string, commodity: string, date: string) =>
  `https://api.data.gov.in/resource/${MANDI_HISTORY_RESOURCE}?api-key=${encodeURIComponent(key)}&format=json&limit=1000&offset=0` +
  `&filters%5BCommodity%5D=${encodeURIComponent(commodity)}&filters%5BArrival_Date%5D=${encodeURIComponent(date)}` +
  `&fields=State,Market,Variety,Grade,Arrival_Date,Modal_Price`;

const num = z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().finite().positive().nullable());

const Record = z.object({
  state: z.string().min(1),
  market: z.string().min(1),
  variety: z.string().optional().default(""),
  grade: z.string().optional().default(""),
  commodity: z.string().min(1),
  arrival_date: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/),
  modal_price: num,
});

const HistoryRecord = z.object({
  State: z.string().min(1),
  Market: z.string().min(1),
  Variety: z.string().optional().default(""),
  Grade: z.string().optional().default(""),
  Modal_Price: num,
});

/** Comparison day: the records fetched for `date` (dd/mm/yyyy) from the history resource. */
export interface MandiPrev {
  date: string;
  records: unknown[];
}

export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** "05/10/2026" → ISO noon IST (a day stamp, not a precise time). */
const arrivalToIso = (d: string) => {
  const [dd, mm, yyyy] = d.split("/");
  return new Date(`${yyyy}-${mm}-${dd}T12:00:00+05:30`).toISOString();
};

const pairKey = (state: string, market: string, variety: string, grade: string) =>
  [state, market, variety, grade].map((x) => x.trim().toLowerCase()).join("|");

/**
 * Week-on-week change, like for like. The current-day feed covers a different (and growing through the day) set of
 * markets than the history resource (Potato: 1,100 vs 2,100 median across all rows), so comparing the two national
 * medians directly would mostly measure coverage. We compare only (state, market, variety, grade) rows present in both.
 * Returns {} when fewer than MANDI_MIN_MATCHED rows match.
 */
export function weekOnWeek(
  today: { state: string; market: string; variety: string; grade: string; modal_price: number | null }[],
  prev: MandiPrev,
): { wow_pct?: number; prev?: number; prev_date: string; matched?: number } {
  const before = new Map<string, number>();
  for (const r of prev.records) {
    const p = HistoryRecord.safeParse(r);
    if (p.success && p.data.Modal_Price != null) before.set(pairKey(p.data.State, p.data.Market, p.data.Variety, p.data.Grade), p.data.Modal_Price);
  }
  const now: number[] = [];
  const then: number[] = [];
  const seen = new Set<string>();
  for (const r of today) {
    const k = pairKey(r.state, r.market, r.variety, r.grade);
    const b = before.get(k);
    if (b == null || r.modal_price == null || seen.has(k)) continue;
    seen.add(k);
    now.push(r.modal_price);
    then.push(b);
  }
  const prev_date = arrivalToIso(prev.date).slice(0, 10);
  if (now.length < MANDI_MIN_MATCHED) return { prev_date };
  const [cur, old] = [median(now), median(then)];
  return { wow_pct: Math.round((cur / old - 1) * 1000) / 10, prev: old, prev_date, matched: now.length };
}

/** Records for one commodity → national + per-state median modal price (₹/quintal), latest day only. */
export function mandiMetrics(commodity: string, records: unknown[], prev: MandiPrev | null = null): MetricRow[] {
  const rows = records.flatMap((r) => {
    const p = Record.safeParse(r);
    return p.success && p.data.modal_price != null ? [p.data] : [];
  });
  if (rows.length === 0) return [];
  const latest = rows.map((r) => arrivalToIso(r.arrival_date)).sort().at(-1)!;
  const today = rows.filter((r) => arrivalToIso(r.arrival_date) === latest);

  const out: MetricRow[] = [];
  const key = `mandi:${commodity}`;
  out.push({
    key,
    region: "IN",
    label: `${commodity} (all-India median)`,
    value: median(today.map((r) => r.modal_price!)),
    unit: "₹/qtl",
    lat: null,
    lng: null,
    state: null,
    observed_at: latest,
    meta: { markets: today.length, ...(prev ? weekOnWeek(today, prev) : {}) },
  });
  const byState = new Map<string, number[]>();
  for (const r of today) {
    const code = stateByName(r.state)?.code;
    if (!code) continue;
    byState.set(code, [...(byState.get(code) ?? []), r.modal_price!]);
  }
  for (const [code, prices] of byState) {
    out.push({
      key,
      region: code,
      label: commodity,
      value: median(prices),
      unit: "₹/qtl",
      lat: null,
      lng: null,
      state: code,
      observed_at: latest,
      meta: { markets: prices.length },
    });
  }
  return out;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** dd/mm/yyyy minus `days`, same format. */
export function shiftArrival(d: string, days: number): string {
  const [dd, mm, yyyy] = d.split("/").map(Number);
  const t = new Date(Date.UTC(yyyy, mm - 1, dd) - days * 86400_000);
  return `${pad(t.getUTCDate())}/${pad(t.getUTCMonth() + 1)}/${t.getUTCFullYear()}`;
}

/** Newest arrival_date (dd/mm/yyyy) among the current-day records, or null. */
export function latestArrival(records: unknown[]): string | null {
  const days = records.flatMap((r) => {
    const p = Record.safeParse(r);
    return p.success && p.data.modal_price != null ? [p.data.arrival_date] : [];
  });
  return days.sort((a, b) => arrivalToIso(a).localeCompare(arrivalToIso(b))).at(-1) ?? null;
}

/**
 * Prices for the day 7 days before `latest` (history resource, commodity + date filter, one call); if that day has no
 * rows yet/anymore, try 8, 9, 10 days back. Never throws: no comparison beats a failed job. `deadline` is epoch ms.
 */
export async function fetchMandiPrev(key: string, commodity: string, latest: string, deadline = Infinity): Promise<MandiPrev | null> {
  for (let back = MANDI_WOW_DAYS; back <= MANDI_WOW_DAYS + MANDI_FALLBACK_DAYS; back++) {
    if (Date.now() > deadline) return null;
    const date = shiftArrival(latest, back);
    try {
      const { records } = await fetchOgdPages(() => mandiHistoryUrl(key, commodity, date), { maxCalls: 1, timeoutMs: 10_000 });
      if (records.length > 0) return { date, records };
    } catch {
      return null;
    }
  }
  return null;
}

/** Whole job is ~5 current-day pages + 5 filtered history calls (~1 s each), commodities in parallel; 35 s soft cap on history. */
export async function fetchMandi(): Promise<{ commodity: string; records: unknown[]; prev: MandiPrev | null }[]> {
  const key = process.env.DATA_GOV_IN_API_KEY;
  if (!key) throw new Error("DATA_GOV_IN_API_KEY is not set (free key: https://data.gov.in → My Account → API keys)");
  const deadline = Date.now() + 35_000;
  return Promise.all(
    MANDI_COMMODITIES.map(async (commodity) => {
      const { records } = await fetchOgdPages((offset) => mandiUrl(key, commodity, offset), { maxCalls: 4 });
      const latest = latestArrival(records);
      const prev = latest ? await fetchMandiPrev(key, commodity, latest, deadline) : null;
      return { commodity, records, prev };
    }),
  );
}
