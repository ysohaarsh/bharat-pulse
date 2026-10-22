"use client";

import { CATEGORY_META } from "@/lib/categories";
import { CATEGORIES } from "@/lib/types";
import { useLang } from "@/components/i18n/lang-provider";

/** Map legend styled as a ledger slip: key (संकेत), category swatches, size and cluster notes. */
export function MapLegend({ className = "" }: { className?: string }) {
  const { lang } = useLang();
  return (
    <section
      aria-label="Map legend"
      className={`ledger-panel pointer-events-auto hidden px-3 py-2 text-[10.5px] xl:block ${className}`}
    >
      <h2 className="label mb-1 !text-maroon">
        {lang === "hi" ? "संकेत" : "संकेत · Legend"}
      </h2>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        {CATEGORIES.map((c) => (
          <li key={c} className="flex items-center gap-1.5 text-ink-soft">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full border border-ink/30"
              style={{ backgroundColor: CATEGORY_META[c].color }}
            />
            {lang === "hi" ? CATEGORY_META[c].hi : CATEGORY_META[c].label}
          </li>
        ))}
      </ul>
      <div className="ornament-divider !my-1.5" />
      <p className="text-muted">◎ size = severity · pulsing = S4+</p>
      <p className="text-muted">
        clusters: <span className="text-accent">●</span> S1–2 <span className="text-warn">●</span> S3{" "}
        <span className="text-danger">●</span> S4+
      </p>
      <p className="text-muted">
        <span style={{ color: "#c99700" }}>●</span> report · <span style={{ color: "#c2308f" }}>●</span> metro ·{" "}
        <span style={{ color: "#a8650a" }}>●</span> rail · <span style={{ color: "#0e8aa6" }}>●</span> road works
      </p>
    </section>
  );
}
