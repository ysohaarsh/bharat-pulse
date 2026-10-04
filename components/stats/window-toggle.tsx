import Link from "next/link";
import type { StatsWindow } from "@/lib/stats/aggregate";

const OPTIONS: { value: StatsWindow; label: string }[] = [
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
];

export function WindowToggle({ current }: { current: StatsWindow }) {
  return (
    <nav aria-label="Time window" className="inline-flex border border-border-strong text-[11px] uppercase tracking-widest">
      {OPTIONS.map((o) => {
        const active = o.value === current;
        return (
          <Link
            key={o.value}
            href={`/stats?window=${o.value}`}
            aria-current={active ? "page" : undefined}
            className={`px-3 py-1 transition-colors ${
              active ? "bg-accent font-bold text-black" : "text-muted hover:text-accent"
            }`}
          >
            {o.label}
          </Link>
        );
      })}
    </nav>
  );
}
