import { describe, expect, it, vi } from "vitest";
import { completeChat, DEFAULT_LLM_BASE_URL, DEFAULT_LLM_MODEL, llmConfigFromEnv } from "./provider";

const config = { apiKey: "k", baseUrl: "https://llm.example/v1", model: "m" };
const messages = [{ role: "user" as const, content: "hi" }];

describe("llmConfigFromEnv", () => {
  it("returns null without an API key", () => {
    expect(llmConfigFromEnv({})).toBeNull();
    expect(llmConfigFromEnv({ LLM_API_KEY: "  " })).toBeNull();
  });
  it("applies defaults and trims trailing slashes", () => {
    expect(llmConfigFromEnv({ LLM_API_KEY: "k" })).toEqual({
      apiKey: "k",
      baseUrl: DEFAULT_LLM_BASE_URL,
      model: DEFAULT_LLM_MODEL,
    });
    expect(
      llmConfigFromEnv({ LLM_API_KEY: "k", LLM_BASE_URL: "http://localhost:11434/v1/", LLM_MODEL: "llama3" }),
    ).toEqual({ apiKey: "k", baseUrl: "http://localhost:11434/v1", model: "llama3" });
  });
});

describe("completeChat", () => {
  it("POSTs an OpenAI-compatible request and returns content + model", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ model: "m-2024", choices: [{ message: { content: "  # Overview\nHello " } }] }),
    );
    const out = await completeChat(messages, config, fetchMock as unknown as typeof fetch);
    expect(out).toEqual({ content: "# Overview\nHello", model: "m-2024" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://llm.example/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer k");
    expect(JSON.parse(init.body as string)).toMatchObject({ model: "m", messages });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("throws a descriptive error on non-2xx", async () => {
    const fetchMock = async () =>
      new Response('{"error":"rate limited"}', { status: 429, statusText: "Too Many Requests" });
    await expect(completeChat(messages, config, fetchMock as typeof fetch)).rejects.toThrow(/HTTP 429.*rate limited/);
  });

  it("throws on empty content", async () => {
    const fetchMock = async () => Response.json({ choices: [] });
    await expect(completeChat(messages, config, fetchMock as typeof fetch)).rejects.toThrow(/no message content/);
  });

  it("wraps network errors", async () => {
    const fetchMock = async (): Promise<Response> => {
      throw new TypeError("fetch failed");
    };
    await expect(completeChat(messages, config, fetchMock as typeof fetch)).rejects.toThrow(
      /llm\.example.*fetch failed/,
    );
  });
});
