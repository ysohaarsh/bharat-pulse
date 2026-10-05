"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";
import { hasCoords } from "@/lib/events/row";
import type { EventRow } from "@/lib/types";
import { HudPanel } from "@/components/hud/hud-panel";
import { useLang } from "@/components/i18n/lang-provider";
import { WhoisPanel, type PickedPoint } from "@/components/neta/whois-panel";
import { FOCUS_RING } from "@/components/feed/labels";
import type { FlyTarget, GeoEvent } from "./event-map";
import { DEFAULT_LAYERS, LAYER_KEYS, LAYER_LABEL, type LayerKey } from "./layers";
import { MapLegend } from "./legend";
import { useOverlays } from "./use-overlays";

// MapLibre touches `window` at import time, so it must never be server-rendered.
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

function LayerToggles({ layers, onToggle }: { layers: Record<LayerKey, boolean>; onToggle: (k: LayerKey) => void }) {
  const { t } = useLang();
  return (
    <fieldset className="pointer-events-auto border border-border-strong bg-background/85 px-2 py-1.5 text-[10px] backdrop-blur">
      <legend className="hud-label px-1 !text-accent">{t("layers")}</legend>
      <ul className="space-y-0.5">
        {LAYER_KEYS.map((k) => (
          <li key={k}>
            <label className={`flex cursor-pointer items-center gap-1.5 uppercase tracking-wider text-muted hover:text-foreground ${FOCUS_RING}`}>
              <input type="checkbox" checked={layers[k]} onChange={() => onToggle(k)} className="accent-[var(--accent)]" />
              {t(LAYER_LABEL[k])}
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

export function MapView({ events, selected, flyTarget, onSelect, className = "" }: MapViewProps) {
  const { t, lang } = useLang();
  const [layers, setLayers] = useState(DEFAULT_LAYERS);
  const [picked, setPicked] = useState<PickedPoint | null>(null);
  const [whoisOpen, setWhoisOpen] = useState(false);
  const [localFly, setLocalFly] = useState<FlyTarget | null>(null);
  const overlays = useOverlays(layers, lang);

  const geo = useMemo(() => events.filter(hasCoords) as GeoEvent[], [events]);
  const selectedGeo = selected && hasCoords(selected) ? (selected as GeoEvent) : null;
  const unlocated = events.length - geo.length;
  // Whichever fly request is newest wins (feed selection vs. pincode/location lookups).
  const fly = !localFly || (flyTarget && flyTarget.nonce > localFly.nonce) ? flyTarget : localFly;

  const pick = useCallback((lat: number, lng: number) => {
    setPicked({ lat, lng });
    setWhoisOpen(true);
  }, []);
  const pickAndFly = useCallback((p: PickedPoint, zoom?: number) => {
    setPicked(p);
    setWhoisOpen(true);
    setLocalFly({ ...p, zoom, nonce: Date.now() });
  }, []);

  return (
    <HudPanel
      aria-label="Event map"
      title={t("panelTheater")}
      code="02"
      className={className}
      bodyClassName="relative isolate"
      right={
        <span className="hud-label flex items-center gap-3">
          <span>
            {t("plotted")} <span className="text-accent">{geo.length}</span>
          </span>
          {unlocated > 0 && (
            <span title="Events without a location appear in the feed only">
              {t("unlocated")} <span className="text-warn">{unlocated}</span>
            </span>
          )}
          {!whoisOpen && (
            <button
              type="button"
              onClick={() => setWhoisOpen(true)}
              className={`border border-border-strong px-1.5 py-0.5 text-accent hover:bg-accent hover:text-black ${FOCUS_RING}`}
            >
              {t("whoTitle")}
            </button>
          )}
        </span>
      }
    >
      <EventMap
        events={layers.events ? geo : []}
        selected={selectedGeo}
        flyTarget={fly}
        onSelect={onSelect}
        onPick={pick}
        picked={whoisOpen ? picked : null}
        layers={layers}
        overlays={overlays}
        lang={lang}
      />
      <div className="pointer-events-none absolute left-12 top-2 z-[1000]">
        <LayerToggles layers={layers} onToggle={(k) => setLayers((l) => ({ ...l, [k]: !l[k] }))} />
      </div>
      {whoisOpen && (
        <div className="pointer-events-none absolute bottom-2 right-2 top-10 z-[1000] flex items-end sm:items-start">
          <WhoisPanel point={picked} onPoint={pickAndFly} onClose={() => setWhoisOpen(false)} />
        </div>
      )}
      <div className="pointer-events-none absolute bottom-6 left-2 z-[1000]">
        <MapLegend />
      </div>
    </HudPanel>
  );
}
