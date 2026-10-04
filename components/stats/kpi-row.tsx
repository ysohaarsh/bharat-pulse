import { CATEGORY_META } from "@/lib/categories";
import { HIGH_SEVERITY, type Kpis } from "@/lib/stats/aggregate";

const nf = new Intl.NumberFormat("en");

export function KpiRow({ kpis }: { kpis: Kpis }) {
  const top = kpis.topCategory ? CATEGORY_META[kpis.topCategory] : null;
  const items = [
    { label: "Total events", value: nf.format(kpis.total), danger: false },
    { label: `High severity (≥${HIGH_SEVERITY})`, value: nf.format(kpis.highSeverity), danger: kpis.highSeverity > 0 },
    { label: "Countries affected", value: nf.format(kpis.countries), danger: false },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((k) => (
        <div key={k.label} className="hud-panel p-4">
          <dt className="hud-label">{k.label}</dt>
          <dd className={`glow mt-1 text-3xl font-bold tabular-nums ${k.danger ? "text-danger" : "text-accent"}`}>
            {k.value}
          </dd>
        </div>
      ))}
      <div className="hud-panel p-4">
        <dt className="hud-label">Most active category</dt>
        <dd className="mt-1 flex min-w-0 items-center gap-2 text-2xl font-semibold">
          {top ? (
            <>
              <span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ background: top.color }} />
              <span className="truncate">{top.label}</span>
            </>
          ) : (
            <span className="text-muted">None yet</span>
          )}
        </dd>
      </div>
    </dl>
  );
}
