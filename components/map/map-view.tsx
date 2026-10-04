"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { hasCoords } from "@/lib/events/row";
import type { EventRow } from "@/lib/types";
import { HudPanel } from "@/components/hud/hud-panel";
import type { FlyTarget, GeoEvent } from "./event-map";
import { MapLegend } from "./legend";

// Leaflet touches `window` at import time, so it must never be server-rendered.
const EventMap = dynamic(() => import("./event-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-background text-xs tracking-[0.3em] text-accent">
      <span className="blink">ACQUIRING MAP…</span>
    </div>
  ),
});

export interface MapViewProps {
  events: EventRow[];
  selected: EventRow | null;
  flyTarget: FlyTarget | null;
  onSelect: (id: number) => void;
  className?: string;
}

export function MapView({ events, selected, flyTarget, onSelect, className = "" }: MapViewProps) {
  const geo = useMemo(() => events.filter(hasCoords) as GeoEvent[], [events]);
  const selectedGeo = selected && hasCoords(selected) ? (selected as GeoEvent) : null;
  const unlocated = events.length - geo.length;

  return (
    <HudPanel
      aria-label="Event map"
      title="Global theater"
      code="02"
      className={className}
      bodyClassName="relative isolate"
      right={
        <span className="hud-label flex gap-3">
          <span>
            Plotted <span className="text-accent">{geo.length}</span>
          </span>
          {unlocated > 0 && (
            <span title="Events without a location appear in the feed only">
              Unlocated <span className="text-warn">{unlocated}</span>
            </span>
          )}
        </span>
      }
    >
      <EventMap events={geo} selected={selectedGeo} flyTarget={flyTarget} onSelect={onSelect} />
      <div className="pointer-events-none absolute bottom-6 left-2 z-[1000]">
        <MapLegend />
      </div>
    </HudPanel>
  );
}
