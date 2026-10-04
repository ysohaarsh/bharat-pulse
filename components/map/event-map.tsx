"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import "./map.css";

import { useEffect, useRef, useState } from "react";
import {
  GPUInitializationError,
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type ExpressionSpecification,
  type FilterSpecification,
  type GeoJSONSource,
  type LngLat,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import { CATEGORY_META } from "@/lib/categories";
import type { EventRow } from "@/lib/types";
import { pulseStyle } from "./pulse-style";

// Served from public/ by scripts/copy-maplibre-worker.mjs (MapLibre's documented Next.js setup).
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

export type GeoEvent = EventRow & { lat: number; lng: number };

/** A request to fly the map to an event; `nonce` lets the same event be re-targeted. */
export interface FlyTarget {
  lat: number;
  lng: number;
  nonce: number;
}

export interface EventMapProps {
  events: GeoEvent[];
  selected: GeoEvent | null;
  flyTarget: FlyTarget | null;
  onSelect: (id: number) => void;
}

const ACCENT = "#00ff88";
const WARN = "#ffb020";
const DANGER = "#ff3355";
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
/** Marker radius in px for a severity 1–5 (same scale the legend describes). */
const RADIUS: ExpressionSpecification = ["+", 4, ["*", 2, ["get", "severity"]]];
/** Cluster color = most severe event inside it. */
const CLUSTER_COLOR: ExpressionSpecification = ["step", ["get", "maxSev"], ACCENT, 3, WARN, 4, DANGER];
const PULSE_MS = 1800;
/** Zoom at which the globe fills an ~830px panel; scaled so it fits smaller (mobile) panels too. */
const BASE_ZOOM = 2.1;
function fitZoom(el: HTMLElement): number {
  const size = Math.min(el.clientWidth, el.clientHeight) || 830;
  return Math.min(BASE_ZOOM, Math.max(0.8, BASE_ZOOM + Math.log2(size / 830)));
}
const SPIN_DEG_PER_SEC = 3;

function toFeatures(events: GeoEvent[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: events.map((e) => ({
      type: "Feature",
      id: e.id,
      geometry: { type: "Point", coordinates: [e.lng, e.lat] },
      properties: { id: e.id, title: e.title, severity: e.severity, color: CATEGORY_META[e.category].color },
    })),
  };
}

function formatCoord(value: number, pos: string, neg: string): string {
  return `${Math.abs(value).toFixed(2).padStart(6, "0")}°${value >= 0 ? pos : neg}`;
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Adds the event, cluster, pulse and selection layers on top of the basemap. */
function addEventLayers(map: MapLibreMap) {
  map.addSource("events", {
    type: "geojson",
    data: EMPTY,
    cluster: true,
    clusterRadius: 45,
    clusterMaxZoom: 6,
    clusterProperties: { maxSev: ["max", ["get", "severity"]] },
  });
  map.addSource("selected", { type: "geojson", data: EMPTY });

  const clustered: FilterSpecification = ["has", "point_count"];
  const single: FilterSpecification = ["!", ["has", "point_count"]];

  map.addLayer({
    id: "cluster-halo",
    type: "circle",
    source: "events",
    filter: clustered,
    paint: {
      "circle-color": CLUSTER_COLOR,
      "circle-opacity": 0.14,
      "circle-blur": 0.6,
      "circle-radius": ["step", ["get", "point_count"], 22, 10, 27, 50, 34],
    },
  });
  map.addLayer({
    id: "clusters",
    type: "circle",
    source: "events",
    filter: clustered,
    paint: {
      "circle-color": "#010805",
      "circle-opacity": 0.85,
      "circle-stroke-color": CLUSTER_COLOR,
      "circle-stroke-width": 1.5,
      "circle-radius": ["step", ["get", "point_count"], 14, 10, 17, 50, 22],
    },
  });
  map.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: "events",
    filter: clustered,
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 11,
      "text-allow-overlap": true,
    },
    paint: { "text-color": CLUSTER_COLOR, "text-halo-color": "#000", "text-halo-width": 0.6 },
  });
  map.addLayer({
    id: "events-glow",
    type: "circle",
    source: "events",
    filter: single,
    paint: {
      "circle-color": ["get", "color"],
      "circle-radius": ["+", RADIUS, 5],
      "circle-opacity": 0.22,
      "circle-blur": 1,
    },
  });
  map.addLayer({
    id: "events-points",
    type: "circle",
    source: "events",
    filter: single,
    paint: {
      "circle-color": ["get", "color"],
      "circle-opacity": 0.5,
      "circle-radius": RADIUS,
      "circle-stroke-color": ["get", "color"],
      "circle-stroke-width": 1.5,
    },
  });
  map.addLayer({
    id: "events-hot",
    type: "circle",
    source: "events",
    filter: ["all", single, [">=", ["get", "severity"], 4]],
    paint: {
      "circle-color": "transparent",
      "circle-radius": RADIUS,
      "circle-stroke-color": ["get", "color"],
      "circle-stroke-width": 3,
      "circle-stroke-opacity": 0.6,
    },
  });
  map.addLayer({
    id: "selected-halo",
    type: "circle",
    source: "selected",
    paint: { "circle-color": ACCENT, "circle-opacity": 0.25, "circle-blur": 0.8, "circle-radius": ["+", RADIUS, 12] },
  });
  map.addLayer({
    id: "selected-ring",
    type: "circle",
    source: "selected",
    paint: {
      "circle-color": ["get", "color"],
      "circle-opacity": 0.9,
      "circle-radius": ["+", RADIUS, 3],
      "circle-stroke-color": ACCENT,
      "circle-stroke-width": 2.5,
    },
  });
}

