"use client";

import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from "recharts";
import { CATEGORY_META } from "@/lib/categories";
import type { Category } from "@/lib/types";
import type { TimeBucket } from "@/lib/stats/aggregate";
import {
  AXIS_LINE,
  AXIS_TICK,
  GRID_STROKE,
  TOOLTIP_CONTENT,
  TOOLTIP_CURSOR,
  TOOLTIP_ITEM,
  TOOLTIP_LABEL,
} from "./chart-theme";

export function TimelineChart({
  data,
  categories,
  ariaLabel,
}: {
  data: TimeBucket[];
  /** Categories to stack, in display order (only non-empty ones). */
  categories: Category[];
  ariaLabel: string;
}) {
  return (
    <figure aria-label={ariaLabel} className="m-0">
      <BarChart
        responsive
        data={data}
        style={{ width: "100%", height: 280 }}
        margin={{ top: 4, right: 8, bottom: 0, left: -16 }}
      >
        <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tick={AXIS_TICK}
          axisLine={AXIS_LINE}
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={12}
        />
        <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} />
        <Tooltip
          cursor={TOOLTIP_CURSOR}
          contentStyle={TOOLTIP_CONTENT}
          labelStyle={TOOLTIP_LABEL}
          itemStyle={TOOLTIP_ITEM}
          labelFormatter={(l) => `${String(l)} UTC`}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted)", paddingTop: 8 }} iconType="circle" iconSize={8} />
        {categories.map((c, i) => (
          <Bar
            key={c}
            dataKey={c}
            name={CATEGORY_META[c].label}
            stackId="events"
            fill={CATEGORY_META[c].color}
            radius={i === categories.length - 1 ? [2, 2, 0, 0] : 0}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </figure>
  );
}
