import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Category, Severity, Source } from "@/lib/types";
import { buildExtractiveBrief, EXTRACTIVE_MODEL } from "./fallback";
import { defaultPeriod, periodEndingAt } from "./period";
import { buildBriefPrompt } from "./prompt";
import { completeChat, llmConfigFromEnv } from "./provider";
import { selectEvents } from "./select";
import { HIGH_SEVERITY, type BriefEvent } from "./types";

export const WORLD_SCOPE = "world";
/** Upper bound on rows loaded for selection (most severe/recent first). */
const LOAD_LIMIT = 1000;

export interface GenerateOptions {
  /** Regenerate even if a brief for this period already exists. */
  force?: boolean;
  /** Override the period end (testing/backfill). Defaults to the last full UTC hour. */
  periodEnd?: Date;
}

export interface GenerateResult {
  scope: string;
  period_start: string;
  period_end: string;
  model: string;
  chars: number;
  /** True when an existing brief was returned without regenerating. */
  cached: boolean;
  /** Set when the LLM call failed and the extractive fallback was used. */
  llm_error?: string;
}

/** Load events → select → LLM (or extractive fallback) → upsert into briefs on (scope, period_start). */
export async function generateWorldBrief({ force = false, periodEnd }: GenerateOptions = {}): Promise<GenerateResult> {
  const { start, end } = periodEnd ? periodEndingAt(periodEnd) : defaultPeriod();
  const period_start = start.toISOString();
  const period_end = end.toISOString();
  const db = createAdminClient();

  if (!force) {
    const { data: existing, error } = await db
      .from("briefs")
      .select("content, model")
      .eq("scope", WORLD_SCOPE)
      .eq("period_start", period_start)
      .maybeSingle();
    if (error) throw new Error(`Failed to check existing brief: ${error.message}`);
    if (existing) {
      return {
        scope: WORLD_SCOPE,
        period_start,
        period_end,
        model: existing.model ?? "unknown",
        chars: existing.content.length,
        cached: true,
      };
    }
  }

  // Half-open window [start, end) so consecutive periods don't double count.
  const [rowsRes, highRes] = await Promise.all([
    db
      .from("events")
      .select("id, title, category, severity, country, occurred_at, source", { count: "exact" })
      .gte("occurred_at", period_start)
      .lt("occurred_at", period_end)
      // Sports is an opt-in side feed: never part of the World Brief (selectEvents drops it too).
      .neq("category", "sports")
      .neq("source", "sports")
      .order("severity", { ascending: false })
      .order("occurred_at", { ascending: false })
      .limit(LOAD_LIMIT),
    db
      .from("events")
      .select("id", { count: "exact", head: true })
      .gte("occurred_at", period_start)
      .lt("occurred_at", period_end)
      .neq("category", "sports")
      .neq("source", "sports")
      .gte("severity", HIGH_SEVERITY),
  ]);
  if (rowsRes.error) throw new Error(`Failed to load events: ${rowsRes.error.message}`);
  if (highRes.error) throw new Error(`Failed to count events: ${highRes.error.message}`);

  const events: BriefEvent[] = (rowsRes.data ?? []).map((r) => ({
    ...r,
    category: r.category as Category,
    severity: r.severity as Severity,
    source: r.source as Source,
  }));
  const selected = selectEvents(events);
  const stats = { total: rowsRes.count ?? events.length, highSeverity: highRes.count ?? 0 };

  let content: string;
  let model: string;
  let llm_error: string | undefined;
  const config = llmConfigFromEnv();
  if (config && selected.length > 0) {
    try {
      ({ content, model } = await completeChat(buildBriefPrompt({ events: selected, periodStart: period_start, periodEnd: period_end }), config));
    } catch (err) {
      llm_error = err instanceof Error ? err.message : String(err);
      console.error("[brief] LLM failed, using extractive fallback:", llm_error);
      content = buildExtractiveBrief(selected, stats);
      model = EXTRACTIVE_MODEL;
    }
  } else {
    content = buildExtractiveBrief(selected, stats);
    model = EXTRACTIVE_MODEL;
  }

  const { error: upsertError } = await db
    .from("briefs")
    .upsert(
      { scope: WORLD_SCOPE, period_start, period_end, content, model, created_at: new Date().toISOString() },
      { onConflict: "scope,period_start" },
    );
  if (upsertError) throw new Error(`Failed to save brief: ${upsertError.message}`);

  return { scope: WORLD_SCOPE, period_start, period_end, model, chars: content.length, cached: false, ...(llm_error ? { llm_error } : {}) };
}
