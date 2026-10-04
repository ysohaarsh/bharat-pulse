// LLM provider for the World Brief — any OpenAI-compatible Chat Completions endpoint.
//
//   LLM_API_KEY   API key. If empty, briefs fall back to the deterministic extractive brief.
//   LLM_BASE_URL  Base URL ending in the API version; "/chat/completions" is appended.
//                 Default: https://api.groq.com/openai/v1 (Groq free tier). Other options:
//                   Google Gemini   https://generativelanguage.googleapis.com/v1beta/openai
//                   OpenRouter      https://openrouter.ai/api/v1   (e.g. a ":free" model)
//                   Local Ollama    http://localhost:11434/v1       (any non-empty key)
//   LLM_MODEL     Model id for that provider. Default: llama-3.3-70b-versatile (Groq production model).
import type { ChatMessage } from "./prompt";

export const DEFAULT_LLM_BASE_URL = "https://api.groq.com/openai/v1";
export const DEFAULT_LLM_MODEL = "llama-3.3-70b-versatile";
const TIMEOUT_MS = 60_000;

export interface LlmConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface LlmResult {
  content: string;
  model: string;
}

/** Read LLM config from env; null when no API key is set. */
export function llmConfigFromEnv(env: Record<string, string | undefined> = process.env): LlmConfig | null {
  const apiKey = env.LLM_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: (env.LLM_BASE_URL?.trim() || DEFAULT_LLM_BASE_URL).replace(/\/+$/, ""),
    model: env.LLM_MODEL?.trim() || DEFAULT_LLM_MODEL,
  };
}

interface ChatCompletionResponse {
  model?: string;
  choices?: { message?: { content?: string | null } }[];
}

/** Call POST {baseUrl}/chat/completions. Throws a descriptive Error on timeout, non-2xx or empty output. */
export async function completeChat(
  messages: ChatMessage[],
  config: LlmConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<LlmResult> {
  const url = `${config.baseUrl}/chat/completions`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, messages, temperature: 0.2, max_tokens: 1200 }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const reason =
      err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")
        ? `timed out after ${TIMEOUT_MS / 1000}s`
        : err instanceof Error
          ? err.message
          : String(err);
    throw new Error(`LLM request to ${url} failed: ${reason}`);
  }

  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 500);
    throw new Error(`LLM request to ${url} failed: HTTP ${res.status} ${res.statusText}${body ? ` — ${body}` : ""}`);
  }

  const json = (await res.json().catch(() => null)) as ChatCompletionResponse | null;
  const content = json?.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error(`LLM response from ${url} had no message content`);
  return { content, model: json?.model || config.model };
}
