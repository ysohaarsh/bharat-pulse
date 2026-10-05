import { CATEGORY_META } from "@/lib/categories";
import { stateLabel, formatIst, SOURCE_LABELS } from "@/lib/stats/format";
import type { Category } from "@/lib/types";
import type { TopEvent } from "@/app/brief/queries";
import { displayTitle } from "@/lib/i18n/display";
import type { UiLang } from "@/lib/i18n/languages";
import { safeHttpUrl } from "@/lib/url";

export function TopEvents({ events, lang = "en" }: { events: TopEvent[]; lang?: UiLang }) {
  if (events.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
        No events recorded in this period yet.
      </p>
    );
  }
  return (
    <ol className="flex flex-col divide-y divide-border">
      {events.map((e) => {
        const meta = CATEGORY_META[e.category as Category] ?? CATEGORY_META.other;
        const href = safeHttpUrl(e.url);
        return (
          <li key={e.id} className="flex items-start gap-3 py-3">
            <span aria-hidden className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: meta.color }} />
            <div className="min-w-0 flex-1">
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium hover:text-accent hover:underline"
                >
                  {displayTitle(e, lang)}
                  <span className="sr-only"> (opens in a new tab)</span>
                  <span aria-hidden className="ml-1 text-muted">
                    ↗
                  </span>
                </a>
              ) : (
                <span className="font-medium">{displayTitle(e, lang)}</span>
              )}
              <p className="mt-0.5 text-xs text-muted">
                <span style={{ color: meta.color }}>{lang === "hi" ? meta.hi : meta.label}</span>
                {" · "}
                <time dateTime={e.occurred_at}>{formatIst(e.occurred_at)}</time>
                {e.state && <> · {stateLabel(e.state, lang)}</>}
                {" · "}
                {SOURCE_LABELS[e.source] ?? e.source}
              </p>
            </div>
            <span
              className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-xs tabular-nums ${
                e.severity >= 4 ? "border-danger/50 text-danger" : "border-border text-muted"
              }`}
            >
              <span className="sr-only">Severity </span>S{e.severity}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
