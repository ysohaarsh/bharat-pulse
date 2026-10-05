import type { EventRow } from "@/lib/types";
import type { UiLang } from "./languages";

/**
 * The headline to show in `lang`: the original when it's already in that language, else the
 * machine translation, else the original (better an untranslated alert than none).
 */
export function displayTitle(e: Pick<EventRow, "title" | "lang" | "title_en" | "title_hi">, lang: UiLang): string {
  if (e.lang === lang) return e.title;
  return (lang === "hi" ? e.title_hi : e.title_en) ?? e.title;
}

/** True when the shown headline is a machine translation (so the UI can say so). */
export function isTranslated(e: Pick<EventRow, "lang" | "title_en" | "title_hi">, lang: UiLang): boolean {
  if (e.lang === lang) return false;
  return (lang === "hi" ? e.title_hi : e.title_en) != null;
}

export const LANG_COOKIE = "lang";
