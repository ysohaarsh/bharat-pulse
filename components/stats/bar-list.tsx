// Ruled register with inline bars (no chart lib) for small breakdowns.
export interface BarItem {
  key: string;
  label: string;
  count: number;
  color?: string;
}

export function BarList({
  items,
  ariaLabel,
  totalLabel = "कुल / Total",
}: {
  items: BarItem[];
  ariaLabel: string;
  totalLabel?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.count));
  const total = items.reduce((n, i) => n + i.count, 0);
  return (
    <div className="-m-4 overflow-x-auto">
      <table aria-label={ariaLabel} className="ledger-table">
        <thead>
          <tr>
            <th scope="col">No.</th>
            <th scope="col">Entry</th>
            <th scope="col" aria-hidden className="w-full">
              <span className="sr-only">Share</span>
            </th>
            <th scope="col" className="num">
              Events
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((i, n) => (
            <tr key={i.key}>
              <td>
                <span className="record-id">#{String(n + 1).padStart(4, "0")}</span>
              </td>
              <td className="min-w-[8.5rem]">{i.label}</td>
              <td className="w-full min-w-12 align-middle" aria-hidden>
                <span className="relative block h-2 bg-surface-2">
                  <span
                    className="absolute inset-y-0 left-0 bg-maroon"
                    style={{
                      width: `${(i.count / max) * 100}%`,
                      ...(i.color ? { background: i.color } : {}),
                    }}
                  />
                </span>
              </td>
              <td className="num">
                {i.count}
                <span className="sr-only">
                  {" "}
                  events
                  {total > 0 ? `, ${Math.round((i.count / total) * 100)} percent` : ""}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3}>{totalLabel}</td>
            <td className="num">{total}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
