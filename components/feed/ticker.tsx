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
          className="flex shrink-0 items-center gap-2 px-4 text-[12px] hover:text-accent focus-visible:text-accent focus-visible:outline-none"
        >
          <span className="record-id">#{String(e.id).padStart(4, "0")}</span>
          <span aria-hidden className="h-2 w-2 rounded-sm border border-ink/25" style={{ backgroundColor: meta.color }} />
          {e.state && <span className="num text-[11px] text-muted">{stateShort(e.state)}</span>}
          <span className="text-ink">{displayTitle(e, lang)}</span>
          <span aria-hidden className="pl-3 text-gold">
            ◆
          </span>
        </button>
      );
    });

  return (
    <div
      role="region"
      aria-label="Headline ticker"
      className="ledger-panel flex h-9 shrink-0 items-stretch overflow-hidden"
    >
      <span className="ledger-title z-10 shrink-0 items-center border-r border-border-strong bg-surface-2 px-3 !text-[13px]">
        {lang === "hi" ? "ताज़ा ख़बर" : "Flash / ताज़ा"}
      </span>
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
      </div>
    </div>
  );
}
