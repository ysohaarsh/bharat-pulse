import { expect, test } from "@playwright/test";

// These only exercise the auth/validation guards of POST /api/ingest.
// Never send a valid request: that would run ingestion and write to the database.
test.describe("POST /api/ingest", () => {
  test("rejects requests without auth (401)", async ({ request }) => {
    const res = await request.post("/api/ingest");
    expect(res.status()).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  test("rejects a wrong bearer token (401)", async ({ request }) => {
    const res = await request.post("/api/ingest?source=nope", {
      headers: { authorization: "Bearer definitely-not-the-secret" },
    });
    expect(res.status()).toBe(401);
  });

  test("rejects an unknown source with a valid secret (400)", async ({ request }) => {
    const secret = process.env.CRON_SECRET;
    test.skip(!secret, "CRON_SECRET not set");
    const res = await request.post("/api/ingest?source=nope", {
      headers: { authorization: `Bearer ${secret}` },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/unknown source/);
  });
});
