import { CATEGORY_META } from "@/lib/categories";
import { stateLabel, formatIst, SOURCE_LABELS } from "@/lib/stats/format";
import type { Category } from "@/lib/types";
import type { TopEvent } from "@/app/brief/queries";
import { displayTitle } from "@/lib/i18n/display";
import type { UiLang } from "@/lib/i18n/languages";
import { safeHttpUrl } from "@/lib/url";

function severityStamp(sev: number): string {
  if (sev >= 4) return "stamp-danger";
  if (sev === 3) return "stamp-warn";
  return "stamp-teal";
}

/** Numbered register of the period's most severe events. */
export function TopEvents({ events, lang = "en" }: { events: TopEvent[]; lang?: UiLang }) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center px-4 py-6 text-center">
        <div aria-hidden className="ornament-divider w-40 max-w-full" />
        <p className="font-display text-sm text-maroon">इस बही में अभी कोई प्रविष्टि नहीं</p>
        <p className="label mt-1 !normal-case !tracking-normal">No entries in this register yet</p>
      </div>
    );
  }
  return (
    <div>
      <ol className="m-0 list-none p-0">
        {events.map((e, n) => {
          const meta = CATEGORY_META[e.category as Category] ?? CATEGORY_META.other;
          const href = safeHttpUrl(e.url);
          return (
            <li key={e.id} className="ledger-row !items-start !gap-3 !py-3">
              <span className="record-id mt-1">#{String(n + 1).padStart(4, "0")}</span>
              <div className="min-w-0 flex-1">
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-ink hover:text-accent hover:underline"
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
                <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
                  <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: meta.color }} />
                  <span className="font-medium text-ink-soft">{lang === "hi" ? meta.hi : meta.label}</span>
                  <span aria-hidden>·</span>
                  <time className="num" dateTime={e.occurred_at}>
                    {formatIst(e.occurred_at)}
                  </time>
                  {e.state && (
                    <>
                      <span aria-hidden>·</span>
                      {stateLabel(e.state, lang)}
                    </>
                  )}
                  <span aria-hidden>·</span>
                  {SOURCE_LABELS[e.source] ?? e.source}
                </p>
              </div>
              <span className={`stamp stamp-flat ${severityStamp(e.severity)} mt-0.5`}>
                <span className="sr-only">Severity </span>S{e.severity}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="ledger-total">
        <span>कुल / Total</span>
        <span className="num">{events.length}</span>
      </div>
    </div>
  );
}
