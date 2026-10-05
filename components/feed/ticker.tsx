"use client";

import { useMemo } from "react";
import { CATEGORY_META } from "@/lib/categories";
import { stateShort } from "@/lib/india/states";
import { displayTitle } from "@/lib/i18n/display";
import { useLang } from "@/components/i18n/lang-provider";
import type { EventRow } from "@/lib/types";

const MAX_ITEMS = 14;

/** Bottom crawl of the latest notable headlines. Hover pauses it; reduced-motion users get a static strip. */
export function Ticker({ events, onSelect }: { events: EventRow[]; onSelect: (id: number) => void }) {
  const { lang } = useLang();
  const items = useMemo(
    () =>
      events
        .filter((e) => e.severity >= 3)
        .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at))
        .slice(0, MAX_ITEMS),
    [events],
  );
  if (items.length === 0) return null;

  const row = (copy: boolean) =>
    items.map((e) => {
      const meta = CATEGORY_META[e.category];
      return (
        <button
          key={`${copy ? "b" : "a"}-${e.id}`}
          type="button"
          tabIndex={copy ? -1 : undefined}
          onClick={() => onSelect(e.id)}
          className="flex shrink-0 items-center gap-2 px-5 text-[11px] hover:text-accent focus-visible:text-accent focus-visible:outline-none"
        >
          <span style={{ color: meta.color }}>▲ {lang === "hi" ? meta.hi : meta.label.toUpperCase()}</span>
          {e.state && <span className="text-muted">[{stateShort(e.state)}]</span>}
          <span className="font-sans text-foreground">{displayTitle(e, lang)}</span>
          <span aria-hidden className="pl-3 text-border-strong">
            {"///"}
          </span>
        </button>
      );
    });

  return (
    <div
      role="region"
      aria-label="Headline ticker"
      className="hud-panel flex h-8 shrink-0 items-stretch overflow-hidden"
    >
      <span className="hud-tab z-10 shrink-0 !py-0">{lang === "hi" ? "ताज़ा" : "Flash"}</span>
      <div className="relative min-w-0 flex-1 overflow-hidden">
        <div
          className="ticker-track flex h-full w-max items-center"
          style={{ ["--ticker-duration" as string]: `${items.length * 9}s` }}
        >
          {row(false)}
          <div aria-hidden className="flex items-center">
            {row(true)}
          </div>
        </div>
        <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-surface to-transparent" />
      </div>
    </div>
  );
}
