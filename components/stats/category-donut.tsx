"use client";

import { Pie, PieChart, Tooltip } from "recharts";
import type { CategoryShare } from "@/lib/stats/aggregate";
import { TOOLTIP_CONTENT, TOOLTIP_ITEM, TOOLTIP_LABEL } from "./chart-theme";

export function CategoryDonut({ data, ariaLabel }: { data: CategoryShare[]; ariaLabel: string }) {
  const total = data.reduce((n, d) => n + d.count, 0);
  // Recharts applies a data entry's `fill` to its sector.
  const slices = data.map((d) => ({
    name: d.label,
    value: d.count,
    fill: d.color,
  }));
  return (
    <figure aria-label={ariaLabel} className="m-0 flex flex-col gap-4">
      <div className="relative mx-auto w-full max-w-[200px] shrink-0">
        <PieChart responsive style={{ width: "100%", aspectRatio: 1 }}>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="name"
            innerRadius="62%"
            outerRadius="95%"
            paddingAngle={data.length > 1 ? 2 : 0}
            stroke="var(--surface)"
            strokeWidth={2}
            isAnimationActive={false}
          />
          <Tooltip contentStyle={TOOLTIP_CONTENT} labelStyle={TOOLTIP_LABEL} itemStyle={TOOLTIP_ITEM} />
        </PieChart>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" aria-hidden>
          <span className="font-display text-2xl tabular-nums text-ink">{total}</span>
          <span className="label">events</span>
        </div>
      </div>
      <div className="-mx-4 -mb-4 overflow-x-auto">
        <table className="ledger-table">
          <thead>
            <tr>
              <th scope="col">Category / श्रेणी</th>
              <th scope="col" className="num">
                Events
              </th>
              <th scope="col" className="num">
                %
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.category}>
                <td>
                  <span className="flex items-baseline gap-2">
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 shrink-0 translate-y-px rounded-full"
                      style={{ background: d.color }}
                    />
                    {d.label}
                  </span>
                </td>
                <td className="num">{d.count}</td>
                <td className="num">{total > 0 ? Math.round((d.count / total) * 100) : 0}%</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>कुल / Total</td>
              <td className="num">{total}</td>
              <td className="num">100%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </figure>
  );
}
