import type { EventRow } from "@/lib/types";

/**
 * Prepend an incoming event, dedupe by id (the incoming copy wins), keep newest-first order
 * by `occurred_at`, and cap the list length. Returns the original array if nothing changed.
 */
export function mergeIncoming(list: readonly EventRow[], incoming: EventRow, cap: number): EventRow[] {
  const existing = list.find((e) => e.id === incoming.id);
  if (existing && existing.created_at === incoming.created_at && existing.title === incoming.title) {
    return list as EventRow[];
  }
  const rest = list.filter((e) => e.id !== incoming.id);
  const t = Date.parse(incoming.occurred_at);
  // Most inserts are the newest event, so the common case is index 0.
  let idx = rest.findIndex((e) => Date.parse(e.occurred_at) <= t);
  if (idx === -1) idx = rest.length;
  const next = [...rest.slice(0, idx), incoming, ...rest.slice(idx)];
  return next.length > cap ? next.slice(0, cap) : next;
}
