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

export const mandiUrl = (key: string, commodity: string, offset = 0) =>
  `https://api.data.gov.in/resource/${MANDI_RESOURCE}?api-key=${encodeURIComponent(key)}&format=json&limit=2000&offset=${offset}` +
  `&filters%5Bcommodity%5D=${encodeURIComponent(commodity)}`;

const num = z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().finite().positive().nullable());

const Record = z.object({
  state: z.string().min(1),
  market: z.string().min(1),
  commodity: z.string().min(1),
  arrival_date: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/),
  modal_price: num,
});

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

/** Records for one commodity → national + per-state median modal price (₹/quintal), latest day only. */
export function mandiMetrics(commodity: string, records: unknown[]): MetricRow[] {
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
    meta: { markets: today.length },
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

export async function fetchMandi(): Promise<{ commodity: string; records: unknown[] }[]> {
  const key = process.env.DATA_GOV_IN_API_KEY;
  if (!key) throw new Error("DATA_GOV_IN_API_KEY is not set (free key: https://data.gov.in → My Account → API keys)");
  const out: { commodity: string; records: unknown[] }[] = [];
  for (const commodity of MANDI_COMMODITIES) {
    const { records } = await fetchOgdPages((offset) => mandiUrl(key, commodity, offset), { maxCalls: 4 });
    out.push({ commodity, records });
  }
  return out;
}
