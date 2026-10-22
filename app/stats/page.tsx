import type { Metadata } from "next";
import { summarize, parseWindow } from "@/lib/stats/aggregate";
import { stateLabel, SOURCE_LABELS } from "@/lib/stats/format";
import { fetchStatsEvents, STATS_EVENT_LIMIT } from "@/lib/stats/queries";
import { BarList } from "@/components/stats/bar-list";
import { CategoryDonut } from "@/components/stats/category-donut";
import { StatesChart } from "@/components/stats/states-chart";
import { KpiRow } from "@/components/stats/kpi-row";
import { EmptyChart, Panel } from "@/components/stats/panel";
import { TimelineChart } from "@/components/stats/timeline-chart";
import { WindowToggle } from "@/components/stats/window-toggle";

export const metadata: Metadata = { title: "Stats — Bharat Pulse" };

const SEVERITY_LABELS = ["Minor", "Low", "Moderate", "High", "Severe"];

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const window = parseWindow((await searchParams).window);
  const now = new Date();
  const { events, truncated, error } = await fetchStatsEvents(window, now);
  const s = summarize(events, window, now);
  const windowText = window === "7d" ? "last 7 days" : "last 24 hours";
  const empty = s.kpis.total === 0;

  const timelineSummary = empty
    ? `No events in the ${windowText}.`
    : `Events per ${window === "7d" ? "day" : "hour"} over the ${windowText}, stacked by category. Peak: ${
        s.timeline.reduce((a, b) => (b.total > a.total ? b : a)).label
      } IST.`;
  const states = s.states.map((c) => ({
    code: c.state,
    name: stateLabel(c.state),
    count: c.count,
  }));

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-7xl px-4 py-6">
        <header className="mb-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl uppercase tracking-[0.08em] text-maroon sm:text-[28px]">
              Stats <span className="normal-case tracking-normal">· आँकड़े</span>
            </h1>
            <p className="mt-1 text-sm text-ink-soft">
              वार्षिक पंजीका / Register of activity across India over the {windowText}. Times in IST.
            </p>
          </div>
          <WindowToggle current={window} />
        </header>
        <div aria-hidden className="ornament-divider !mb-4" />

        {error && (
          <p role="alert" className="mb-4 border border-danger/40 border-l-[3px] bg-danger/10 px-3 py-2 text-sm">
            Couldn&apos;t load events: {error}
          </p>
        )}
        {truncated && (
          <p className="mb-4 border border-border-strong border-l-[3px] border-l-haldi bg-haldi/15 px-3 py-2 text-sm text-ink-soft">
            Showing the most recent {STATS_EVENT_LIMIT.toLocaleString("en")} events; older events in this window are not
            counted.
          </p>
        )}
        {empty && !error && (
          <p className="mb-4 border border-border bg-surface-2 px-3 py-2 text-sm text-ink-soft">
            No events recorded in the {windowText} yet. Data appears here once ingestion has run — check back in a few
            minutes
            {window === "24h" ? " or try the 7-day window" : ""}.
          </p>
        )}

        <KpiRow kpis={s.kpis} />

        <div className="mt-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
          <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
            <Panel
              code="01"
              title="Events over time"
              subtitle={`${window === "7d" ? "Daily" : "Hourly"} counts by category (IST)`}
            >
              {empty ? (
                <EmptyChart />
              ) : (
                <TimelineChart
                  data={s.timeline}
                  categories={s.categories.map((c) => c.category)}
                  ariaLabel={timelineSummary}
                />
              )}
            </Panel>
            <Panel code="02" title="Top states" subtitle="Events with a known state">
              {states.length === 0 ? (
                <EmptyChart message={empty ? undefined : "No events in this window have a state attached."} />
              ) : (
                <StatesChart
                  data={states}
                  ariaLabel={`Top ${states.length} states by event count: ${states
                    .map((c) => `${c.name} ${c.count}`)
                    .join(", ")}.`}
                />
              )}
            </Panel>
            <Panel code="03" title="Sources" subtitle="Where events came from">
              <BarList
                ariaLabel="Events per source"
                items={s.sources.map((x) => ({
                  key: x.source,
                  label: SOURCE_LABELS[x.source] ?? x.source,
                  count: x.count,
                }))}
              />
            </Panel>
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <Panel code="04" title="By category" subtitle="Share of all events">
              {empty ? (
                <EmptyChart />
              ) : (
                <CategoryDonut
                  data={s.categories}
                  ariaLabel={`Category breakdown: ${s.categories.map((c) => `${c.label} ${c.count}`).join(", ")}.`}
                />
              )}
            </Panel>
            <Panel code="05" title="Severity" subtitle="1 = minor, 5 = severe">
              <BarList
                ariaLabel="Events per severity level"
                items={s.severity.map((x) => ({
                  key: String(x.severity),
                  label: `${x.severity} · ${SEVERITY_LABELS[x.severity - 1]}`,
                  count: x.count,
                  color: x.severity >= 4 ? "var(--danger)" : x.severity === 3 ? "var(--warn)" : "var(--teal)",
                }))}
              />
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
