"use client";

import { useSyncExternalStore } from "react";

function subscribe(onTick: () => void) {
  const id = setInterval(onTick, 1000);
  return () => clearInterval(id);
}
const getSecond = () => Math.floor(Date.now() / 1000);
const getServerSecond = () => null;

/** Ticking clock. Renders dashes on the server so hydration never mismatches. */
export function UtcClock({ showDate = false, className = "" }: { showDate?: boolean; className?: string }) {
  const second = useSyncExternalStore(subscribe, getSecond, getServerSecond);
  const d = second == null ? null : new Date(second * 1000);
  const time = d ? d.toISOString().slice(11, 19) : "--:--:--";
  const date = d ? d.toISOString().slice(0, 10) : "----------";
  return (
    <span className={`tabular-nums ${className}`}>
      {showDate && <span className="mr-2 text-muted">{date}</span>}
      <time dateTime={d?.toISOString()}>{time}</time>
      <span className="ml-1 text-muted">UTC</span>
    </span>
  );
}

/** Local wall-clock time for the viewer, same hydration-safe approach. */
export function LocalClock({ className = "" }: { className?: string }) {
  const second = useSyncExternalStore(subscribe, getSecond, getServerSecond);
  const d = second == null ? null : new Date(second * 1000);
  const time = d ? d.toLocaleTimeString([], { hour12: false }) : "--:--:--";
  return <span className={`tabular-nums ${className}`}>{time}</span>;
}

/** Current UTC date (YYYY-MM-DD). */
export function UtcDate({ className = "" }: { className?: string }) {
  const second = useSyncExternalStore(subscribe, getSecond, getServerSecond);
  const date = second == null ? "----------" : new Date(second * 1000).toISOString().slice(0, 10);
  return <span className={`tabular-nums ${className}`}>{date}</span>;
}
