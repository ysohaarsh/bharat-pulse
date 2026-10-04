// Lightweight CSS bar list (no chart lib) for small breakdowns.
export interface BarItem {
  key: string;
  label: string;
  count: number;
  color?: string;
}

export function BarList({ items, ariaLabel }: { items: BarItem[]; ariaLabel: string }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  const total = items.reduce((n, i) => n + i.count, 0);
  return (
    <ul aria-label={ariaLabel} className="flex flex-col gap-2 text-sm">
      {items.map((i) => (
        <li key={i.key} className="flex items-center gap-3">
          <span className="w-20 shrink-0 truncate text-muted">{i.label}</span>
          <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-accent"
              style={{ width: `${(i.count / max) * 100}%`, ...(i.color ? { background: i.color } : {}) }}
            />
          </span>
          <span className="w-12 shrink-0 text-right font-mono tabular-nums">
            {i.count}
            <span className="sr-only">
              {" "}
              events{total > 0 ? `, ${Math.round((i.count / total) * 100)} percent` : ""}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
