import "server-only";
import type { Json } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Source } from "@/lib/types";
import { INGESTERS } from "./registry";

export interface IngestResult {
  source: Source;
  fetched: number;
  error?: string;
}

/** Fetch + normalize + upsert one source. Idempotent thanks to unique (source, external_id). */
export async function runIngester(source: Source): Promise<IngestResult> {
  const ingester = INGESTERS[source];
  try {
    const events = ingester.normalize(await ingester.fetchRaw());
    if (events.length > 0) {
      const { error } = await createAdminClient()
        .from("events")
        .upsert(events.map((e) => ({ ...e, raw: e.raw as Json })), { onConflict: "source,external_id" });
      if (error) throw new Error(error.message);
    }
    return { source, fetched: events.length };
  } catch (err) {
    return { source, fetched: 0, error: err instanceof Error ? err.message : String(err) };
  }
}
