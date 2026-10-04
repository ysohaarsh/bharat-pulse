import type { Metadata } from "next";
import { summarize, parseWindow } from "@/lib/stats/aggregate";
import { countryName, SOURCE_LABELS } from "@/lib/stats/format";
import { fetchStatsEvents, STATS_EVENT_LIMIT } from "@/lib/stats/queries";
import { BarList } from "@/components/stats/bar-list";
import { CategoryDonut } from "@/components/stats/category-donut";
import { CountriesChart } from "@/components/stats/countries-chart";
import { KpiRow } from "@/components/stats/kpi-row";
import { EmptyChart, Panel } from "@/components/stats/panel";
import { TimelineChart } from "@/components/stats/timeline-chart";
import { WindowToggle } from "@/components/stats/window-toggle";

export const metadata: Metadata = { title: "Stats — Pulse" };

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
      } UTC.`;
  const countries = s.countries.map((c) => ({ code: c.country, name: countryName(c.country), count: c.count }));

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-7xl px-4 py-6">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="glow text-lg font-bold uppercase tracking-[0.25em] text-accent">Stats</h1>
            <p className="text-sm text-muted">Global event activity over the {windowText}. Times in UTC.</p>
          </div>
          <WindowToggle current={window} />
        </header>

        {error && (
          <p role="alert" className="mb-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm">
            Couldn&apos;t load events: {error}
          </p>
        )}
        {truncated && (
          <p className="mb-4 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-muted">
            Showing the most recent {STATS_EVENT_LIMIT.toLocaleString("en")} events; older events in this window are not
            counted.
          </p>
        )}
        {empty && !error && (
          <p className="mb-4 rounded-md border border-border bg-surface px-3 py-2 text-sm text-muted">
            No events recorded in the {windowText} yet. Data appears here once ingestion has run — check back in a few
            minutes{window === "24h" ? " or try the 7-day window" : ""}.
          </p>
        )}

        <KpiRow kpis={s.kpis} />

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Panel
            title="Events over time"
            subtitle={`${window === "7d" ? "Daily" : "Hourly"} counts by category (UTC)`}
            className="lg:col-span-2"
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

          <Panel title="By category" subtitle="Share of all events">
            {empty ? (
              <EmptyChart />
            ) : (
              <CategoryDonut
                data={s.categories}
                ariaLabel={`Category breakdown: ${s.categories.map((c) => `${c.label} ${c.count}`).join(", ")}.`}
              />
            )}
          </Panel>

          <Panel title="Top countries" subtitle="Events with a known country" className="lg:col-span-2">
            {countries.length === 0 ? (
              <EmptyChart message={empty ? undefined : "No events in this window have a country attached."} />
            ) : (
              <CountriesChart
                data={countries}
                ariaLabel={`Top ${countries.length} countries by event count: ${countries
                  .map((c) => `${c.name} ${c.count}`)
                  .join(", ")}.`}
              />
            )}
          </Panel>

          <div className="flex flex-col gap-4">
            <Panel title="Sources" subtitle="Where events came from">
              <BarList
                ariaLabel="Events per source"
                items={s.sources.map((x) => ({
                  key: x.source,
                  label: SOURCE_LABELS[x.source] ?? x.source,
                  count: x.count,
                }))}
              />
            </Panel>
            <Panel title="Severity" subtitle="1 = minor, 5 = severe">
              <BarList
                ariaLabel="Events per severity level"
                items={s.severity.map((x) => ({
                  key: String(x.severity),
                  label: `${x.severity} · ${SEVERITY_LABELS[x.severity - 1]}`,
                  count: x.count,
                  color: x.severity >= 4 ? "var(--danger)" : undefined,
                }))}
              />
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
