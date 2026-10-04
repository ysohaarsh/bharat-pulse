"use client";

import { useCallback, useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { EventRow } from "@/lib/types";
import { DEFAULT_FILTERS, type EventFilters, filtersKey, matchesFilters, serializeFilters } from "@/lib/events/filters";
import { useLiveEvents } from "@/lib/events/use-live-events";
import { summarizeSitrep } from "@/lib/events/sitrep";
import type { Category } from "@/lib/types";
import { HudPanel } from "@/components/hud/hud-panel";
import { MapView } from "@/components/map/map-view";
import type { FlyTarget } from "@/components/map/event-map";
import { EventDrawer } from "./event-drawer";
import { EventList } from "./event-list";
import { FilterBar } from "./filter-bar";
import { WINDOW_LABEL } from "./labels";
import { LiveIndicator } from "./live-indicator";
import { SitrepPanel } from "./sitrep-panel";
import { Ticker } from "./ticker";

const TICK_MS = 30_000;

/** Current time that re-renders periodically; starts at the server's clock so SSR and hydration agree. */
function useNow(initial: number): number {
  const [now, setNow] = useState(initial);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);
  return now;
}

type Selection = { id: number; origin: "map" | "feed" };

export function Dashboard({
  initialEvents,
  filters,
  serverNow,
  error,
}: {
  initialEvents: EventRow[];
  filters: EventFilters;
  serverNow: number;
  error: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  // Filters apply locally right away; the server refetch lands when the transition completes.
  const [activeFilters, setActiveFilters] = useOptimistic(filters);
  const { events, freshIds, status } = useLiveEvents(initialEvents, activeFilters);
  const now = useNow(serverNow);

  const visible = useMemo(
    () => events.filter((e) => matchesFilters(e, activeFilters, now)),
    [events, activeFilters, now],
  );

  const [selection, setSelection] = useState<Selection | null>(null);
  const [flyTarget, setFlyTarget] = useState<FlyTarget | null>(null);
  const selected = selection ? (visible.find((e) => e.id === selection.id) ?? null) : null;

  const updateFilters = useCallback(
    (next: EventFilters) => {
      startTransition(() => {
        setActiveFilters(next);
        const qs = serializeFilters(next).toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [pathname, router, setActiveFilters],
  );

  const selectFromMap = useCallback((id: number) => setSelection({ id, origin: "map" }), []);

  const selectFromFeed = useCallback(
    (id: number) => {
      setSelection({ id, origin: "feed" });
      const e = visible.find((v) => v.id === id);
      if (e && e.lat != null && e.lng != null) setFlyTarget({ lat: e.lat, lng: e.lng, nonce: Date.now() });
    },
    [visible],
  );

  const closeDrawer = useCallback(() => setSelection(null), []);
  const isolateCategory = useCallback(
    (c: Category) => updateFilters({ ...activeFilters, categories: [c] }),
    [activeFilters, updateFilters],
  );
  const isFiltered = filtersKey(activeFilters) !== "";
  const sitrep = useMemo(() => summarizeSitrep(visible), [visible]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-1.5 lg:grid lg:grid-cols-[300px_minmax(0,1fr)_380px] lg:grid-rows-[minmax(0,1fr)_auto] lg:gap-2 lg:overflow-hidden lg:p-2">
      <MapView
        events={visible}
        selected={selected}
        flyTarget={flyTarget}
        onSelect={selectFromMap}
        className="h-[55vh] shrink-0 lg:col-start-2 lg:row-start-1 lg:h-auto"
      />

      <HudPanel
        as="aside"
        aria-label="Live event feed"
        title="Live feed"
        code="03"
        headingLevel={1}
        right={<LiveIndicator status={status} count={visible.length} pending={isPending} />}
        className="min-h-[70vh] flex-1 lg:col-start-3 lg:row-start-1 lg:min-h-0"
        bodyClassName="relative flex flex-col"
      >
        <FilterBar filters={activeFilters} onChange={updateFilters} />
        {error && (
          <p role="alert" className="border-b border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error} Live updates will still appear as they arrive.
          </p>
        )}
        <EventList
          events={visible}
          now={now}
          selectedId={selected?.id ?? null}
          scrollToId={selection?.origin === "map" ? selection.id : null}
          freshIds={freshIds}
          onSelect={selectFromFeed}
          filtered={isFiltered}
          onResetFilters={() => updateFilters(DEFAULT_FILTERS)}
        />
        {selected && <EventDrawer event={selected} onClose={closeDrawer} />}
      </HudPanel>

      <div className="shrink-0 lg:col-start-1 lg:row-start-1 lg:min-h-0">
        <SitrepPanel
          sitrep={sitrep}
          now={now}
          windowLabel={WINDOW_LABEL[activeFilters.window]}
          onSelect={selectFromFeed}
          onIsolateCategory={isolateCategory}
        />
      </div>

      <div className="hidden lg:col-span-3 lg:row-start-2 lg:block">
        <Ticker events={visible} onSelect={selectFromFeed} />
      </div>
    </div>
  );
}
