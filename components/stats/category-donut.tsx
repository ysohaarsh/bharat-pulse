"use client";

import { Pie, PieChart, Tooltip } from "recharts";
import type { CategoryShare } from "@/lib/stats/aggregate";
import { TOOLTIP_CONTENT, TOOLTIP_ITEM, TOOLTIP_LABEL } from "./chart-theme";

export function CategoryDonut({ data, ariaLabel }: { data: CategoryShare[]; ariaLabel: string }) {
  const total = data.reduce((n, d) => n + d.count, 0);
  // Recharts applies a data entry's `fill` to its sector.
  const slices = data.map((d) => ({ name: d.label, value: d.count, fill: d.color }));
  return (
    <figure aria-label={ariaLabel} className="m-0 flex flex-col items-center gap-4 sm:flex-row lg:flex-col xl:flex-row">
      <div className="relative w-full max-w-[200px] shrink-0">
        <PieChart responsive style={{ width: "100%", aspectRatio: 1 }}>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="name"
            innerRadius="62%"
            outerRadius="95%"
            paddingAngle={data.length > 1 ? 2 : 0}
            stroke="var(--surface)"
            isAnimationActive={false}
          />
          <Tooltip contentStyle={TOOLTIP_CONTENT} labelStyle={TOOLTIP_LABEL} itemStyle={TOOLTIP_ITEM} />
        </PieChart>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" aria-hidden>
          <span className="font-mono text-xl font-semibold tabular-nums">{total}</span>
          <span className="text-xs text-muted">events</span>
        </div>
      </div>
      <ul className="grid w-full grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {data.map((d) => (
          <li key={d.category} className="flex items-center gap-2">
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
            <span className="truncate text-muted">{d.label}</span>
            <span className="ml-auto font-mono tabular-nums">
              {total > 0 ? Math.round((d.count / total) * 100) : 0}%<span className="sr-only"> ({d.count} events)</span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
