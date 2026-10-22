"use client";

import { CATEGORY_META } from "@/lib/categories";
import type { Severity } from "@/lib/types";
import {
  type EventFilters,
  selectAllCategories,
  sportsEnabled,
  TIME_WINDOWS,
  toggleCategory,
  toggleValue,
} from "@/lib/events/filters";
import { CORE_CATEGORIES, CORE_SOURCES } from "@/lib/events/sports";
import { useLang } from "@/components/i18n/lang-provider";
import { FOCUS_RING, SOURCE_LABEL, WINDOW_LABEL } from "./labels";

const CHIP = "chip !text-[11px]";

export function FilterBar({
  filters,
  onChange,
}: {
  filters: EventFilters;
  onChange: (next: EventFilters) => void;
}) {
  // "All" = every non-sports category. Sports is a separate opt-in toggle (hidden by default and
  // never counted in the threat index, stats or brief), so it sits apart after a divider.
  const { lang } = useLang();
  const allCategories = CORE_CATEGORIES.every((c) => filters.categories.includes(c));
  const sports = sportsEnabled(filters);

  return (
    <div className="flex flex-col gap-2 border-b-2 border-maroon bg-surface-2 px-3 py-2.5">
      <div role="group" aria-label="Categories" className="flex flex-wrap gap-1.5">
        <button
          type="button"
          aria-pressed={allCategories}
          aria-label="All categories (except sports)"
          onClick={() => onChange({ ...filters, categories: selectAllCategories(filters.categories) })}
          className={CHIP}
        >
          All
        </button>
        {CORE_CATEGORIES.map((c) => {
          const pressed = filters.categories.includes(c);
          return (
            <button
              key={c}
              type="button"
              aria-pressed={pressed}
              aria-label={`${CATEGORY_META[c].label} events`}
              onClick={() => onChange({ ...filters, categories: toggleCategory(filters.categories, c) })}
              className={CHIP}
            >
              <span
                aria-hidden
                className="h-2 w-2 rounded-sm border border-ink/25"
                style={{ backgroundColor: CATEGORY_META[c].color }}
              />
              {lang === "hi" ? CATEGORY_META[c].hi : CATEGORY_META[c].label}
            </button>
          );
        })}
        <span aria-hidden className="mx-0.5 w-px self-stretch bg-border-strong" />
        <button
          type="button"
          aria-pressed={sports}
          aria-label="Sports (opt-in) events"
          title="Sports headlines are hidden by default and never count toward the threat index, stats or brief"
          onClick={() => onChange({ ...filters, categories: toggleCategory(filters.categories, "sports") })}
          className={`${CHIP} !border-dashed`}
        >
          <span
            aria-hidden
            className="h-2 w-2 rounded-sm border border-ink/25"
            style={{ backgroundColor: CATEGORY_META.sports.color }}
          />
          {CATEGORY_META.sports.label}
          <span className="normal-case tracking-normal opacity-70">(opt-in)</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Time window" className="inline-flex overflow-hidden rounded-sm border border-border-strong bg-surface">
          {TIME_WINDOWS.map((w) => {
            const pressed = filters.window === w;
            return (
              <button
                key={w}
                type="button"
                aria-pressed={pressed}
                aria-label={`Last ${WINDOW_LABEL[w]}`}
                onClick={() => onChange({ ...filters, window: w })}
                className={`num px-2.5 py-1 text-[11px] uppercase ${FOCUS_RING} ${
                  pressed ? "bg-maroon font-semibold text-cream" : "text-ink-soft hover:bg-haldi/15"
                }`}
              >
                {WINDOW_LABEL[w]}
              </button>
            );
          })}
        </div>

        <label className="flex items-center gap-1.5">
          <span className="label">Sev</span>
          <select
            value={filters.minSeverity}
            onChange={(e) => onChange({ ...filters, minSeverity: Number(e.target.value) as Severity })}
            className="input !w-auto !px-1.5 !py-0.5 !text-[12px]"
          >
            <option value={1}>Any</option>
            <option value={2}>2+</option>
            <option value={3}>3+</option>
            <option value={4}>4+</option>
            <option value={5}>5 only</option>
          </select>
        </label>
      </div>

      <div role="group" aria-label="Sources" className="flex flex-wrap items-center gap-1.5">
        <span className="label">Src</span>
        {CORE_SOURCES.map((s) => {
          const pressed = filters.sources.includes(s);
          return (
            <button
              key={s}
              type="button"
              aria-pressed={pressed}
              onClick={() => onChange({ ...filters, sources: toggleValue(filters.sources, s, CORE_SOURCES) })}
              className={CHIP}
            >
              {SOURCE_LABEL[s]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
