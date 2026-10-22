"use client";

import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import {
  AXIS_LINE,
  AXIS_TICK,
  GRID_STROKE,
  TOOLTIP_CONTENT,
  TOOLTIP_CURSOR,
  TOOLTIP_ITEM,
  TOOLTIP_LABEL,
} from "./chart-theme";

export interface StateDatum {
  code: string;
  name: string;
  count: number;
}

const MAX_LABEL = 18;

/** Y tick: mono record number, then the state name (ellipsised only when very long). */
function StateTick({
  x = 0,
  y = 0,
  payload,
  index,
}: {
  x?: number;
  y?: number;
  payload?: { value: string };
  index?: number;
}) {
  const name = payload?.value ?? "";
  const short = name.length > MAX_LABEL ? `${name.slice(0, MAX_LABEL - 1)}…` : name;
  return (
    <text x={Number(x) - 6} y={Number(y)} textAnchor="end" dominantBaseline="central" fontSize={12}>
      <title>{name}</title>
      <tspan fill="var(--maroon)" fontFamily="var(--font-plex-mono)" fontSize={10.5}>
        {String((index ?? 0) + 1).padStart(2, "0")}{" "}
      </tspan>
      <tspan fill="var(--foreground)">{short}</tspan>
    </text>
  );
}

export function StatesChart({ data, ariaLabel }: { data: StateDatum[]; ariaLabel: string }) {
  const height = Math.max(120, data.length * 30 + 28);
  const total = data.reduce((n, d) => n + d.count, 0);
  return (
    <figure aria-label={ariaLabel} className="m-0">
      <BarChart
        responsive
        layout="vertical"
        data={data}
        style={{ width: "100%", height }}
        margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
      >
        <CartesianGrid horizontal={false} stroke={GRID_STROKE} strokeDasharray="3 3" />
        <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={150}
          tick={<StateTick />}
          axisLine={false}
          tickLine={false}
          interval={0}
        />
        <Tooltip
          cursor={TOOLTIP_CURSOR}
          contentStyle={TOOLTIP_CONTENT}
          labelStyle={TOOLTIP_LABEL}
          itemStyle={TOOLTIP_ITEM}
        />
        <Bar
          dataKey="count"
          name="Events"
          fill="var(--maroon)"
          radius={[0, 2, 2, 0]}
          barSize={16}
          isAnimationActive={false}
        />
      </BarChart>
      <div className="ledger-total -mx-4 -mb-4 mt-3">
        <span>कुल / Total (top {data.length})</span>
        <span className="num">{total}</span>
      </div>
    </figure>
  );
}
