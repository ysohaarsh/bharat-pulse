import "server-only";
import type { Json } from "@/lib/database.types";
import { translatePendingEvents } from "@/lib/i18n/translate";
import { fetchFlights, flightMetrics } from "@/lib/jobs/flights";
import { fetchMandi, mandiMetrics } from "@/lib/jobs/mandi";
import { ASSEMBLIES, fetchAssembly, mlasFromWikipedia } from "@/lib/jobs/mla";
import { fetchOverpass, MIN_ATTEMPT_MS, parseOsmPayload, projectsFromOverpass, RUN_BUDGET_MS, statesForRun } from "@/lib/jobs/osm";
import { fetchPower, powerMetrics } from "@/lib/jobs/power";
import { fetchSansad, representativesFromSansad } from "@/lib/jobs/sansad";
import { createAdminClient } from "@/lib/supabase/admin";
import { JOBS, SOURCES, type Job, type MetricRow, type Source } from "@/lib/types";
import { INGESTERS } from "./registry";

export const RUNNABLE = [...SOURCES, ...JOBS, "translate"] as const;
export type Runnable = (typeof RUNNABLE)[number];

export function isRunnable(s: string): s is Runnable {
  return (RUNNABLE as readonly string[]).includes(s);
}

export interface IngestResult {
  source: Runnable;
  fetched: number;
  metrics?: number;
  detail?: unknown;
  error?: string;
}

type Admin = ReturnType<typeof createAdminClient>;

async function upsertMetrics(db: Admin, rows: MetricRow[], { history = false, now = new Date().toISOString() } = {}) {
  if (rows.length === 0) return;
  const { error } = await db.from("metrics").upsert(
    rows.map((m) => ({ ...m, meta: (m.meta ?? {}) as Json, updated_at: now })),
    { onConflict: "key,region" },
  );
  if (error) throw new Error(`metrics: ${error.message}`);
  if (history) {
    const national = rows.filter((m) => m.region === "IN");
    if (national.length) {
      const { error: hErr } = await db.from("metric_history").upsert(
        national.map((m) => ({ key: m.key, region: m.region, value: m.value, observed_at: m.observed_at })),
        { onConflict: "key,region,observed_at", ignoreDuplicates: true },
      );
      if (hErr) throw new Error(`metric_history: ${hErr.message}`);
    }
  }
}

/** A CPCB run must see at least this many stations before missing ones are treated as gone. */
export const AQI_PRUNE_MIN_STATIONS = 100;

/**
 * Drop 'aqi' panel rows this run didn't touch (stations CPCB no longer reports, or modelled city
 * rows after CPCB came back). CPCB runs prune only when they saw >= 100 stations, so a partial
 * outage doesn't wipe the panel; the Open-Meteo fallback replaces all rows (never mixed).
 */
export async function pruneStaleAqi(db: Admin, raw: unknown, count: number, runStart: string): Promise<number> {
  const kind = (raw as { kind?: string } | null)?.kind;
  if (count === 0) return 0;
  if (kind === "cpcb" && count < AQI_PRUNE_MIN_STATIONS) return 0;
  if (kind !== "cpcb" && kind !== "openmeteo") return 0;
  const { data, error } = await db.from("metrics").delete().eq("key", "aqi").lt("updated_at", runStart).select("region");
  if (error) throw new Error(`metrics prune: ${error.message}`);
  return data?.length ?? 0;
}

/** Fetch + normalize + upsert one event source. Idempotent thanks to unique (source, external_id). */
async function runIngester(source: Source, db: Admin): Promise<IngestResult> {
  const ingester = INGESTERS[source];
  const raw = await ingester.fetchRaw();
  const events = ingester.normalize(raw);
  if (events.length > 0) {
    const { error } = await db
      .from("events")
      .upsert(
        events.map((e) => ({ ...e, raw: e.raw as Json })),
        { onConflict: "source,external_id", ignoreDuplicates: ingester.insertOnly ?? false },
      );
    if (error) throw new Error(error.message);
  }
  const metrics = ingester.metrics?.(raw) ?? [];
  const runStart = new Date().toISOString();
  await upsertMetrics(db, metrics, { now: runStart });
  const pruned = source === "aqi" ? await pruneStaleAqi(db, raw, metrics.length, runStart) : undefined;
  return { source, fetched: events.length, metrics: metrics.length, ...(pruned !== undefined ? { detail: { pruned } } : {}) };
}

