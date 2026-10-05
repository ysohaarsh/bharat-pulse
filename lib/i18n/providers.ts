import "server-only";

/**
 * India-built machine translation, in order of preference:
 *  1. Bhashini (MeitY's National Language Translation Mission) — free for low volume.
 *     Register at bhashini.gov.in/ulca → profile → generate key. Env: BHASHINI_USER_ID,
 *     BHASHINI_ULCA_API_KEY. Two-step: ask ULCA for the pipeline's inference endpoint + key
 *     (cached per process), then call it.
 *  2. Sarvam AI — ₹100 free credits on signup, then paid. Env: SARVAM_API_KEY.
 * Both accept batches; callers go through lib/i18n/translate.ts, which caches in the DB.
 */

export interface TranslationProvider {
  name: string;
  /** Translate `texts` from `source` to `target` (ISO 639-1). Same length/order as input. */
  translate(texts: string[], source: string, target: string): Promise<string[]>;
}

// ---------- Bhashini ----------

const BHASHINI_CONFIG_URL = "https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline";
/** MeitY's public pipeline id from the Bhashini docs. */
const BHASHINI_PIPELINE_ID = "64392f96daac500b55c543cd";

interface BhashiniEndpoint {
  callbackUrl: string;
  authName: string;
  authValue: string;
  serviceId: string;
  expires: number;
}

const endpointCache = new Map<string, BhashiniEndpoint>();

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
  if (!res.ok) throw new Error(`Bhashini config HTTP ${res.status}`);
  const body = (await res.json()) as {
    pipelineInferenceAPIEndPoint?: { callbackUrl?: string; inferenceApiKey?: { name?: string; value?: string } };
    pipelineResponseConfig?: { config?: { serviceId?: string }[] }[];
  };
  const ep = body.pipelineInferenceAPIEndPoint;
  const serviceId = body.pipelineResponseConfig?.[0]?.config?.[0]?.serviceId;
  if (!ep?.callbackUrl || !ep.inferenceApiKey?.name || !ep.inferenceApiKey.value || !serviceId) {
    throw new Error(`Bhashini has no ${source}→${target} translation model`);
  }
  const out = {
    callbackUrl: ep.callbackUrl,
    authName: ep.inferenceApiKey.name,
    authValue: ep.inferenceApiKey.value,
    serviceId,
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
      if (!res.ok) throw new Error(`Bhashini inference HTTP ${res.status}`);
      const body = (await res.json()) as { pipelineResponse?: { output?: { target?: string }[] }[] };
      const output = body.pipelineResponse?.[0]?.output ?? [];
      if (output.length !== texts.length) throw new Error("Bhashini returned a different number of outputs");
      return output.map((o, i) => o.target?.trim() || texts[i]);
    },
  };
}

// ---------- Sarvam ----------

const SARVAM_URL = "https://api.sarvam.ai/translate";
/** Sarvam uses BCP-47 codes with an -IN region; Odia is "od". */
const sarvamCode = (lang: string) => `${lang === "or" ? "od" : lang}-IN`;

export function sarvamProvider(): TranslationProvider | null {
  const key = process.env.SARVAM_API_KEY;
  if (!key) return null;
  return {
    name: "sarvam",
    async translate(texts, source, target) {
      // One text per request; Sarvam's translate endpoint takes a single `input`.
      const out: string[] = [];
      for (const input of texts) {
        const res = await fetch(SARVAM_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "api-subscription-key": key },
          body: JSON.stringify({
            input,
            source_language_code: sarvamCode(source),
            target_language_code: sarvamCode(target),
            model: "sarvam-translate:v1",
          }),
          signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) throw new Error(`Sarvam translate HTTP ${res.status}`);
        const body = (await res.json()) as { translated_text?: string };
        out.push(body.translated_text?.trim() || input);
      }
      return out;
    },
  };
}

/** Configured providers, best first. Empty when no keys are set (translation is then skipped). */
export function translationProviders(): TranslationProvider[] {
  return [bhashiniProvider(), sarvamProvider()].filter((p): p is TranslationProvider => p !== null);
}
