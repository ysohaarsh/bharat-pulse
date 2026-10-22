import "server-only";
import { createClient } from "@/lib/supabase/server";
import { buildVitals, EMPTY_VITALS, type Vitals } from "./vitals";

/** Everything the "India now" panel shows. Never throws: an empty panel beats a broken page. */
export async function loadVitals(): Promise<Vitals> {
  try {
    const supabase = await createClient();
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const [rows, history] = await Promise.all([
      supabase
        .from("metrics")
        .select("key, region, label, value, state, observed_at, meta")
        // Flight counts only: the ~30 KB flights.positions row is read by the map layer on its own.
        .or("key.like.power.*,key.eq.aqi,key.like.mandi:*,key.in.(flights.total,flights.airborne,flights.ground)")
        .limit(2000),
      supabase
        .from("metric_history")
        .select("value, observed_at")
        .eq("key", "power.demand")
        .eq("region", "IN")
        .gte("observed_at", since)
        .order("observed_at", { ascending: true })
        .limit(200),
    ]);
    if (rows.error) throw new Error(rows.error.message);
    return buildVitals(rows.data ?? [], history.data ?? []);
  } catch (err) {
    console.error("[vitals] load failed:", err);
    return EMPTY_VITALS;
  }
}
