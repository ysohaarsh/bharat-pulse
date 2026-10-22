import type { LiveStatus } from "@/lib/events/use-live-events";

const STATUS: Record<LiveStatus, { label: string; dot: string }> = {
  live: { label: "Live", dot: "bg-ok" },
  connecting: { label: "Connecting…", dot: "bg-haldi animate-pulse" },
  offline: { label: "Offline", dot: "bg-danger" },
};

export function LiveIndicator({ status, count, pending }: { status: LiveStatus; count: number; pending: boolean }) {
  const s = STATUS[status];
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span role="status" className="flex items-center gap-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-widest text-ink-soft">
        <span className="relative flex h-2 w-2" aria-hidden>
          {status === "live" && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-50" />}
          <span className={`relative inline-flex h-2 w-2 rounded-full ${s.dot}`} />
        </span>
        {s.label}
      </span>
      <span className="num text-muted" aria-live="polite">
        {pending ? "Updating…" : `${count} event${count === 1 ? "" : "s"}`}
      </span>
    </div>
  );
}
