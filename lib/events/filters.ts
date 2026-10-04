import { CATEGORIES, type Category, type EventRow, type Severity, type Source } from "@/lib/types";
import { CORE_CATEGORIES, CORE_SOURCES, isSportsEvent } from "./sports";

export const TIME_WINDOWS = ["1h", "6h", "24h", "7d"] as const;
export type TimeWindow = (typeof TIME_WINDOWS)[number];

export const WINDOW_MS: Record<TimeWindow, number> = {
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

/**
 * Sports is an opt-in side feed (see ./sports.ts). It is OFF by default and controlled only by
 * whether `categories` contains "sports":
 * - "All" means every non-sports ("core") category; Sports is a separate toggle.
 * - The core part of `categories` is never empty, except in the sports-only view (`["sports"]`).
 * - `sources` lists core sources only; sports items ignore it.
 *
 * URL (all keys optional, defaults omitted):
 *   cat=<core categories>   omitted = all core; `cat=sports` alone = sports-only view
 *   sports=1                opt in to sports alongside the core categories
 *   src=<core sources>      omitted = all core
 *   sev=1..5, win=1h|6h|24h|7d
 * Old links (no `sports`, no "sports" in `cat`) keep their exact meaning.
 */
export interface EventFilters {
  /** Categories to include; contains "sports" only when the sports feed is opted in. */
  categories: Category[];
  /** Non-sports sources to include. Never empty — "all" is every core source. */
  sources: Source[];
  minSeverity: Severity;
  window: TimeWindow;
}

export const DEFAULT_FILTERS: EventFilters = {
  categories: [...CORE_CATEGORIES],
  sources: [...CORE_SOURCES],
  minSeverity: 1,
  window: "24h",
};

/** URL search param keys. Kept short so shared links stay readable. */
const KEYS = { categories: "cat", sports: "sports", sources: "src", minSeverity: "sev", window: "win" } as const;

type RawParams =
  | URLSearchParams
  | Record<string, string | string[] | undefined>
  | null
  | undefined;

function getParam(params: RawParams, key: string): string | undefined {
  if (!params) return undefined;
  if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
  const v = params[key];
  return Array.isArray(v) ? v[0] : v;
}

function splitList(raw: string | undefined): Set<string> {
  return new Set((raw ?? "").split(",").map((s) => s.trim().toLowerCase()));
}

/** Parses a comma-separated allow-list; unknown values are dropped, empty/missing → all, in canonical order. */
function parseList<T extends string>(raw: string | undefined, all: readonly T[]): T[] {
  if (raw === undefined) return [...all];
  const wanted = splitList(raw);
  const picked = all.filter((v) => wanted.has(v));
  return picked.length > 0 ? picked : [...all];
}

/** Is the opt-in sports feed shown? */
export function sportsEnabled(filters: Pick<EventFilters, "categories">): boolean {
  return filters.categories.includes("sports");
}

/** The non-sports part of a category selection, in canonical order. */
function coreOf(categories: readonly Category[]): Category[] {
  return CORE_CATEGORIES.filter((c) => categories.includes(c));
}

/** Canonical category list from a core selection plus the sports flag. Empty core without sports → all core. */
function withSports(core: readonly Category[], sports: boolean): Category[] {
  if (core.length === 0 && !sports) return [...CORE_CATEGORIES];
  return CATEGORIES.filter((c) => (c === "sports" ? sports : core.includes(c)));
}

/** Parse filters from URL search params (Next `searchParams` object or `URLSearchParams`). Never throws. */
export function parseFilters(params: RawParams): EventFilters {
  const sevRaw = Number.parseInt(getParam(params, KEYS.minSeverity) ?? "", 10);
  const minSeverity = (
    Number.isFinite(sevRaw) ? Math.min(5, Math.max(1, sevRaw)) : DEFAULT_FILTERS.minSeverity
  ) as Severity;

  const winRaw = getParam(params, KEYS.window);
  const window = (TIME_WINDOWS as readonly string[]).includes(winRaw ?? "")
    ? (winRaw as TimeWindow)
    : DEFAULT_FILTERS.window;

  const catRaw = getParam(params, KEYS.categories);
  const sportsInCat = splitList(catRaw).has("sports");
  const sports = sportsInCat || ["1", "true", "on"].includes((getParam(params, KEYS.sports) ?? "").toLowerCase());
  const pickedCore = CORE_CATEGORIES.filter((c) => splitList(catRaw).has(c));
  // `cat=sports` (no core categories) is the sports-only view; otherwise empty/junk → all core.
  const core = pickedCore.length > 0 || sportsInCat ? pickedCore : [...CORE_CATEGORIES];

  return {
    categories: withSports(core, sports),
    sources: parseList(getParam(params, KEYS.sources), CORE_SOURCES),
    minSeverity,
    window,
  };
}

/** Serialize filters to search params, omitting anything equal to the default so URLs stay short. */
export function serializeFilters(filters: EventFilters): URLSearchParams {
  const params = new URLSearchParams();
  const sports = sportsEnabled(filters);
  const core = coreOf(filters.categories);
  if (core.length === 0) {
    if (sports) params.set(KEYS.categories, "sports");
  } else {
    if (core.length < CORE_CATEGORIES.length) params.set(KEYS.categories, core.join(","));
    if (sports) params.set(KEYS.sports, "1");
  }
  const sources = CORE_SOURCES.filter((s) => filters.sources.includes(s));
  if (sources.length > 0 && sources.length < CORE_SOURCES.length) {
    params.set(KEYS.sources, sources.join(","));
  }
  if (filters.minSeverity !== DEFAULT_FILTERS.minSeverity) {
    params.set(KEYS.minSeverity, String(filters.minSeverity));
  }
  if (filters.window !== DEFAULT_FILTERS.window) params.set(KEYS.window, filters.window);
  return params;
}

/** Stable string key for a filter set (useful for memo/effect deps). */
export function filtersKey(filters: EventFilters): string {
  return serializeFilters(filters).toString();
}

/** Earliest `occurred_at` (ms epoch) included by the filter's time window. */
export function windowStart(filters: EventFilters, now: number): number {
  return now - WINDOW_MS[filters.window];
}

/** Pure predicate shared by the client (realtime inserts, local re-filtering) and tests. */
export function matchesFilters(
  event: Pick<EventRow, "category" | "source" | "severity" | "occurred_at">,
  filters: EventFilters,
  now: number | Date,
): boolean {
  const nowMs = typeof now === "number" ? now : now.getTime();
  if (isSportsEvent(event)) {
    if (!sportsEnabled(filters)) return false;
  } else {
    if (!filters.categories.includes(event.category)) return false;
    if (!filters.sources.includes(event.source)) return false;
  }
  if (event.severity < filters.minSeverity) return false;
  const t = Date.parse(event.occurred_at);
  if (Number.isNaN(t)) return false;
  return t >= windowStart(filters, nowMs);
}

/** Toggle membership of `value`; toggling off the last remaining value resets to "all". */
export function toggleValue<T extends string>(selected: readonly T[], value: T, all: readonly T[]): T[] {
  const next = selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value];
  return next.length === 0 ? [...all] : all.filter((v) => next.includes(v));
}

/**
 * Toggle one category chip. Core categories toggle within the core set (the sports flag is kept;
 * removing the last core category resets to all core, or leaves the sports-only view when sports
 * is on). "sports" toggles the opt-in sports feed.
 */
export function toggleCategory(categories: readonly Category[], value: Category): Category[] {
  const sports = categories.includes("sports");
  const core = coreOf(categories);
  if (value === "sports") return withSports(core, !sports);
  const nextCore = core.includes(value) ? core.filter((c) => c !== value) : coreOf([...core, value]);
  return withSports(nextCore, sports);
}

/** "All" chip: every core category, keeping the sports flag as it is. */
export function selectAllCategories(categories: readonly Category[]): Category[] {
  return withSports(CORE_CATEGORIES, categories.includes("sports"));
}
