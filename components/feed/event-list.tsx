"use client";

import { useEffect, useRef } from "react";
import type { EventRow } from "@/lib/types";
import { EventCard } from "./event-card";
import { useLang } from "@/components/i18n/lang-provider";

export function EventList({
  events,
  now,
  selectedId,
  scrollToId,
  freshIds,
  onSelect,
  filtered,
  onResetFilters,
}: {
  events: EventRow[];
  now: number;
  selectedId: number | null;
  /** When set (e.g. selection came from the map), scroll that card into view. */
  scrollToId: number | null;
  freshIds: ReadonlySet<number>;
  onSelect: (id: number) => void;
  filtered: boolean;
  onResetFilters: () => void;
}) {
  const { t, lang } = useLang();
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (scrollToId == null) return;
    listRef.current
      ?.querySelector(`[data-event-id="${scrollToId}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [scrollToId]);

  if (events.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center">
        <div aria-hidden className="ornament-divider w-40" />
        <p className="font-display text-base uppercase tracking-[0.06em] text-maroon">
          {filtered ? t("dashEmptyFiltered") : t("dashEmptyTitle")}
        </p>
        <p className="text-xs text-muted">
          {lang === "hi" ? "No entries in the register yet" : "बही में अभी कोई प्रविष्टि नहीं"}
        </p>
        <p className="max-w-xs text-xs leading-relaxed text-ink-soft">{t("dashEmptyHint")}</p>
        {filtered && (
          <button type="button" onClick={onResetFilters} className="btn-ghost mt-1">
            {t("dashReset")}
          </button>
        )}
        <div aria-hidden className="ornament-divider w-40" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
    <ul ref={listRef} aria-label="Event feed" className="min-h-0 flex-1 overflow-y-auto">
      {events.map((e) => (
        <li key={e.id}>
          <EventCard
            event={e}
            now={now}
            selected={e.id === selectedId}
            fresh={freshIds.has(e.id)}
            onSelect={onSelect}
          />
        </li>
      ))}
    </ul>
    <div className="ledger-total shrink-0 text-xs">
      <span>{lang === "hi" ? "कुल / Total" : "Total / कुल"}</span>
      <span className="num">{events.length}</span>
    </div>
    </div>
  );
}
