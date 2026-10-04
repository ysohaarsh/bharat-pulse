import { CATEGORY_META } from "@/lib/categories";
import { countryName, type BriefEvent } from "./types";

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export interface PromptInput {
  events: readonly BriefEvent[];
  periodStart: string;
  periodEnd: string;
}

export const SYSTEM_PROMPT = [
  "You are a wire-service editor writing a daily World Brief for a world-events dashboard.",
  "Rules:",
  "- Be neutral and factual. Do not speculate, predict, editorialize or assign blame.",
  "- Use ONLY the events provided by the user. Do not add facts, numbers, names or context that are not in them.",
  "- Mention country names where known. Merge closely related events into one bullet.",
  "- Length: about 250-400 words.",
  "Format (plain markdown, only these elements: paragraphs, `#`/`##` headings, `- ` bullets, **bold**; no links, tables, code or numbered lists):",
  "1. Start with `# Overview` followed by a 1-2 sentence lead paragraph summarizing the most significant developments.",
  "2. Then sections, in this order, each a `## ` heading followed by `- ` bullets:",
  "   `## Conflict & Security`, `## Natural Hazards`, `## Politics & Economy`, `## Health`, `## Other`.",
  "3. Omit any section that has no relevant events. Do not write placeholder text like \"nothing to report\".",
  "Output only the brief, with no preamble or closing remarks.",
].join("\n");

/** One compact line per event for the user message. */
export function formatEventLine(e: BriefEvent, index: number): string {
  const label = CATEGORY_META[e.category]?.label ?? e.category;
  const country = countryName(e.country) ?? "unknown";
  const title = e.title.replace(/\s+/g, " ").trim();
  return `${index + 1}. [${label}] severity ${e.severity}/5 | ${country} | ${e.occurred_at} | ${e.source} | ${title}`;
}

/** Build the chat messages for the World Brief. Pure. */
export function buildBriefPrompt({ events, periodStart, periodEnd }: PromptInput): ChatMessage[] {
  const user = [
    `Write the World Brief for ${periodStart} to ${periodEnd} (UTC).`,
    `Below are the ${events.length} most important events in that period, most severe first.`,
    "Format: N. [category] severity S/5 | country | time (UTC) | source | title",
    "",
    ...events.map(formatEventLine),
  ].join("\n");
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: user },
  ];
}
