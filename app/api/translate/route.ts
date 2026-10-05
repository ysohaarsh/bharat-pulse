import { NextResponse, type NextRequest } from "next/server";
import { translateCached } from "@/lib/i18n/translate";
import { isContentLang } from "@/lib/i18n/languages";
import { translationProviders } from "@/lib/i18n/providers";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/translate?event=123&lang=ta → { title, summary, lang }
 * On-demand translation of one recent event into any of the content languages. Only stored
 * events can be translated (no free-text proxy) and results are cached forever, so the total
 * provider spend is bounded by events × languages.
 */
export async function GET(request: NextRequest) {
  const id = Number(request.nextUrl.searchParams.get("event"));
  const lang = request.nextUrl.searchParams.get("lang");
  if (!Number.isSafeInteger(id) || id <= 0 || !isContentLang(lang)) {
    return NextResponse.json({ error: "event and lang are required" }, { status: 400 });
  }
  if (translationProviders().length === 0) {
    return NextResponse.json({ error: "Translation is not configured on this server" }, { status: 503 });
  }

  const db = createAdminClient();
  const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const { data: event } = await db
    .from("events")
    .select("title, summary, lang")
    .eq("id", id)
    .gte("created_at", since)
    .maybeSingle();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const texts = [event.title, ...(event.summary ? [event.summary] : [])];
  const [title, summary] = await translateCached(db, texts, event.lang, lang);
  if (!title) return NextResponse.json({ error: "Translation failed" }, { status: 502 });
  return NextResponse.json(
    { title, summary: summary ?? null, lang },
    { headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
