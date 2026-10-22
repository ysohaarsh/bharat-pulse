import { CATEGORY_META } from "@/lib/categories";
import { HIGH_SEVERITY, type Kpis } from "@/lib/stats/aggregate";

const nf = new Intl.NumberFormat("en");

/** Totals row of the register: four ruled cells, figures in tabular numerals. */
export function KpiRow({ kpis }: { kpis: Kpis }) {
  const top = kpis.topCategory ? CATEGORY_META[kpis.topCategory] : null;
  const items = [
    {
      label: "कुल घटनाएँ / Total events",
      value: nf.format(kpis.total),
      danger: false,
    },
    {
      label: `गंभीर / High severity (≥${HIGH_SEVERITY})`,
      value: nf.format(kpis.highSeverity),
      danger: kpis.highSeverity > 0,
    },
    {
      label: "प्रभावित राज्य / States affected",
      value: nf.format(kpis.states),
      danger: false,
    },
  ];
  return (
    <dl className="ledger-panel m-0 grid grid-cols-2 lg:grid-cols-4">
      {items.map((k, n) => (
        <div key={k.label} className="border-b border-r border-rule p-4 lg:border-b-0">
          <dt className="label flex items-baseline justify-between gap-2">
            {k.label}
            <span className="record-id">#{String(n + 1).padStart(2, "0")}</span>
          </dt>
          <dd className={`m-0 mt-1 font-display text-3xl tabular-nums ${k.danger ? "text-danger" : "text-accent"}`}>
            {k.value}
            {k.danger && <span className="stamp stamp-danger ml-2 align-middle">Alert</span>}
          </dd>
        </div>
      ))}
      <div className="border-b border-rule p-4 lg:border-b-0">
        <dt className="label">सर्वाधिक सक्रिय / Most active</dt>
        <dd className="m-0 mt-1 flex min-w-0 items-center gap-2 font-display text-xl text-ink">
          {top ? (
            <>
              <span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ background: top.color }} />
              <span>{top.label}</span>
            </>
          ) : (
            <span className="text-muted">None yet</span>
          )}
        </dd>
      </div>
    </dl>
  );
}
