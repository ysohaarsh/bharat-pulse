import type { NormalizedEvent, Source } from "@/lib/types";

/**
 * Every data source implements this. Keep `normalize` pure (no I/O) so it can be
 * unit-tested against fixtures in `lib/ingest/__fixtures__/<source>.json`.
 */
export interface Ingester<Raw = unknown> {
  source: Source;
  fetchRaw(): Promise<Raw>;
  normalize(raw: Raw): NormalizedEvent[];
}