export default function EventMap({ events, selected, flyTarget, onSelect }: EventMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const readyRef = useRef(false);
  const eventsRef = useRef(events);
  const selectedRef = useRef(selected);
  const onSelectRef = useRef(onSelect);
  const [failed, setFailed] = useState(false);
  const [cursor, setCursor] = useState<LngLat | null>(null);
  const [zoom, setZoom] = useState(BASE_ZOOM);

  useEffect(() => {
    eventsRef.current = events;
    selectedRef.current = selected;
    onSelectRef.current = onSelect;
  });

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current) return;
    let map: MapLibreMap;
    const initialZoom = fitZoom(containerRef.current);
    try {
      map = new MapLibreMap({
        container: containerRef.current,
        style: pulseStyle(),
        center: [15, 22],
        zoom: initialZoom,
        minZoom: 0.8,
        maxZoom: 16,
        attributionControl: { compact: true },
      });
    } catch (err) {
      console.warn("[map] WebGL2 unavailable:", err instanceof GPUInitializationError ? err.message : err);
      queueMicrotask(() => setFailed(true));
      return;
    }
    mapRef.current = map;
    queueMicrotask(() => setZoom(initialZoom));
    map.addControl(new NavigationControl({ visualizePitch: true }), "top-left");

    const popup = new Popup({ closeButton: false, closeOnClick: false, className: "pulse-tip", offset: 10 });
    const motionOk = !reducedMotion();
    let raf = 0;
    let lastFrame = 0;
    let spinning = motionOk;
    const stopSpin = () => {
      spinning = false;
    };

    map.on("load", () => {
      addEventLayers(map);
      readyRef.current = true;
      (map.getSource("events") as GeoJSONSource).setData(toFeatures(eventsRef.current));
      const sel = selectedRef.current;
      if (sel) (map.getSource("selected") as GeoJSONSource).setData(toFeatures([sel]));

      // Pulse severity 4+ markers and slowly spin the globe until the user takes control.
      const tick = (now: number) => {
        raf = requestAnimationFrame(tick);
        if (document.hidden || now - lastFrame < 33) return;
        const dt = lastFrame ? now - lastFrame : 0;
        lastFrame = now;
        if (motionOk) {
          const p = (Math.sin(((now % PULSE_MS) / PULSE_MS) * Math.PI * 2) + 1) / 2;
          map.setPaintProperty("events-hot", "circle-stroke-width", 1.5 + 8 * p);
          map.setPaintProperty("events-hot", "circle-stroke-opacity", 0.9 - 0.75 * p);
        }
        if (spinning && map.getZoom() < 3 && !map.isMoving()) {
          const c = map.getCenter();
          map.setCenter([c.lng + (SPIN_DEG_PER_SEC * dt) / 1000, c.lat]);
        }
      };
      if (motionOk) raf = requestAnimationFrame(tick);
    });

    for (const ev of ["mousedown", "touchstart", "wheel", "dragstart"] as const) map.on(ev, stopSpin);

    map.on("click", "events-points", (e: MapLayerMouseEvent) => {
      const id = Number(e.features?.[0]?.properties?.id);
      if (Number.isFinite(id)) onSelectRef.current(id);
    });
    map.on("click", "clusters", async (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      const zoomTo = await (map.getSource("events") as GeoJSONSource).getClusterExpansionZoom(
        Number(f.properties?.cluster_id),
      );
      const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
      map.easeTo({ center: [lng, lat], zoom: zoomTo + 0.5, duration: 700 });
    });
    for (const layer of ["events-points", "clusters"]) {
      map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
    }
    map.on("mousemove", "events-points", (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
      popup.setLngLat([lng, lat]).setText(String(f.properties?.title ?? "")).addTo(map);
    });
    map.on("mouseleave", "events-points", () => popup.remove());
    map.on("mousemove", (e) => setCursor(e.lngLat.wrap()));
    map.on("mouseout", () => setCursor(null));
    map.on("zoomend", () => setZoom(map.getZoom()));

    return () => {
      cancelAnimationFrame(raf);
      popup.remove();
      readyRef.current = false;
      mapRef.current = null;
      map.remove();
    };
  }, []);

  // Realtime: push new data into the existing source; the map is never re-mounted.
  useEffect(() => {
    if (readyRef.current) (mapRef.current?.getSource("events") as GeoJSONSource | undefined)?.setData(toFeatures(events));
  }, [events]);

  useEffect(() => {
    if (readyRef.current) {
      (mapRef.current?.getSource("selected") as GeoJSONSource | undefined)?.setData(
        selected ? toFeatures([selected]) : EMPTY,
      );
    }
  }, [selected]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyTarget) return;
    map.flyTo({ center: [flyTarget.lng, flyTarget.lat], zoom: Math.max(map.getZoom(), 4.5), duration: 1200 });
  }, [flyTarget]);

  if (failed) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-background text-center">
        <span className="blink text-sm font-bold tracking-[0.4em] text-danger">NO SIGNAL</span>
        <span className="max-w-xs text-[11px] text-muted">
          This device can&apos;t render the 3D globe (WebGL2 unavailable). The live feed and SITREP still work.
        </span>
      </div>
    );
  }

  return (
    <div className="pulse-map relative h-full w-full" aria-label="Globe of recent world events">
      {/* Not `absolute`: maplibre-gl.css (unlayered) forces .maplibregl-map to position: relative. */}
      <div ref={containerRef} className="h-full w-full" />
      <div
        aria-hidden
        className="pointer-events-none absolute right-2 top-2 z-10 hidden border border-border-strong bg-background/80 px-2 py-1 font-mono text-[10px] tracking-wider text-accent sm:block"
      >
        {cursor
          ? `LAT ${formatCoord(cursor.lat, "N", "S")}  LON ${formatCoord(cursor.lng, "E", "W")}`
          : "LAT ---.--°  LON ---.--°"}
        <span className="ml-3 text-muted">Z{zoom.toFixed(1).padStart(4, "0")}</span>
      </div>
    </div>
  );
}
