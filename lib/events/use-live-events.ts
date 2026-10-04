"use client";

import { useEffect, useRef, useState } from "react";
import type { EventRow } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { type EventFilters, matchesFilters } from "./filters";
import { mergeIncoming } from "./merge";
import { toEventRow } from "./row";

export const LIVE_EVENTS_CAP = 500;
const FRESH_MS = 4000;

export type LiveStatus = "connecting" | "live" | "offline";

export interface LiveEvents {
  events: EventRow[];
  /** Ids that arrived via realtime in the last few seconds (for highlight effects). */
  freshIds: ReadonlySet<number>;
  /** True while the realtime channel is subscribed. */
  connected: boolean;
  status: LiveStatus;
}

/**
 * Starts from server-rendered `initial` events and prepends realtime INSERTs on public.events
 * that match `filters`. Resets whenever the server sends a new `initial` list (e.g. filter change).
 */
export function useLiveEvents(initial: EventRow[], filters: EventFilters): LiveEvents {
  const [prevInitial, setPrevInitial] = useState(initial);
  const [events, setEvents] = useState(initial);
  const [freshIds, setFreshIds] = useState<ReadonlySet<number>>(() => new Set());
  const [status, setStatus] = useState<LiveStatus>("connecting");

  // New server data replaces local state (adjusting state during render, not in an effect).
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setEvents(initial);
  }

  // Keep the latest filters available to the long-lived subscription without resubscribing.
  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  useEffect(() => {
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch (err) {
      console.error("[events] realtime unavailable:", err);
      queueMicrotask(() => setStatus("offline"));
      return;
    }

    const timers = new Set<ReturnType<typeof setTimeout>>();

    const channel = supabase
      .channel("public:events:live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "events" }, (payload) => {
        const row = toEventRow(payload.new);
        if (!row || !matchesFilters(row, filtersRef.current, Date.now())) return;
        setEvents((prev) => mergeIncoming(prev, row, LIVE_EVENTS_CAP));
        setFreshIds((prev) => new Set(prev).add(row.id));
        const timer = setTimeout(() => {
          timers.delete(timer);
          setFreshIds((prev) => {
            const next = new Set(prev);
            next.delete(row.id);
            return next;
          });
        }, FRESH_MS);
        timers.add(timer);
      })
      .subscribe((s) => {
        if (s === "SUBSCRIBED") setStatus("live");
        else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") setStatus("offline");
      });

    return () => {
      timers.forEach(clearTimeout);
      void supabase.removeChannel(channel);
    };
  }, []);

  return { events, freshIds, connected: status === "live", status };
}
