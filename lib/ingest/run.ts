import "server-only";
import type { Json } from "@/lib/database.types";
import { translatePendingEvents } from "@/lib/i18n/translate";
import { fetchMandi, mandiMetrics } from "@/lib/jobs/mandi";
import { ASSEMBLIES, fetchAssembly, mlasFromWikipedia } from "@/lib/jobs/mla";
import { fetchOverpass, OVERPASS_TIMEOUT_MS, projectsFromOverpass, RUN_BUDGET_MS, statesForRun } from "@/lib/jobs/osm";
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

async function upsertMetrics(db: Admin, rows: MetricRow[], { history = false } = {}) {
  if (rows.length === 0) return;
  const now = new Date().toISOString();
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
  await upsertMetrics(db, metrics);
  return { source, fetched: events.length, metrics: metrics.length };
}

async function runJob(job: Job | "translate", db: Admin): Promise<IngestResult> {
  switch (job) {
    case "power": {
      const rows = powerMetrics(await fetchPower(), new Date().toISOString());
      await upsertMetrics(db, rows, { history: true });
      return { source: job, fetched: 0, metrics: rows.length };
    }
    case "mandi": {
      const rows = (await fetchMandi()).flatMap(({ commodity, records }) => mandiMetrics(commodity, records));
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
      const loaded: Record<string, number> = {};
      const failed: string[] = [];
      for (const assembly of ASSEMBLIES) {
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
      return { source: job, fetched, detail: { loaded, failed } };
    }
    case "osm": {
      const states = statesForRun(new Date());
      const started = Date.now();
      // Two at a time (Overpass gives each IP two concurrent slots), within the run budget;
      // states left over are retried when the rotation comes round again.
      const results: PromiseSettledResult<ReturnType<typeof projectsFromOverpass>>[] = [];
      for (let i = 0; i < states.length && Date.now() - started < RUN_BUDGET_MS - OVERPASS_TIMEOUT_MS; i += 2) {
        results.push(
          ...(await Promise.allSettled(states.slice(i, i + 2).map(async (s) => projectsFromOverpass(s, await fetchOverpass(s))))),
        );
      }
      const rows = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
      if (rows.length) {
        const now = new Date().toISOString();
        const { error } = await db
          .from("projects")
          .upsert(rows.map((p) => ({ ...p, meta: p.meta as Json, last_seen: now })), { onConflict: "source,external_id" });
        if (error) throw new Error(error.message);
      }
      const failed = results.flatMap((r, i) => (r.status === "rejected" ? [`${states[i]}: ${String(r.reason)}`] : []));
      return { source: job, fetched: rows.length, detail: { states: states.slice(0, results.length), failed } };
    }
    case "translate": {
      const detail = await translatePendingEvents(db);
      return { source: job, fetched: detail.translated, detail };
    }
  }
}

export async function runSource(name: Runnable): Promise<IngestResult> {
  try {
    const db = createAdminClient();
    if ((SOURCES as readonly string[]).includes(name)) return await runIngester(name as Source, db);
    return await runJob(name as Job | "translate", db);
  } catch (err) {
    return { source: name, fetched: 0, error: err instanceof Error ? err.message : String(err) };
  }
}
