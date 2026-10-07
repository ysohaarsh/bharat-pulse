import "server-only";
import { z } from "zod";

/**
 * India-built machine translation, in order of preference:
 *  1. Bhashini (MeitY's National Language Translation Mission) — free for low volume.
 *     Register at bhashini.gov.in/ulca → profile → generate key. Env: BHASHINI_USER_ID,
 *     BHASHINI_ULCA_API_KEY. Two-step: ask ULCA for the pipeline's inference endpoint + key
 *     (cached per process), then call it.
 *     Docs: https://bhashini.gitbook.io/bhashini-apis (pipeline-config-call, pipeline-compute-call)
 *  2. Sarvam AI — ₹100 free credits on signup, then paid. Env: SARVAM_API_KEY.
 *     Docs: https://docs.sarvam.ai/api-reference/text/translate-text
 * Callers go through lib/i18n/translate.ts, which caches in the DB and falls through to the
 * next provider when one throws. Providers therefore throw on *any* doubtful response (HTTP
 * error, schema mismatch, empty output) instead of returning the source text, which would be
 * cached forever as a "translation".
 */

export interface TranslationProvider {
  name: string;
  /** Translate `texts` from `source` to `target` (ISO 639-1). Same length/order as input. */
  translate(texts: string[], source: string, target: string): Promise<string[]>;
}

/** Short, single-line excerpt of an error body for logs. */
async function errorDetail(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  return text.replace(/\s+/g, " ").slice(0, 200);
}

// ---------- Bhashini ----------

const BHASHINI_CONFIG_URL = "https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline";
/**
 * Ready-made pipeline ids listed on the "Pipeline Search Call" doc page:
 * MeitY = 64392f96daac500b55c543cd, AI4Bharat = 643930aa521a4b1ba0f4c41d.
 */
const BHASHINI_PIPELINE_ID = "64392f96daac500b55c543cd";

const BhashiniConfigResponse = z.object({
  pipelineResponseConfig: z.array(
    z.object({
      taskType: z.string(),
      config: z.array(
        z.object({
          serviceId: z.string().min(1),
          language: z.object({ sourceLanguage: z.string(), targetLanguage: z.string().optional() }).optional(),
        }),
      ),
    }),
  ),
  pipelineInferenceAPIEndPoint: z.object({
    callbackUrl: z.url(),
    inferenceApiKey: z.object({ name: z.string().min(1), value: z.string().min(1) }),
  }),
});

const BhashiniComputeResponse = z.object({
  pipelineResponse: z
    .array(
      z.object({
        taskType: z.string(),
        output: z.array(z.object({ source: z.string().optional(), target: z.string() })),
      }),
    )
    .min(1),
});

interface BhashiniEndpoint {
  callbackUrl: string;
  authName: string;
  authValue: string;
  serviceId: string;
  expires: number;
}

const endpointCache = new Map<string, BhashiniEndpoint>();

/** Test hook: forget cached inference endpoints. */
export function resetBhashiniCache() {
  endpointCache.clear();
}

