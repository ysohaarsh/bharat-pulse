import type { MetricRow, NormalizedEvent, Source } from "@/lib/types";

/**
 * Every event source implements this. Keep `normalize` (and `metrics`) pure (no I/O) so they
 * can be unit-tested against fixtures in `lib/ingest/__fixtures__/<source>.*`.
 */
export interface Ingester<Raw = unknown> {
  source: Source;
  fetchRaw(): Promise<Raw>;
  normalize(raw: Raw): NormalizedEvent[];
  /**
   * Sources without publish dates (PIB) stamp items with the fetch time; insert-only keeps
   * the first-seen time instead of bumping `occurred_at` on every run.
   */
  insertOnly?: boolean;
  /** Optional panel readings derived from the same payload (AQI stations). */
  metrics?(raw: Raw): MetricRow[];
}
