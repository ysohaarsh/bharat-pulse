import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonFixture } from "@/lib/test/fixtures";

vi.mock("server-only", () => ({}));

const upserts: { table: string; rows: Record<string, unknown>[]; opts: unknown }[] = [];
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      upsert: async (rows: Record<string, unknown>[], opts: unknown) => {
        upserts.push({ table, rows, opts });
        return { error: null };
      },
    }),
  }),
}));

const { runSource } = await import("./run");

describe("osm job with a relay payload", () => {
  beforeEach(() => {
    upserts.length = 0;
    vi.stubGlobal("fetch", () => {
      throw new Error("must not fetch Overpass when a payload is posted");
    });
  });

  it("upserts projects from the posted per-state results without fetching", async () => {
    const ka = jsonFixture("osm.ka.json");
    const res = await runSource("osm", { states: { "IN-KA": ka, "IN-GA": { elements: [] } } });
    expect(res.error).toBeUndefined();
    expect(res.fetched).toBeGreaterThan(0);
    expect(res.detail).toMatchObject({ states: ["IN-KA", "IN-GA"], failed: [], skipped: [] });
    expect(upserts).toHaveLength(1);
    expect(upserts[0].table).toBe("projects");
    expect(upserts[0].opts).toEqual({ onConflict: "source,external_id" });
    expect(upserts[0].rows.length).toBe(res.fetched);
    expect(upserts[0].rows.every((r) => r.source === "osm" && r.state === "IN-KA" && r.last_seen)).toBe(true);
  });

  it("rejects an unreadable payload instead of silently fetching", async () => {
    const res = await runSource("osm", { nope: 1 });
    expect(res.error).toMatch(/unreadable relay payload/);
    expect(upserts).toHaveLength(0);
  });
});
