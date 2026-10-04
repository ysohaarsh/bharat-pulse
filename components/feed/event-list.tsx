"use client";

import { useEffect, useRef } from "react";
import type { EventRow } from "@/lib/types";
import { EventCard } from "./event-card";
import { FOCUS_RING } from "./labels";

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
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (scrollToId == null) return;
    listRef.current
      ?.querySelector(`[data-event-id="${scrollToId}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [scrollToId]);

  if (events.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-accent" />
        <p className="text-sm uppercase tracking-widest text-accent">No events {filtered ? "match these filters" : "yet"}.</p>
        <p className="text-xs leading-relaxed text-muted">
          Pulse ingests earthquakes (USGS), natural hazards (NASA EONET) and world news (GDELT, RSS)
          every few minutes. New events will appear here automatically — no need to refresh.
        </p>
        {filtered && (
          <button
            type="button"
            onClick={onResetFilters}
            className={`border border-accent px-3 py-1 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-black ${FOCUS_RING}`}
          >
            Reset filters
          </button>
        )}
      </div>
    );
  }

  return (
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
  );
}
