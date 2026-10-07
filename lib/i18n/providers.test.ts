import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bhashiniConfigHiEn, bhashiniComputeHiEn, sarvamError, sarvamOk } from "./__fixtures__/translation";

vi.mock("server-only", () => ({}));

const { bhashiniProvider, sarvamProvider, translationProviders, resetBhashiniCache, sarvamCode } = await import("./providers");
const { translateCached } = await import("./translate");

const CONFIG_URL = "https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline";
const COMPUTE_URL = bhashiniConfigHiEn.pipelineInferenceAPIEndPoint.callbackUrl;
const SARVAM_URL = "https://api.sarvam.ai/translate";
const HI = ["दिल्ली में भारी बारिश की चेतावनी", "गुजरात में भूकंप"];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type Route = (init: RequestInit) => Response;
/** Stub global fetch with a per-URL handler; unknown URLs fail the test. */
function stubFetch(routes: Record<string, Route>) {
  const fn = vi.fn(async (url: string | URL, init: RequestInit = {}) => {
    const route = routes[String(url)];
    if (!route) throw new Error(`unexpected fetch ${String(url)}`);
    return route(init);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}
const bodyOf = (init: RequestInit) => JSON.parse(String(init.body));
const headersOf = (init: RequestInit) => init.headers as Record<string, string>;

beforeEach(() => {
  resetBhashiniCache();
  vi.stubEnv("BHASHINI_USER_ID", "test-user");
  vi.stubEnv("BHASHINI_ULCA_API_KEY", "test-ulca-key");
  vi.stubEnv("SARVAM_API_KEY", "test-sarvam-key");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("provider selection", () => {
  it("orders Bhashini before Sarvam and skips unconfigured ones", () => {
    expect(translationProviders().map((p) => p.name)).toEqual(["bhashini", "sarvam"]);
    vi.stubEnv("BHASHINI_ULCA_API_KEY", "");
    expect(translationProviders().map((p) => p.name)).toEqual(["sarvam"]);
    vi.stubEnv("SARVAM_API_KEY", "");
    expect(translationProviders()).toEqual([]);
  });
});

describe("bhashiniProvider", () => {
  it("runs config then compute with the documented headers and payloads", async () => {
    const fetch = stubFetch({
      [CONFIG_URL]: () => json(bhashiniConfigHiEn),
      [COMPUTE_URL]: () => json(bhashiniComputeHiEn),
    });
    const out = await bhashiniProvider()!.translate(HI, "hi", "en");
    expect(out).toEqual(["Heavy rain warning in Delhi", "Earthquake in Gujarat"]);

    const [, configInit] = fetch.mock.calls[0];
    expect(headersOf(configInit!)).toMatchObject({ userID: "test-user", ulcaApiKey: "test-ulca-key" });
    expect(bodyOf(configInit!)).toEqual({
      pipelineTasks: [{ taskType: "translation", config: { language: { sourceLanguage: "hi", targetLanguage: "en" } } }],
      pipelineRequestConfig: { pipelineId: "64392f96daac500b55c543cd" },
    });

    const [, computeInit] = fetch.mock.calls[1];
    expect(headersOf(computeInit!)).toMatchObject({ Authorization: "test-inference-key" });
    const compute = bodyOf(computeInit!);
    expect(compute.pipelineTasks[0].config.serviceId).toBe("ai4bharat/indictrans-v2-all-gpu--t4");
    expect(compute.inputData.input).toEqual(HI.map((source) => ({ source })));
  });

  it("caches the inference endpoint per language pair", async () => {
    const fetch = stubFetch({
      [CONFIG_URL]: () => json(bhashiniConfigHiEn),
      [COMPUTE_URL]: () => json(bhashiniComputeHiEn),
    });
    const p = bhashiniProvider()!;
    await p.translate(HI, "hi", "en");
    await p.translate(HI, "hi", "en");
    expect(fetch.mock.calls.filter(([u]) => String(u) === CONFIG_URL)).toHaveLength(1);
  });

  it("drops the cached endpoint when the inference key is rejected", async () => {
    let computeStatus = 401;
    const fetch = stubFetch({
      [CONFIG_URL]: () => json(bhashiniConfigHiEn),
      [COMPUTE_URL]: () => (computeStatus === 200 ? json(bhashiniComputeHiEn) : json({ detail: "expired" }, computeStatus)),
    });
    const p = bhashiniProvider()!;
    await expect(p.translate(HI, "hi", "en")).rejects.toThrow(/HTTP 401/);
    computeStatus = 200;
    await expect(p.translate(HI, "hi", "en")).resolves.toHaveLength(2);
    expect(fetch.mock.calls.filter(([u]) => String(u) === CONFIG_URL)).toHaveLength(2);
  });

  it("throws on config HTTP errors", async () => {
    stubFetch({ [CONFIG_URL]: () => json({ message: "Invalid ulcaApiKey" }, 401) });
    await expect(bhashiniProvider()!.translate(HI, "hi", "en")).rejects.toThrow(/config HTTP 401.*Invalid ulcaApiKey/);
  });

  it("throws when the config has no translation service", async () => {
    stubFetch({ [CONFIG_URL]: () => json({ ...bhashiniConfigHiEn, pipelineResponseConfig: [] }) });
    await expect(bhashiniProvider()!.translate(HI, "hi", "en")).rejects.toThrow(/no hi→en translation model/);
  });

  it("throws on a malformed config response", async () => {
    stubFetch({ [CONFIG_URL]: () => json({ pipelineInferenceAPIEndPoint: { callbackUrl: "not a url" } }) });
    await expect(bhashiniProvider()!.translate(HI, "hi", "en")).rejects.toThrow(/documented shape/);
  });

  it("throws on a malformed compute response instead of echoing the source", async () => {
    stubFetch({
      [CONFIG_URL]: () => json(bhashiniConfigHiEn),
      [COMPUTE_URL]: () => json({ pipelineResponse: [{ taskType: "translation", output: [{ source: HI[0] }] }] }),
    });
    await expect(bhashiniProvider()!.translate(HI, "hi", "en")).rejects.toThrow(/documented shape/);
  });

  it("throws when the output count differs or a target is blank", async () => {
    const short = { pipelineResponse: [{ ...bhashiniComputeHiEn.pipelineResponse[0], output: [bhashiniComputeHiEn.pipelineResponse[0].output[0]] }] };
    stubFetch({ [CONFIG_URL]: () => json(bhashiniConfigHiEn), [COMPUTE_URL]: () => json(short) });
    await expect(bhashiniProvider()!.translate(HI, "hi", "en")).rejects.toThrow(/different number/);

    const blank = { pipelineResponse: [{ taskType: "translation", output: [{ target: " " }, { target: "x" }] }] };
    stubFetch({ [CONFIG_URL]: () => json(bhashiniConfigHiEn), [COMPUTE_URL]: () => json(blank) });
    await expect(bhashiniProvider()!.translate(HI, "hi", "en")).rejects.toThrow(/empty translation/);
  });
});

describe("sarvamProvider", () => {
  it("sends one documented request per text", async () => {
    const replies = ["Heavy rain warning in Delhi", "Earthquake in Gujarat"];
    const fetch = stubFetch({ [SARVAM_URL]: () => json(sarvamOk(replies.shift()!)) });
    const out = await sarvamProvider()!.translate(HI, "hi", "en");
    expect(out).toEqual(["Heavy rain warning in Delhi", "Earthquake in Gujarat"]);
    expect(fetch).toHaveBeenCalledTimes(2);
    const [, init] = fetch.mock.calls[0];
    expect(headersOf(init!)).toMatchObject({ "api-subscription-key": "test-sarvam-key" });
    expect(bodyOf(init!)).toEqual({
      input: HI[0],
      source_language_code: "hi-IN",
      target_language_code: "en-IN",
      model: "sarvam-translate:v1",
    });
  });

  it("maps ISO codes to Sarvam's BCP-47 codes (Odia is od-IN)", () => {
    expect(sarvamCode("or")).toBe("od-IN");
    expect(sarvamCode("ta")).toBe("ta-IN");
  });

  it("throws on HTTP errors with the error message", async () => {
    stubFetch({ [SARVAM_URL]: () => json(sarvamError, 403) });
    await expect(sarvamProvider()!.translate(HI, "hi", "en")).rejects.toThrow(/HTTP 403.*Invalid API key/);
  });

  it("throws on malformed or empty responses instead of echoing the source", async () => {
    stubFetch({ [SARVAM_URL]: () => json({ request_id: "x", output: "Heavy rain" }) });
    await expect(sarvamProvider()!.translate(HI, "hi", "en")).rejects.toThrow(/documented shape/);
    stubFetch({ [SARVAM_URL]: () => json(sarvamOk("  ")) });
    await expect(sarvamProvider()!.translate(HI, "hi", "en")).rejects.toThrow(/empty translation/);
  });

  it("refuses inputs over the 2000-char model limit without calling the API", async () => {
    const fetch = stubFetch({});
    await expect(sarvamProvider()!.translate(["क".repeat(2001)], "hi", "en")).rejects.toThrow(/2000/);
    expect(fetch).not.toHaveBeenCalled();
  });
});

/** Minimal stand-in for the Supabase `translations` table calls made by translateCached. */
function fakeDb() {
  const rows: { hash: string; lang: string; text: string; provider: string }[] = [];
  const db = {
    from: () => ({
      select: () => ({ eq: () => ({ in: async () => ({ data: [] }) }) }),
      upsert: async (r: typeof rows) => {
        rows.push(...r);
        return {};
      },
    }),
  };
  return { db: db as unknown as Parameters<typeof translateCached>[0], rows };
}

describe("Bhashini → Sarvam fallback (translateCached)", () => {
  it("falls through to Sarvam when Bhashini fails, and caches Sarvam's output", async () => {
    const replies = ["Heavy rain warning in Delhi", "Earthquake in Gujarat"];
    const fetch = stubFetch({
      [CONFIG_URL]: () => json({ message: "service unavailable" }, 503),
      [SARVAM_URL]: () => json(sarvamOk(replies.shift()!)),
    });
    const { db, rows } = fakeDb();
    const out = await translateCached(db, HI, "hi", "en");
    expect(out).toEqual(["Heavy rain warning in Delhi", "Earthquake in Gujarat"]);
    expect(rows.map((r) => r.provider)).toEqual(["sarvam", "sarvam"]);
    expect(fetch.mock.calls.map(([u]) => String(u))).toEqual([CONFIG_URL, SARVAM_URL, SARVAM_URL]);
  });

  it("falls through on a malformed Bhashini response too", async () => {
    stubFetch({
      [CONFIG_URL]: () => json(bhashiniConfigHiEn),
      [COMPUTE_URL]: () => json({ unexpected: true }),
      [SARVAM_URL]: () => json(sarvamOk("translated")),
    });
    const { db, rows } = fakeDb();
    expect(await translateCached(db, [HI[0]], "hi", "en")).toEqual(["translated"]);
    expect(rows[0].provider).toBe("sarvam");
  });

  it("uses Bhashini alone when it succeeds", async () => {
    const fetch = stubFetch({
      [CONFIG_URL]: () => json(bhashiniConfigHiEn),
      [COMPUTE_URL]: () => json(bhashiniComputeHiEn),
    });
    const { db, rows } = fakeDb();
    await translateCached(db, HI, "hi", "en");
    expect(rows.map((r) => r.provider)).toEqual(["bhashini", "bhashini"]);
    expect(fetch.mock.calls.some(([u]) => String(u) === SARVAM_URL)).toBe(false);
  });

  it("returns nulls and caches nothing when every provider fails", async () => {
    stubFetch({
      [CONFIG_URL]: () => json({}, 500),
      [SARVAM_URL]: () => json(sarvamError, 429),
    });
    const { db, rows } = fakeDb();
    expect(await translateCached(db, HI, "hi", "en")).toEqual([null, null]);
    expect(rows).toEqual([]);
  });
});
