import { z } from "zod";
import { BOT_HEADERS, decodeEntities } from "@/lib/ingest/rss";
import type { MetricRow } from "@/lib/types";

/**
 * Vidyut PRAVAH (Ministry of Power): live all-India electricity demand and exchange price.
 * The dashboard's own JSON endpoint returns values wrapped in display HTML
 * ("<span class='counter'> 218</span>… GW"), so numbers are pulled out of the markup.
 */
export const POWER_URL = "https://vidyutpravah.in/PXDashboard/BindTopStatisticsFromJS";

const TopSchema = z.array(z.record(z.string(), z.unknown())).min(1);

/** First number in an HTML fragment: "<span> 2,18 </span>&nbsp;GW" → 218. */
export function numberFromHtml(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return null;
  const text = decodeEntities(v.replace(/<[^>]+>/g, " "));
  const m = /-?\d[\d,]*(?:\.\d+)?/.exec(text);
  return m ? Number(m[0].replace(/,/g, "")) : null;
}

const FIELDS: { field: string; key: string; label: string; unit: string }[] = [
  { field: "demand", key: "power.demand", label: "All-India demand met (now)", unit: "GW" },
  { field: "demandYest", key: "power.demand_yesterday", label: "Peak demand met (yesterday)", unit: "GW" },
  { field: "UMCP", key: "power.price", label: "Exchange clearing price", unit: "₹/unit" },
  { field: "Peak", key: "power.peak_shortage", label: "Peak shortage (yesterday)", unit: "MW" },
  { field: "Energy", key: "power.energy_shortage", label: "Energy shortage (yesterday)", unit: "MU" },
];

export function powerMetrics(raw: unknown, observedAt: string): MetricRow[] {
  const parsed = TopSchema.safeParse(raw);
  if (!parsed.success) return [];
  const row = parsed.data[0];
  const out: MetricRow[] = [];
  for (const f of FIELDS) {
    const value = numberFromHtml(row[f.field]);
    if (value == null || !Number.isFinite(value)) continue;
    // Demand of 0 means the dashboard hasn't refreshed yet; don't record it.
    if (f.key === "power.demand" && value <= 0) continue;
    out.push({ key: f.key, region: "IN", label: f.label, value, unit: f.unit, lat: null, lng: null, state: null, observed_at: observedAt });
  }
  return out;
}

export async function fetchPower(): Promise<unknown> {
  const res = await fetch(POWER_URL, { signal: AbortSignal.timeout(20_000), cache: "no-store", headers: BOT_HEADERS });
  if (!res.ok) throw new Error(`Vidyut PRAVAH fetch failed: ${res.status}`);
  return res.json();
}
