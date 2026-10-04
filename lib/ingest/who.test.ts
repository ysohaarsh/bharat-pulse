import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeWho, WHO_URL, whoIngester, whoSeverity } from "./who";

const fixture = (): { value: Record<string, unknown>[] } =>
  JSON.parse(readFileSync(join(__dirname, "__fixtures__", "who.json"), "utf8"));

const NOW = Date.parse("2026-10-04T12:00:00Z"); // 60-day cutoff: 2026-08-05
const EARLIER = Date.parse("2026-07-20T00:00:00Z"); // 60-day cutoff: 2026-05-21

describe("whoSeverity", () => {
  it("is 3 by default", () => {
    expect(whoSeverity("Nipah virus disease - India", "One laboratory confirmed case.")).toBe(3);
    expect(whoSeverity("Cholera - Sudan", "120 cases including 3 deaths.")).toBe(3);
  });
  it("is 4 for multi-country titles or ≥ 10 reported deaths", () => {
    expect(whoSeverity("Ebola disease, Democratic Republic of the Congo & Uganda", null)).toBe(4);
    expect(whoSeverity("Hantavirus cluster linked to cruise ship travel, Multi-country", null)).toBe(4);
    expect(whoSeverity("Yellow fever - Global", null)).toBe(4);
    expect(whoSeverity("Cholera - Sudan", "1,204 cases including 37 deaths.")).toBe(4);
    expect(whoSeverity("Cholera - Sudan", "2124 confirmed cases, including 828 associated deaths")).toBe(4);
  });
  it("doesn't treat 'and' inside the disease name as multi-country", () => {
    expect(whoSeverity("Hand, foot and mouth disease - Viet Nam", null)).toBe(3);
  });
});

describe("normalizeWho", () => {
  it("keeps only posts from the last 60 days", () => {
    expect(normalizeWho(fixture(), NOW).map((e) => e.external_id)).toEqual(["2026-DON618", "2026-DON616"]);
  });

  it("maps a DON post", () => {
    const [e] = normalizeWho(fixture(), NOW);
    expect(e).toMatchObject({
      source: "who",
      external_id: "2026-DON618",
      title: "Ebola disease caused by Bundibugyo virus - Democratic Republic of the Congo",
      category: "health",
      country: "CD",
      lat: -4.44,
      lng: 15.27,
      url: "https://www.who.int/emergencies/disease-outbreak-news/item/2026-DON618",
      occurred_at: "2026-09-25T15:30:18.000Z",
    });
    expect(e.summary).toMatch(/^Since the last Disease Outbreak News was published/);
    expect(e.summary!.length).toBeLessThanOrEqual(280);
    expect(e.raw).toEqual({
      Title: e.title,
      UrlName: "2026-DON618",
      DonId: "2026-DON618",
      PublicationDate: "2026-09-25T15:30:18Z",
    });
  });

  it("detects countries from the title's location part", () => {
    const byId = Object.fromEntries(normalizeWho(fixture(), EARLIER).map((e) => [e.external_id, e]));
    expect(byId["2026-DON613"]).toMatchObject({ country: "CD", severity: 4 }); // "DRC & Uganda"
    expect(byId["2026-DON609"]).toMatchObject({ country: "IN", severity: 3, lat: 28.61 });
    expect(byId["2026-DON611"]).toMatchObject({ country: null, lat: null, lng: null, severity: 4 }); // Multi-locations
    expect(byId["2026-DON610"]).toMatchObject({ country: null, severity: 4 }); // Global
  });

  it("prefers the location after the dash over nationality words in the disease name", () => {
    const out = normalizeWho(
      {
        value: [
          {
            Title: "Japanese encephalitis - Australia",
            UrlName: "2026-DON700",
            PublicationDate: "2026-10-01T00:00:00Z",
            Summary: "<p>Two cases.</p>",
          },
        ],
      },
      NOW,
    );
    expect(out[0]).toMatchObject({ country: "AU", summary: "Two cases.", severity: 3 });
  });

  it("uses OverrideTitle only when UseOverrideTitle is set", () => {
    const base = { UrlName: "x-1", PublicationDate: "2026-10-01T00:00:00Z", Title: "Plain - Kenya" };
    const out = normalizeWho(
      {
        value: [
          { ...base, OverrideTitle: "Override - Uganda", UseOverrideTitle: true },
          { ...base, UrlName: "x-2", OverrideTitle: "Ignored - Uganda", UseOverrideTitle: false },
        ],
      },
      NOW,
    );
    expect(out.map((e) => [e.title, e.country])).toEqual([
      ["Override - Uganda", "UG"],
      ["Plain - Kenya", "KE"],
    ]);
  });

  it("skips invalid items and dedupes by UrlName", () => {
    const ok = { Title: "Mpox - Kenya", UrlName: "2026-DON701", PublicationDate: "2026-10-01T00:00:00Z" };
    const out = normalizeWho(
      {
        value: [
          null,
          ok,
          ok,
          { ...ok, UrlName: "../../evil" },
          { ...ok, UrlName: "2026-DON702", PublicationDate: "nope" },
          { ...ok, UrlName: "2026-DON703", Title: "  " },
          { ...ok, UrlName: undefined },
        ],
      },
      NOW,
    );
    expect(out.map((e) => e.external_id)).toEqual(["2026-DON701"]);
    expect(out[0].summary).toBeNull();
    expect(normalizeWho(null, NOW)).toEqual([]);
    expect(normalizeWho({ value: 3 }, NOW)).toEqual([]);
  });
});

describe("whoIngester.fetchRaw", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("requests the newest posts with a trimmed field list and throws on non-2xx", async () => {
    expect(WHO_URL).toContain("$top=20");
    expect(WHO_URL).toContain("$orderby=PublicationDate%20desc");
    expect(WHO_URL).toContain("$select=");

    const fetchMock = vi.fn(async () => new Response(JSON.stringify(fixture()), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const raw = await whoIngester.fetchRaw();
    expect(fetchMock).toHaveBeenCalledWith(WHO_URL, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(raw).toEqual(fixture());

    vi.stubGlobal("fetch", vi.fn(async () => new Response("err", { status: 500 })));
    await expect(whoIngester.fetchRaw()).rejects.toThrow(/500/);
  });
});