async function bhashiniEndpoint(userId: string, apiKey: string, source: string, target: string): Promise<BhashiniEndpoint> {
  const cacheKey = `${source}>${target}`;
  const hit = endpointCache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return hit;

  const res = await fetch(BHASHINI_CONFIG_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", userID: userId, ulcaApiKey: apiKey },
    body: JSON.stringify({
      pipelineTasks: [{ taskType: "translation", config: { language: { sourceLanguage: source, targetLanguage: target } } }],
      pipelineRequestConfig: { pipelineId: BHASHINI_PIPELINE_ID },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Bhashini config HTTP ${res.status}: ${await errorDetail(res)}`);
  const parsed = BhashiniConfigResponse.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new Error("Bhashini config response did not match the documented shape");

  const configs = parsed.data.pipelineResponseConfig.find((c) => c.taskType === "translation")?.config ?? [];
  // Prefer the entry for exactly this pair; fall back to the first translation service.
  const config =
    configs.find((c) => c.language?.sourceLanguage === source && c.language?.targetLanguage === target) ?? configs[0];
  if (!config) throw new Error(`Bhashini has no ${source}→${target} translation model`);

  const ep = parsed.data.pipelineInferenceAPIEndPoint;
  const out = {
    callbackUrl: ep.callbackUrl,
    authName: ep.inferenceApiKey.name,
    authValue: ep.inferenceApiKey.value,
    serviceId: config.serviceId,
    expires: Date.now() + 6 * 3600_000,
  };
  endpointCache.set(cacheKey, out);
  return out;
}

export function bhashiniProvider(): TranslationProvider | null {
  const userId = process.env.BHASHINI_USER_ID;
  const apiKey = process.env.BHASHINI_ULCA_API_KEY;
  if (!userId || !apiKey) return null;
  return {
    name: "bhashini",
    async translate(texts, source, target) {
      const ep = await bhashiniEndpoint(userId, apiKey, source, target);
      const res = await fetch(ep.callbackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", [ep.authName]: ep.authValue },
        body: JSON.stringify({
          pipelineTasks: [
            { taskType: "translation", config: { language: { sourceLanguage: source, targetLanguage: target }, serviceId: ep.serviceId } },
          ],
          inputData: { input: texts.map((source) => ({ source })) },
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        // A rejected inference key means the cached endpoint is stale; re-run config next time.
        if (res.status === 401 || res.status === 403) endpointCache.delete(`${source}>${target}`);
        throw new Error(`Bhashini inference HTTP ${res.status}: ${await errorDetail(res)}`);
      }
      const parsed = BhashiniComputeResponse.safeParse(await res.json().catch(() => null));
      if (!parsed.success) throw new Error("Bhashini inference response did not match the documented shape");
      const task =
        parsed.data.pipelineResponse.find((r) => r.taskType === "translation") ?? parsed.data.pipelineResponse[0];
      if (task.output.length !== texts.length) throw new Error("Bhashini returned a different number of outputs");
      const translated = task.output.map((o) => o.target.trim());
      if (translated.some((t) => !t)) throw new Error("Bhashini returned an empty translation");
      return translated;
    },
  };
}

// ---------- Sarvam ----------

const SARVAM_URL = "https://api.sarvam.ai/translate";
/** sarvam-translate:v1 covers all 22 scheduled languages (formal mode only); mayura:v1 only 11. */
const SARVAM_MODEL = "sarvam-translate:v1";
/** Documented `input` limit for sarvam-translate:v1 (mayura:v1 is 1000). */
const SARVAM_MAX_CHARS = 2000;
/** Sarvam uses BCP-47 codes with an -IN region; Odia is "od-IN" (not ISO "or"). */
export const sarvamCode = (lang: string) => `${lang === "or" ? "od" : lang}-IN`;

const SarvamResponse = z.object({
  request_id: z.string().nullish(),
  translated_text: z.string(),
  source_language_code: z.string().nullish(),
});

export function sarvamProvider(): TranslationProvider | null {
  const key = process.env.SARVAM_API_KEY;
  if (!key) return null;
  return {
    name: "sarvam",
    async translate(texts, source, target) {
      // One text per request; Sarvam's translate endpoint takes a single `input`.
      const out: string[] = [];
      for (const input of texts) {
        if (input.length > SARVAM_MAX_CHARS) throw new Error(`Sarvam input exceeds ${SARVAM_MAX_CHARS} chars`);
        const res = await fetch(SARVAM_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "api-subscription-key": key },
          body: JSON.stringify({
            input,
            source_language_code: sarvamCode(source),
            target_language_code: sarvamCode(target),
            model: SARVAM_MODEL,
          }),
          signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) throw new Error(`Sarvam translate HTTP ${res.status}: ${await errorDetail(res)}`);
        const parsed = SarvamResponse.safeParse(await res.json().catch(() => null));
        if (!parsed.success) throw new Error("Sarvam response did not match the documented shape");
        const text = parsed.data.translated_text.trim();
        if (!text) throw new Error("Sarvam returned an empty translation");
        out.push(text);
      }
      return out;
    },
  };
}

/** Configured providers, best first. Empty when no keys are set (translation is then skipped). */
export function translationProviders(): TranslationProvider[] {
  return [bhashiniProvider(), sarvamProvider()].filter((p): p is TranslationProvider => p !== null);
}
