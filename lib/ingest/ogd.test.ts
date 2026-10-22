import { describe, expect, it } from "vitest";
import { fetchOgdPages } from "./ogd";

const page = (records: unknown[], extra: Record<string, unknown> = {}) =>
  ({ ok: true, status: 200, json: async () => ({ records, ...extra }) }) as Response;

describe("fetchOgdPages", () => {
  it("advances offset by what the server returned until total is reached (server caps limit)", async () => {
    const urls: string[] = [];
    const data = Array.from({ length: 25 }, (_, i) => ({ i }));
    const fetchFn = (async (u: string) => {
      urls.push(u);
      const off = Number(new URL(u).searchParams.get("offset"));
      return page(data.slice(off, off + 10), { total: 25, limit: 10 });
    }) as unknown as typeof fetch;
    const r = await fetchOgdPages((o) => `https://x.test/r?limit=4000&offset=${o}`, { fetchFn });
    expect(r).toMatchObject({ complete: true, calls: 3 });
    expect(r.records).toHaveLength(25);
    expect(urls.map((u) => new URL(u).searchParams.get("offset"))).toEqual(["0", "10", "20"]);
  });

  it("stops on a short page when total is missing, and caps the number of calls", async () => {
    const short = (async () => page([1, 2], { limit: 5 })) as unknown as typeof fetch;
    expect(await fetchOgdPages(() => "u", { fetchFn: short })).toMatchObject({ complete: true, calls: 1 });
    const endless = (async () => page([1, 2, 3, 4, 5], { total: 1000, limit: 5 })) as unknown as typeof fetch;
    expect(await fetchOgdPages(() => "u", { fetchFn: endless, maxCalls: 3 })).toMatchObject({ complete: false, calls: 3 });
  });

  it("throws if the first page fails but keeps earlier pages if a later one fails", async () => {
    const bad = (async () => ({ ok: false, status: 429 }) as Response) as unknown as typeof fetch;
    await expect(fetchOgdPages(() => "u", { fetchFn: bad })).rejects.toThrow("429");
    let n = 0;
    const flaky = (async () => (n++ === 0 ? page([1, 2], { total: 9, limit: 2 }) : ({ ok: false, status: 429 }) as Response)) as unknown as typeof fetch;
    const r = await fetchOgdPages(() => "u", { fetchFn: flaky });
    expect(r).toMatchObject({ complete: false, records: [1, 2] });
  });
});
