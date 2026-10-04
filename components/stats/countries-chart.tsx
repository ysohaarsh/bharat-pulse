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

export interface CountryDatum {
  code: string;
  name: string;
  count: number;
}

export function CountriesChart({ data, ariaLabel }: { data: CountryDatum[]; ariaLabel: string }) {
  const height = Math.max(120, data.length * 28 + 24);
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
        <YAxis type="category" dataKey="name" width={110} tick={AXIS_TICK} axisLine={false} tickLine={false} />
        <Tooltip
          cursor={TOOLTIP_CURSOR}
          contentStyle={TOOLTIP_CONTENT}
          labelStyle={TOOLTIP_LABEL}
          itemStyle={TOOLTIP_ITEM}
        />
        <Bar
          dataKey="count"
          name="Events"
          fill="var(--accent)"
          radius={[0, 3, 3, 0]}
          barSize={16}
          isAnimationActive={false}
        />
      </BarChart>
    </figure>
  );
}
