"use client";

import { CATEGORY_META } from "@/lib/categories";
import { CATEGORIES } from "@/lib/types";
import { useLang } from "@/components/i18n/lang-provider";

export function MapLegend({ className = "" }: { className?: string }) {
  const { lang } = useLang();
  return (
    <section
      aria-label="Map legend"
      className={`pointer-events-auto hidden border border-border-strong bg-background/85 px-3 py-2 text-[10px] backdrop-blur xl:block ${className}`}
    >
      <h2 className="hud-label mb-1.5 !text-accent">{lang === "hi" ? "संकेत" : "Legend"}</h2>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 uppercase tracking-wider">
        {CATEGORIES.map((c) => (
          <li key={c} className="flex items-center gap-1.5 text-muted">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: CATEGORY_META[c].color, boxShadow: `0 0 5px ${CATEGORY_META[c].color}` }}
            />
            {lang === "hi" ? CATEGORY_META[c].hi : CATEGORY_META[c].label}
          </li>
        ))}
      </ul>
      <p className="mt-1.5 border-t border-border pt-1 text-muted">◎ size = severity · pulsing = S4+</p>
      <p className="text-muted">
        clusters: <span className="text-accent">●</span> S1–2 <span className="text-warn">●</span> S3{" "}
        <span className="text-danger">●</span> S4+
      </p>
      <p className="text-muted">
        <span style={{ color: "#f5e663" }}>●</span> report · <span style={{ color: "#ff7ad9" }}>●</span> metro ·{" "}
        <span style={{ color: "#ffd23f" }}>●</span> rail · <span style={{ color: "#2fe0ff" }}>●</span> road works
      </p>
    </section>
  );
}
