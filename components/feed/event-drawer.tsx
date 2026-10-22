"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CATEGORY_META } from "@/lib/categories";
import { displayTitle, isTranslated } from "@/lib/i18n/display";
import { CONTENT_LANGS, LANG_NAMES, type ContentLang } from "@/lib/i18n/languages";
import { formatIst, stateLabel } from "@/lib/stats/format";
import { useLang } from "@/components/i18n/lang-provider";
import { safeHttpUrl } from "@/lib/url";
import type { EventRow } from "@/lib/types";
import { FOCUS_RING, SOURCE_LABEL } from "./labels";
import { SeverityPips } from "./severity-pips";

/** "Read in Tamil/Telugu/…": on-demand machine translation via /api/translate (cached server-side). */
function TranslateTo({ event }: { event: EventRow }) {
  const [lang, setLang] = useState<ContentLang | "">("");
  const [result, setResult] = useState<{ title: string; summary: string | null } | { error: string } | null>(null);

  useEffect(() => {
    if (!lang) return;
    let cancelled = false;
    fetch(`/api/translate?event=${event.id}&lang=${lang}`)
      .then(async (r) => {
        const body = await r.json();
        if (!cancelled) setResult(r.ok ? body : { error: body.error ?? "Translation failed" });
      })
      .catch(() => !cancelled && setResult({ error: "Translation failed" }));
    return () => {
      cancelled = true;
    };
  }, [lang, event.id]);

  return (
    <div className="mt-4 border border-border-strong bg-surface-2 p-3 text-xs">
      <label className="flex items-center gap-2">
        <span className="label">Read in / भाषा</span>
        <select
          value={lang}
          onChange={(e) => {
            setResult(null);
            setLang(e.target.value as ContentLang | "");
          }}
          className="input !w-auto !px-1.5 !py-0.5 !text-xs"
        >
          <option value="">—</option>
          {CONTENT_LANGS.filter((l) => l !== event.lang).map((l) => (
            <option key={l} value={l}>
              {LANG_NAMES[l].native} ({LANG_NAMES[l].en})
            </option>
          ))}
        </select>
      </label>
      {lang && !result && <p className="mt-2 animate-pulse text-accent">Translating…</p>}
      {result && "error" in result && <p className="mt-2 text-danger">{result.error}</p>}
      {result && "title" in result && (
        <div lang={lang} className="mt-2 font-sans text-sm leading-relaxed text-foreground">
          <p className="font-semibold">{result.title}</p>
          {result.summary && <p className="mt-1 text-muted">{result.summary}</p>}
          <p className="num mt-1 text-[10.5px] text-muted">Machine translation (Bhashini / Sarvam)</p>
        </div>
      )}
    </div>
  );
}

export function EventDrawer({ event, onClose }: { event: EventRow; onClose: () => void }) {
  const { lang } = useLang();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const meta = CATEGORY_META[event.category];
  const sourceUrl = safeHttpUrl(event.url);

  // Focus the close button on open and restore focus to whatever was focused before on close.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const tone = event.severity >= 4 ? "stamp-danger" : event.severity === 3 ? "stamp-warn" : "stamp-teal";
  const field = (label: string, children: React.ReactNode) => (
    <div className="grid grid-cols-[9rem_1fr] items-baseline gap-3 border-b border-rule px-3 py-1.5 last:border-b-0">
      <dt className="label">{label}</dt>
      <dd className="min-w-0 text-[13px] text-ink">{children}</dd>
    </div>
  );

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      className="ledger-panel absolute inset-0 z-10 flex flex-col !border-l-[3px] bg-surface"
    >
      <div className="ledger-header shrink-0">
        <span className="ledger-title !text-[13px]">
          <span aria-hidden className="acct">
            खाता ·
          </span>
          {lang === "hi" ? "प्रविष्टि विवरण" : "Entry slip"}
          <span className="record-id">#{String(event.id).padStart(4, "0")}</span>
        </span>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close event details"
          className={`rounded-sm p-1 text-maroon hover:bg-haldi/20 ${FOCUS_RING}`}
        >
          <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-soft">
            <span aria-hidden className="h-2.5 w-2.5 rounded-sm border border-ink/25" style={{ backgroundColor: meta.color }} />
            {lang === "hi" ? meta.hi : meta.label}
          </span>
          <span className={`stamp ${tone} ml-auto`}>
            S{event.severity} / 5
          </span>
        </div>
        <h2 id={titleId} className="text-base font-semibold leading-snug text-ink">
          {displayTitle(event, lang)}
        </h2>
        {isTranslated(event, lang) && (
          <p lang={event.lang} className="mt-1 text-sm text-muted">
            <span className="label">Original ({event.lang}):</span> {event.title}
          </p>
        )}
        {event.summary && <p className="mt-2 text-sm leading-relaxed text-ink-soft">{event.summary}</p>}

        <div aria-hidden className="ornament-divider" />

        <dl className="border border-border-strong bg-surface">
          {field(
            "Severity / गंभीरता",
            <span className="flex items-center gap-2">
              <SeverityPips severity={event.severity} />
              <span className="num">{event.severity} / 5</span>
            </span>,
          )}
          {field("Source / स्रोत", <span className="num">{SOURCE_LABEL[event.source]}</span>)}
          {field("State / राज्य", event.state ? stateLabel(event.state, lang) : "—")}
          {event.district && field("District / ज़िला", event.district)}
          {field(
            "Coordinates / निर्देशांक",
            <span className="num">
              {event.lat != null && event.lng != null ? `${event.lat.toFixed(3)}, ${event.lng.toFixed(3)}` : "No location"}
            </span>,
          )}
          {field(
            "Occurred / समय",
            <>
              <time dateTime={event.occurred_at} className="num">
                {formatIst(event.occurred_at)}
              </time>
              <span className="num block text-[10.5px] text-muted">{event.occurred_at}</span>
            </>,
          )}
        </dl>

        <TranslateTo key={event.id} event={event} />

        {sourceUrl && (
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="btn-primary mt-5">
            Open source <span aria-hidden>↗</span>
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
      </div>
    </div>
  );
}
