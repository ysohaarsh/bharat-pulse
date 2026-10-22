import Link from "next/link";
import type { StatsWindow } from "@/lib/stats/aggregate";

const OPTIONS: { value: StatsWindow; label: string }[] = [
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
];

export function WindowToggle({ current }: { current: StatsWindow }) {
  return (
    <nav aria-label="Time window" className="inline-flex gap-1.5">
      {OPTIONS.map((o) => {
        const active = o.value === current;
        return (
          <Link
            key={o.value}
            href={`/stats?window=${o.value}`}
            aria-current={active ? "page" : undefined}
            className={`chip min-h-8 px-3 ${active ? "is-on" : ""}`}
          >
            {o.label}
          </Link>
        );
      })}
    </nav>
  );
}
