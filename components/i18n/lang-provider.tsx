"use client";

import { createContext, useCallback, useContext, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { t as translate, type DictKey } from "@/lib/i18n/dict";
import { LANG_COOKIE } from "@/lib/i18n/display";
import type { UiLang } from "@/lib/i18n/languages";

const LangContext = createContext<UiLang>("en");

export function LangProvider({ lang, children }: { lang: UiLang; children: ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

/** Current UI language plus a bound `t(key)` for client components. */
export function useLang() {
  const lang = useContext(LangContext);
  const t = useCallback((key: DictKey) => translate(lang, key), [lang]);
  return { lang, t };
}

/** EN ⇄ हिन्दी switch: sets the cookie and re-renders server components. */
export function LangToggle({ className = "" }: { className?: string }) {
  const { lang, t } = useLang();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const next: UiLang = lang === "en" ? "hi" : "en";
  return (
    <button
      type="button"
      aria-label={t("langToggleLabel")}
      lang={next}
      disabled={pending}
      onClick={() => {
        document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
        startTransition(() => router.refresh());
      }}
      className={className}
    >
      {t("langToggle")}
    </button>
  );
}
