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
    <div className="mt-4 border border-border bg-background/50 p-3 text-xs">
      <label className="flex items-center gap-2 text-muted">
        <span className="uppercase tracking-wider">Read in</span>
        <select
          value={lang}
          onChange={(e) => {
            setResult(null);
            setLang(e.target.value as ContentLang | "");
          }}
          className={`border border-border bg-surface px-1 py-0.5 text-foreground ${FOCUS_RING}`}
        >
          <option value="">—</option>
          {CONTENT_LANGS.filter((l) => l !== event.lang).map((l) => (
            <option key={l} value={l}>
              {LANG_NAMES[l].native} ({LANG_NAMES[l].en})
            </option>
          ))}
        </select>
      </label>
      {lang && !result && <p className="blink mt-2 text-accent">Translating…</p>}
      {result && "error" in result && <p className="mt-2 text-danger">{result.error}</p>}
      {result && "title" in result && (
        <div lang={lang} className="mt-2 font-sans text-sm leading-relaxed text-foreground">
          <p className="font-semibold">{result.title}</p>
          {result.summary && <p className="mt-1 text-muted">{result.summary}</p>}
          <p className="mt-1 font-mono text-[10px] text-muted">Machine translation (Bhashini / Sarvam)</p>
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

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      className="absolute inset-0 z-10 flex flex-col border-t-2 border-accent bg-surface"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em]" style={{ color: meta.color }}>
          <span aria-hidden className="h-2 w-2" style={{ backgroundColor: meta.color, boxShadow: `0 0 6px ${meta.color}` }} />
          {lang === "hi" ? meta.hi : meta.label} · {lang === "hi" ? "विवरण" : "Event detail"}
        </span>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close event details"
          className={`rounded p-1 text-muted hover:bg-surface-2 hover:text-foreground ${FOCUS_RING}`}
        >
          <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <h2 id={titleId} className="font-sans text-base font-semibold leading-snug text-foreground">
          {displayTitle(event, lang)}
        </h2>
        {isTranslated(event, lang) && (
          <p lang={event.lang} className="mt-1 font-sans text-sm text-muted">
            <span className="font-mono text-[10px] uppercase tracking-wider">Original ({event.lang}):</span> {event.title}
          </p>
        )}
        {event.summary && <p className="mt-2 font-sans text-sm leading-relaxed text-muted">{event.summary}</p>}

        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border border-border bg-background/50 p-3 text-xs [&_dt]:uppercase [&_dt]:tracking-wider">
          <dt className="text-muted">Severity</dt>
          <dd className="flex items-center gap-2">
            <SeverityPips severity={event.severity} />
            <span>{event.severity} / 5</span>
          </dd>
          <dt className="text-muted">Source</dt>
          <dd className="font-mono">{SOURCE_LABEL[event.source]}</dd>
          <dt className="text-muted">State</dt>
          <dd>{event.state ? stateLabel(event.state, lang) : "—"}</dd>
          {event.district && (
            <>
              <dt className="text-muted">District</dt>
              <dd>{event.district}</dd>
            </>
          )}
          <dt className="text-muted">Coordinates</dt>
          <dd className="font-mono">
            {event.lat != null && event.lng != null
              ? `${event.lat.toFixed(3)}, ${event.lng.toFixed(3)}`
              : "No location"}
          </dd>
          <dt className="text-muted">Occurred</dt>
          <dd>
            <time dateTime={event.occurred_at}>{formatIst(event.occurred_at)}</time>
            <span className="block font-mono text-[10px] text-muted">{event.occurred_at}</span>
          </dd>
        </dl>

        <TranslateTo key={event.id} event={event} />

        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`mt-5 inline-flex items-center gap-1 border border-accent px-3 py-1.5 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-black ${FOCUS_RING}`}
          >
            Open source <span aria-hidden>↗</span>
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
      </div>
    </div>
  );
}
