import type { MetricRow } from "@/lib/types";

/** National figures for the "India now" panel, derived from `metrics` (+ history for the sparkline). */
export interface Vitals {
  power: { demand: number | null; demandYesterday: number | null; price: number | null; observedAt: string | null; history: number[] };
  worstAir: { city: string; state: string | null; aqi: number; modelled: boolean }[];
  mandi: { commodity: string; price: number; observedAt: string }[];
  /** Aircraft in the India airspace box (OpenSky snapshot), null when no counts exist yet. */
  flights: { total: number; airborne: number; ground: number; observedAt: string } | null;
}

export const EMPTY_VITALS: Vitals = {
  power: { demand: null, demandYesterday: null, price: null, observedAt: null, history: [] },
  worstAir: [],
  mandi: [],
  flights: null,
};

type Row = Pick<MetricRow, "key" | "region" | "label" | "value" | "state" | "observed_at"> & { meta?: unknown };

/** Pure: metric rows + demand history → vitals. Stale power readings (>2h) are dropped. */
export function buildVitals(rows: readonly Row[], history: readonly { value: number }[], now = Date.now()): Vitals {
  const national = (key: string) => rows.find((r) => r.key === key && r.region === "IN");
  const demand = national("power.demand");
  const fresh = demand && now - Date.parse(demand.observed_at) < 2 * 3600_000;

  // Worst reading per city.
  const byCity = new Map<string, Vitals["worstAir"][number]>();
  for (const r of rows) {
    if (r.key !== "aqi") continue;
    const meta = (r.meta ?? {}) as { city?: string; modelled?: boolean };
    const city = meta.city ?? r.label;
    const prev = byCity.get(city);
    if (!prev || r.value > prev.aqi) byCity.set(city, { city, state: r.state, aqi: Math.round(r.value), modelled: Boolean(meta.modelled) });
  }

  const fTotal = national("flights.total");
  const fAir = national("flights.airborne");
  const fGround = national("flights.ground");

  return {
    power: {
      demand: fresh ? demand.value : null,
      demandYesterday: national("power.demand_yesterday")?.value ?? null,
      price: fresh ? (national("power.price")?.value ?? null) : null,
      observedAt: fresh ? demand.observed_at : null,
      history: history.map((h) => h.value),
    },
    worstAir: [...byCity.values()].sort((a, b) => b.aqi - a.aqi).slice(0, 5),
    mandi: rows
      .filter((r) => r.key.startsWith("mandi:") && r.region === "IN")
      .map((r) => ({ commodity: r.key.slice("mandi:".length), price: Math.round(r.value), observedAt: r.observed_at }))
      .sort((a, b) => a.commodity.localeCompare(b.commodity)),
    flights:
      fTotal && fAir && fGround
        ? { total: fTotal.value, airborne: fAir.value, ground: fGround.value, observedAt: fTotal.observed_at }
        : null,
  };
}