async function runJob(job: Job | "translate", db: Admin, payload?: unknown): Promise<IngestResult> {
  switch (job) {
    case "power": {
      const rows = powerMetrics(await fetchPower(), new Date().toISOString());
      await upsertMetrics(db, rows, { history: true });
      return { source: job, fetched: 0, metrics: rows.length };
    }
    case "flights": {
      // OpenSky refuses Vercel's IPs, so the GitHub "Flights relay" workflow fetches and POSTs the payload.
      const { counts, positions } = flightMetrics(payload ?? (await fetchFlights()), new Date().toISOString());
      if (!positions) throw new Error("OpenSky returned an unreadable payload");
      await upsertMetrics(db, counts, { history: true });
      await upsertMetrics(db, [positions]);
      return { source: job, fetched: positions.value, metrics: counts.length + 1 };
    }
    case "mandi": {
      const rows = (await fetchMandi()).flatMap(({ commodity, records, prev }) => mandiMetrics(commodity, records, prev));
      await upsertMetrics(db, rows, { history: true });
      return { source: job, fetched: 0, metrics: rows.length };
    }
    case "sansad": {
      const { data: pcs, error } = await db.from("boundaries").select("code, name, state_code").eq("kind", "pc");
      if (error) throw new Error(error.message);
      if (!pcs?.length) throw new Error("No Lok Sabha boundaries loaded — run `npm run geo:load` first");
      const reps = representativesFromSansad(await fetchSansad(), pcs);
      if (reps.length < 500) throw new Error(`sansad.in returned only ${reps.length} sitting MPs; not replacing data`);
      const now = new Date().toISOString();
      const { error: upErr } = await db
        .from("representatives")
        .upsert(reps.map((r) => ({ ...r, refreshed_at: now })), { onConflict: "house,external_id" });
      if (upErr) throw new Error(upErr.message);
      // MPs no longer sitting (died, resigned, disqualified) drop out.
      const { error: delErr } = await db.from("representatives").delete().eq("house", "ls").lt("refreshed_at", now);
      if (delErr) throw new Error(delErr.message);
      return { source: job, fetched: reps.length, detail: { unmatched: reps.filter((r) => !r.boundary_code).map((r) => r.constituency) } };
    }
    case "mla": {
      // One state at a time (polite to Wikipedia); a state whose page looks wrong keeps its old rows.
      // Wikipedia throttles bursts and the function has RUN_BUDGET_MS, so states go stalest-first
      // with a pause between them; whatever doesn't fit is first in line on the next run.
      const lastRefresh = await Promise.all(
        ASSEMBLIES.map(async (a) => {
          const { data } = await db
            .from("representatives")
            .select("refreshed_at")
            .eq("house", "vs")
            .eq("state_code", a.state)
            .order("refreshed_at", { ascending: false })
            .limit(1);
          return data?.[0]?.refreshed_at ?? "";
        }),
      );
      const queue = ASSEMBLIES.map((a, i) => ({ a, at: lastRefresh[i] })).sort((x, y) => x.at.localeCompare(y.at));
      const started = Date.now();
      const loaded: Record<string, number> = {};
      const failed: string[] = [];
      const skipped: string[] = [];
      for (const [i, { a: assembly }] of queue.entries()) {
        if (Date.now() - started > RUN_BUDGET_MS - 8_000) {
          skipped.push(...queue.slice(i).map((q) => q.a.state));
          break;
        }
        if (i > 0) await new Promise((r) => setTimeout(r, 1_500));
        try {
          const { data: acs, error } = await db.from("boundaries").select("code, name, state_code").eq("kind", "ac").eq("state_code", assembly.state);
          if (error) throw new Error(error.message);
          const rows = mlasFromWikipedia(await fetchAssembly(assembly), assembly, acs ?? []);
          if (rows.length < assembly.seats * 0.9) throw new Error(`only ${rows.length}/${assembly.seats} sitting MLAs parsed; not replacing data`);
          const now = new Date().toISOString();
          const { error: upErr } = await db
            .from("representatives")
            .upsert(rows.map((r) => ({ ...r, refreshed_at: now })), { onConflict: "house,external_id" });
          if (upErr) throw new Error(upErr.message);
          // Seats that fell vacant drop out.
          const { error: delErr } = await db
            .from("representatives")
            .delete()
            .eq("house", "vs")
            .eq("state_code", assembly.state)
            .lt("refreshed_at", now);
          if (delErr) throw new Error(delErr.message);
          loaded[assembly.state] = rows.length;
        } catch (err) {
          failed.push(`${assembly.state}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      const fetched = Object.values(loaded).reduce((a, b) => a + b, 0);
      if (fetched === 0) throw new Error(`mla: no state loaded (${failed.join("; ")})`);
      return { source: job, fetched, detail: { loaded, failed, skipped } };
    }
    case "osm": {
      // Overpass times out from Vercel's IPs, so the GitHub "OSM relay" workflow runs the queries and POSTs
      // the results. Without a payload (local dev / manual call) fall back to fetching directly.
      const posted = payload === undefined ? null : parseOsmPayload(payload);
      if (payload !== undefined && !posted) throw new Error("osm: unreadable relay payload");
      const results: { state: string; result: PromiseSettledResult<ReturnType<typeof projectsFromOverpass>> }[] = [];
      const queue: string[] = [];
      if (posted) {
        for (const [s, raw] of Object.entries(posted)) {
          results.push({ state: s, result: { status: "fulfilled", value: projectsFromOverpass(s, raw) } });
        }
      } else {
        queue.push(...statesForRun(new Date()));
        // Two workers (Overpass gives each IP two concurrent slots) pull states until the run budget
        // is spent; states left over are retried when the rotation comes round again.
        const deadline = Date.now() + RUN_BUDGET_MS;
        const worker = async () => {
          while (queue.length && deadline - Date.now() > MIN_ATTEMPT_MS) {
            const s = queue.shift()!;
            const [result] = await Promise.allSettled([fetchOverpass(s, deadline).then((raw) => projectsFromOverpass(s, raw))]);
            results.push({ state: s, result });
          }
        };
        await Promise.all([worker(), worker()]);
      }
      const rows = results.flatMap(({ result: r }) => (r.status === "fulfilled" ? r.value : []));
      if (rows.length) {
        const now = new Date().toISOString();
        const { error } = await db
          .from("projects")
          .upsert(rows.map((p) => ({ ...p, meta: p.meta as Json, last_seen: now })), { onConflict: "source,external_id" });
        if (error) throw new Error(error.message);
      }
      const failed = results.flatMap(({ state, result: r }) => (r.status === "rejected" ? [`${state}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`] : []));
      const skipped = queue;
      if (rows.length === 0 && failed.length > 0) throw new Error(`osm: every state failed (${failed.join("; ")})`);
      return { source: job, fetched: rows.length, detail: { states: results.map((r) => r.state), failed, skipped } };
    }
    case "translate": {
      const detail = await translatePendingEvents(db);
      return { source: job, fetched: detail.translated, detail };
    }
  }
}

/** `payload` lets a caller hand over data it fetched itself (the GitHub flights relay). */
export async function runSource(name: Runnable, payload?: unknown): Promise<IngestResult> {
  try {
    const db = createAdminClient();
    if ((SOURCES as readonly string[]).includes(name)) return await runIngester(name as Source, db);
    return await runJob(name as Job | "translate", db, payload);
  } catch (err) {
    return { source: name, fetched: 0, error: err instanceof Error ? err.message : String(err) };
  }
}
