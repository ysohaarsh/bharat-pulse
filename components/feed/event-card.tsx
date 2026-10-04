"use client";

import { memo } from "react";
import { formatDistanceStrict } from "date-fns";
import { CATEGORY_META } from "@/lib/categories";
import type { EventRow } from "@/lib/types";
import { FOCUS_RING, SOURCE_LABEL } from "./labels";
import { SeverityPips } from "./severity-pips";

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
  const meta = CATEGORY_META[event.category];
  const zulu = event.occurred_at.length >= 16 ? `${event.occurred_at.slice(11, 16)}Z` : "--:--Z";
  return (
    <button
      type="button"
      data-event-id={event.id}
      aria-pressed={selected}
      onClick={() => onSelect(event.id)}
      className={`group relative flex w-full gap-3 border-b border-border/70 py-2 pl-4 pr-3 text-left transition-colors duration-1000 ${FOCUS_RING} focus-visible:ring-inset ${
        selected ? "bg-accent/10" : fresh ? "bg-accent/15" : "hover:bg-accent/5"
      }`}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-0.5"
        style={{ backgroundColor: meta.color, boxShadow: `0 0 8px ${meta.color}` }}
      />
      {selected && <span aria-hidden className="absolute inset-y-0 right-0 w-0.5 bg-accent" />}
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 text-[10px] tracking-wider">
          <span className="tabular-nums text-accent">{zulu}</span>
          <span className="uppercase" style={{ color: meta.color }}>
            {meta.label}
          </span>
          <span className="text-muted">[{SOURCE_LABEL[event.source]}]</span>
          {event.country && <span className="text-foreground/80">{event.country}</span>}
          {fresh && <span className="blink font-bold text-accent">● NEW</span>}
          <time
            dateTime={event.occurred_at}
            suppressHydrationWarning
            className="ml-auto normal-case tracking-normal text-muted"
          >
            {relativeTime(event.occurred_at, now)}
          </time>
        </span>
        <span className="mt-1 line-clamp-2 font-sans text-[13px] leading-snug text-foreground group-hover:text-accent">
          {event.title}
        </span>
      </span>
      <SeverityPips severity={event.severity} className="mt-0.5 shrink-0 self-center" />
    </button>
  );
});
