/**
 * Paged reader for data.gov.in (OGD) resources. Response: `{ total, count, limit, offset, records[] }`.
 * A personal key may cap `limit` below what we ask for (the public test key caps at 10), so we advance
 * `offset` by the number of records actually returned and stop when `total` is reached, a page comes
 * back empty, or (when `total` is missing) a page is shorter than the limit the server reports.
 */
export interface OgdPages {
  records: unknown[];
  /** False when a later page failed or the call cap was hit before `total`. */
  complete: boolean;
  calls: number;
}

export async function fetchOgdPages(
  pageUrl: (offset: number) => string,
  opts: { maxCalls?: number; timeoutMs?: number; fetchFn?: typeof fetch } = {},
): Promise<OgdPages> {
  const { maxCalls = 8, timeoutMs = 30_000, fetchFn = fetch } = opts;
  const records: unknown[] = [];
  let offset = 0;
  let calls = 0;
  while (calls < maxCalls) {
    calls++;
    let body: { records?: unknown[]; total?: number | string; limit?: number | string };
    try {
      const res = await fetchFn(pageUrl(offset), { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      body = await res.json();
    } catch (e) {
      if (calls === 1) throw e;
      return { records, complete: false, calls };
    }
    const page = Array.isArray(body.records) ? body.records : [];
    records.push(...page);
    offset += page.length;
    const total = Number(body.total);
    if (page.length === 0) return { records, complete: true, calls };
    if (Number.isFinite(total) && total > 0) {
      if (offset >= total) return { records, complete: true, calls };
    } else {
      const limit = Number(body.limit);
      if (Number.isFinite(limit) && limit > 0 && page.length < limit) return { records, complete: true, calls };
    }
  }
  return { records, complete: false, calls };
}
