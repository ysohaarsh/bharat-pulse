"use client";

import { useEffect, useState } from "react";
import { busSnapshotSchema, type BusSnapshot } from "@/lib/transit/types";

export type BusStatus = "idle" | "ok" | "pending" | "error";

const POLL_MS = 20_000;

/**
 * Polls /api/buses every 20 s while `active` (layer on, viewport over Delhi NCR) and the tab is
 * visible. 503 means the OTD key is not configured yet: reported as "pending", not an error.
 */
export function useBuses(active: boolean): { snapshot: BusSnapshot | null; status: BusStatus } {
  const [snapshot, setSnapshot] = useState<BusSnapshot | null>(null);
  const [status, setStatus] = useState<BusStatus>("idle");

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ctrl: AbortController | undefined;

    const load = async () => {
      ctrl = new AbortController();
      try {
        const res = await fetch("/api/buses", { signal: ctrl.signal });
        if (cancelled) return;
        if (res.status === 503) return setStatus("pending");
        const parsed = res.ok ? busSnapshotSchema.safeParse(await res.json()) : null;
        if (cancelled) return;
        if (parsed?.success) {
          setSnapshot(parsed.data);
          setStatus("ok");
        } else setStatus("error");
      } catch {
        if (!cancelled) setStatus("error");
      }
    };
    const schedule = () => {
      clearTimeout(timer);
      if (!document.hidden) timer = setTimeout(() => void load().finally(schedule), POLL_MS);
    };
    const onVisibility = () => {
      if (document.hidden) {
        clearTimeout(timer);
        ctrl?.abort();
      } else {
        void load().finally(schedule);
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    if (!document.hidden) void load().finally(schedule);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      ctrl?.abort();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active]);

  return { snapshot: active ? snapshot : null, status: active ? status : "idle" };
}
