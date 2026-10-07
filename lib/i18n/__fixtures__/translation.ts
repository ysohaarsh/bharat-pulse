/**
 * Translation provider response fixtures.
 *
 * DOC-DERIVED, NOT LIVE CAPTURES. No API keys were available when these were written; the
 * shapes are modelled on the public docs (checked 2026-10-07):
 *  - Bhashini config:  https://bhashini.gitbook.io/bhashini-apis/pipeline-config-call/response-payload
 *  - Bhashini compute: https://bhashini.gitbook.io/bhashini-apis/pipeline-compute-call/response-payload
 *  - Sarvam translate: https://docs.sarvam.ai/api-reference/text/translate-text
 * Replace with real captures once roadmap T5 is verified against live keys.
 */

/** getModelsPipeline response for a single hi→en translation task (MeitY pipeline). */
export const bhashiniConfigHiEn = {
  languages: [{ sourceLanguage: "hi", targetLanguageList: ["en", "as", "bn", "gu", "kn"] }],
  pipelineResponseConfig: [
    {
      taskType: "translation",
      config: [
        {
          serviceId: "ai4bharat/indictrans-v2-all-gpu--t4",
          modelId: "641d1d7c8ecee6735a1b37c3",
          language: { sourceLanguage: "hi", sourceScriptCode: "Deva", targetLanguage: "en", targetScriptCode: "Latn" },
        },
      ],
    },
  ],
  pipelineInferenceAPIEndPoint: {
    callbackUrl: "https://dhruva-api.bhashini.gov.in/services/inference/pipeline",
    inferenceApiKey: { name: "Authorization", value: "test-inference-key" },
    isMultilingualEnabled: true,
    isSyncApi: true,
  },
};

/** Pipeline compute response for two hi→en inputs. */
export const bhashiniComputeHiEn = {
  pipelineResponse: [
    {
      taskType: "translation",
      config: null,
      output: [
        { source: "दिल्ली में भारी बारिश की चेतावनी", target: "Heavy rain warning in Delhi" },
        { source: "गुजरात में भूकंप", target: "Earthquake in Gujarat" },
      ],
      audio: null,
    },
  ],
};

/** POST /translate 200 response. */
export const sarvamOk = (translated_text: string) => ({
  request_id: "20261007_0b1c2d3e-test",
  translated_text,
  source_language_code: "hi-IN",
});

/** POST /translate error body (403 / 429 etc.). */
export const sarvamError = {
  error: {
    request_id: "20261007_0b1c2d3e-test",
    message: "Invalid API key or subscription expired",
    code: "invalid_api_key_error",
  },
};
