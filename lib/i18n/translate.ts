import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { translationProviders, type TranslationProvider } from "./providers";

type Db = SupabaseClient<Database>;

export const textHash = (source: string, text: string) => createHash("sha256").update(`${source}\n${text}`).digest("hex");

/**
 * Translate texts with the DB cache in front of the provider chain. Each (text, target) pair
 * is translated at most once, ever. Returns null entries for texts no provider could handle.
 */
export async function translateCached(
  db: Db,
  texts: string[],
  source: string,
  target: string,
  providers: TranslationProvider[] = translationProviders(),
): Promise<(string | null)[]> {
  if (source === target) return texts;
  const hashes = texts.map((t) => textHash(source, t));
  const { data: cached } = await db.from("translations").select("hash, text").eq("lang", target).in("hash", hashes);
  const byHash = new Map((cached ?? []).map((r) => [r.hash, r.text]));

  const missing = [...new Set(texts.filter((_, i) => !byHash.has(hashes[i])))];
  if (missing.length > 0) {
    for (const provider of providers) {
      try {
        const out = await provider.translate(missing, source, target);
        const rows = missing.map((t, i) => ({ hash: textHash(source, t), lang: target, text: out[i], provider: provider.name }));
        await db.from("translations").upsert(rows, { onConflict: "hash,lang" });
        for (const r of rows) byHash.set(r.hash, r.text);
        break;
      } catch (err) {
        console.warn(`[translate] ${provider.name} ${source}→${target} failed:`, err instanceof Error ? err.message : err);
      }
    }
  }
  return hashes.map((h) => byHash.get(h) ?? null);
}

/**
 * Translate a markdown document line by line, keeping `#`/`##` heading and `- ` bullet markers
 * (and **bold**) out of the text sent to the provider. Null when no line could be translated.
 */
export async function translateMarkdown(db: Db, markdown: string, source: string, target: string): Promise<string | null> {
  if (translationProviders().length === 0) return null;
  const lines = markdown.split("\n").map((line) => {
    const m = /^(#{1,6}\s+|-\s+)?(.*)$/.exec(line)!;
    return { prefix: m[1] ?? "", text: m[2].replace(/\*\*/g, "").trim() };
  });
  const texts = lines.filter((l) => l.text).map((l) => l.text);
  const out = await translateCached(db, texts, source, target);
  if (out.every((t) => t === null)) return null;
  let i = 0;
  return lines.map((l) => (l.text ? `${l.prefix}${out[i++] ?? l.text}` : l.prefix.trimEnd())).join("\n");
}

/**
 * Fill events.title_en / title_hi for recent rows. Same-language columns are copied; the rest
 * go through providers within `charBudget` characters per run (most severe first).
 */
export async function translatePendingEvents(db: Db, { charBudget = 8000, maxRows = 150 } = {}) {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data, error } = await db
    .from("events")
    .select("id, title, lang, title_en, title_hi, severity")
    .or("title_en.is.null,title_hi.is.null")
    .gte("created_at", since)
    .order("severity", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(maxRows);
  if (error) throw new Error(error.message);

  const providers = translationProviders();
  let budget = charBudget;
  let translated = 0;
  let copied = 0;

  // Group the work by (source → target) so providers get batches.
  const jobs = new Map<string, { source: string; target: "en" | "hi"; rows: { id: number; title: string }[] }>();
  const updates = new Map<number, { title_en?: string; title_hi?: string }>();
  for (const e of data ?? []) {
    for (const target of ["en", "hi"] as const) {
      const column = target === "en" ? "title_en" : "title_hi";
      if (e[column] !== null) continue;
      if (e.lang === target) {
        updates.set(e.id, { ...updates.get(e.id), [column]: e.title });
        copied++;
        continue;
      }
      if (providers.length === 0 || budget < e.title.length) continue;
      budget -= e.title.length;
      const key = `${e.lang}>${target}`;
      const job = jobs.get(key) ?? { source: e.lang, target, rows: [] };
      job.rows.push({ id: e.id, title: e.title });
      jobs.set(key, job);
    }
  }

  for (const { source, target, rows } of jobs.values()) {
    const out = await translateCached(db, rows.map((r) => r.title), source, target, providers);
    rows.forEach((r, i) => {
      const text = out[i];
      if (!text) return;
      updates.set(r.id, { ...updates.get(r.id), [target === "en" ? "title_en" : "title_hi"]: text });
      translated++;
    });
  }

  for (const [id, patch] of updates) {
    await db.from("events").update(patch).eq("id", id);
  }
  return { rows: data?.length ?? 0, translated, copied, providers: providers.map((p) => p.name) };
}
