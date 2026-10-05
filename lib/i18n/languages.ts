/**
 * Languages we show content in. UI chrome is translated for `en` and `hi` (lib/i18n/dict.ts);
 * the rest are content-only, translated on demand per event.
 */
export const CONTENT_LANGS = ["en", "hi", "bn", "te", "mr", "ta", "gu", "kn", "ml", "or", "pa", "as", "ur"] as const;
export type ContentLang = (typeof CONTENT_LANGS)[number];

export const UI_LANGS = ["en", "hi"] as const;
export type UiLang = (typeof UI_LANGS)[number];

export const LANG_NAMES: Record<ContentLang, { en: string; native: string }> = {
  en: { en: "English", native: "English" },
  hi: { en: "Hindi", native: "हिन्दी" },
  bn: { en: "Bengali", native: "বাংলা" },
  te: { en: "Telugu", native: "తెలుగు" },
  mr: { en: "Marathi", native: "मराठी" },
  ta: { en: "Tamil", native: "தமிழ்" },
  gu: { en: "Gujarati", native: "ગુજરાતી" },
  kn: { en: "Kannada", native: "ಕನ್ನಡ" },
  ml: { en: "Malayalam", native: "മലയാളം" },
  or: { en: "Odia", native: "ଓଡ଼ିଆ" },
  pa: { en: "Punjabi", native: "ਪੰਜਾਬੀ" },
  as: { en: "Assamese", native: "অসমীয়া" },
  ur: { en: "Urdu", native: "اردو" },
};

export function isContentLang(s: string | null | undefined): s is ContentLang {
  return !!s && (CONTENT_LANGS as readonly string[]).includes(s);
}

export function isUiLang(s: string | null | undefined): s is UiLang {
  return !!s && (UI_LANGS as readonly string[]).includes(s);
}
