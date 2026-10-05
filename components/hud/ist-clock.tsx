"use client";

import { useSyncExternalStore } from "react";

function subscribe(onTick: () => void) {
  const id = setInterval(onTick, 1000);
  return () => clearInterval(id);
}
const getSecond = () => Math.floor(Date.now() / 1000);
const getServerSecond = () => null;

/** IST is a fixed UTC+05:30 offset, so shifting and reading the UTC fields gives IST wall time. */
const toIst = (second: number) => new Date(second * 1000 + 5.5 * 3600_000).toISOString();

/** Ticking IST clock. Renders dashes on the server so hydration never mismatches. */
export function IstClock({ showDate = false, className = "" }: { showDate?: boolean; className?: string }) {
  const second = useSyncExternalStore(subscribe, getSecond, getServerSecond);
  const iso = second == null ? null : toIst(second);
  return (
    <span className={`tabular-nums ${className}`}>
      {showDate && <span className="mr-2 text-muted">{iso ? iso.slice(0, 10) : "----------"}</span>}
      <time dateTime={second == null ? undefined : new Date(second * 1000).toISOString()}>{iso ? iso.slice(11, 19) : "--:--:--"}</time>
      <span className="ml-1 text-muted">IST</span>
    </span>
  );
}

/** Current IST date (YYYY-MM-DD). */
export function IstDate({ className = "" }: { className?: string }) {
  const second = useSyncExternalStore(subscribe, getSecond, getServerSecond);
  return <span className={`tabular-nums ${className}`}>{second == null ? "----------" : toIst(second).slice(0, 10)}</span>;
}
