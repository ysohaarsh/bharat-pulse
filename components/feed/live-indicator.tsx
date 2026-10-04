import type { LiveStatus } from "@/lib/events/use-live-events";

const STATUS: Record<LiveStatus, { label: string; dot: string }> = {
  live: { label: "Live", dot: "bg-accent shadow-[0_0_6px_var(--accent)]" },
  connecting: { label: "Connecting…", dot: "bg-muted animate-pulse" },
  offline: { label: "Offline", dot: "bg-danger" },
};

export function LiveIndicator({ status, count, pending }: { status: LiveStatus; count: number; pending: boolean }) {
  const s = STATUS[status];
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span role="status" className="flex items-center gap-1.5 font-mono uppercase tracking-widest">
        <span className="relative flex h-2 w-2" aria-hidden>
          {status === "live" && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
          )}
          <span className={`relative inline-flex h-2 w-2 rounded-full ${s.dot}`} />
        </span>
        {s.label}
      </span>
      <span className="tabular-nums text-muted" aria-live="polite">
        {pending ? "Updating…" : `${count} event${count === 1 ? "" : "s"}`}
      </span>
    </div>
  );
}
