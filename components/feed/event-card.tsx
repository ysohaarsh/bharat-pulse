"use client";

import { memo } from "react";
import { formatDistanceStrict } from "date-fns";
import { CATEGORY_META } from "@/lib/categories";
import { stateShort } from "@/lib/india/states";
import { displayTitle, isTranslated } from "@/lib/i18n/display";
import { useLang } from "@/components/i18n/lang-provider";
import type { EventRow } from "@/lib/types";
import { FOCUS_RING, SOURCE_LABEL } from "./labels";

/** "HH:MM" in IST (UTC+05:30) from an ISO timestamp, deterministic on server and client. */
export function istHhmm(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "--:--" : new Date(t + 5.5 * 3600_000).toISOString().slice(11, 16);
}

/** Relative time against an explicit `now`, so server and client render the same string. */
export function relativeTime(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "unknown time";
  if (now - t < 60_000) return "just now";
  return formatDistanceStrict(t, now, { addSuffix: true });
}

export const EventCard = memo(function EventCard({
  event,
  now,
  selected,
  fresh,
  onSelect,
}: {
  event: EventRow;
  now: number;
  selected: boolean;
  fresh: boolean;
  onSelect: (id: number) => void;
}) {
  const { lang } = useLang();
  const meta = CATEGORY_META[event.category];
  const translated = isTranslated(event, lang);
  const stampTone = event.severity >= 4 ? "stamp-danger" : event.severity === 3 ? "stamp-warn" : "stamp-teal";
  return (
    <button
      type="button"
      data-event-id={event.id}
      aria-pressed={selected}
      onClick={() => onSelect(event.id)}
      className={`ledger-row group relative w-full items-start text-left transition-colors duration-1000 ${FOCUS_RING} focus-visible:ring-inset ${
        selected ? "is-selected" : fresh ? "bg-haldi/20" : ""
      }`}
    >
      <span className="record-id mt-0.5 w-11 shrink-0 text-right" title={`Record ${event.id}`}>
        #{String(event.id).padStart(4, "0")}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px]">
          <time dateTime={event.occurred_at} className="num text-ink-soft">
            {istHhmm(event.occurred_at)} IST
          </time>
          <span suppressHydrationWarning className="num text-muted">
            ({relativeTime(event.occurred_at, now)})
          </span>
          <span className="inline-flex items-center gap-1 font-semibold" style={{ color: meta.color }}>
            <span aria-hidden className="h-2 w-2 rounded-sm border border-ink/25" style={{ backgroundColor: meta.color }} />
            <span className="text-ink-soft">{lang === "hi" ? meta.hi : meta.label}</span>
          </span>
          <span className="num text-muted">{SOURCE_LABEL[event.source]}</span>
          {event.state && <span className="num text-ink-soft">{stateShort(event.state)}</span>}
          {translated && (
            <span className="text-muted" title={`Machine-translated from ${event.lang}`}>
              ⇄{event.lang}
            </span>
          )}
          {fresh && <span className="stamp stamp-flat stamp-ok !py-0 !text-[9px]">NEW</span>}
        </span>
        <span className="mt-1 line-clamp-2 text-[13px] leading-snug text-ink group-hover:text-accent">
          {displayTitle(event, lang)}
        </span>
      </span>
      <span
        role="img"
        aria-label={`Severity ${event.severity} of 5`}
        className={`stamp ${stampTone} mt-0.5 shrink-0 !text-[10px]`}
      >
        S{event.severity}
      </span>
    </button>
  );
});
