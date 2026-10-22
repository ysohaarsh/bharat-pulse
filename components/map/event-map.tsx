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
import { displayTitle } from "@/lib/i18n/display";
import type { UiLang } from "@/lib/i18n/languages";
import type { EventRow } from "@/lib/types";
import { INDIA_BOUNDS, INDIA_CENTER, indiaStyle } from "./india-style";
import { LAYER_KEYS, type LayerKey, type OverlayData } from "./layers";

// Served from public/ by scripts/copy-maplibre-worker.mjs (MapLibre's documented Next.js setup).
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

export type GeoEvent = EventRow & { lat: number; lng: number };

/** A request to fly the map to a point; `nonce` lets the same point be re-targeted. */
export interface FlyTarget {
  lat: number;
  lng: number;
  nonce: number;
  zoom?: number;
}

export interface EventMapProps {
  events: GeoEvent[];
  selected: GeoEvent | null;
  flyTarget: FlyTarget | null;
  onSelect: (id: number) => void;
  /** Click on empty map: "who represents this point?" */
  onPick?: (lat: number, lng: number) => void;
  picked?: { lat: number; lng: number } | null;
  layers: Record<LayerKey, boolean>;
  overlays: OverlayData;
  lang: UiLang;
}

const ACCENT = "#0f6e6e";
const WARN = "#c77d00";
const DANGER = "#b0231c";
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
/** Marker radius in px for a severity 1–5 (same scale the legend describes). */
const RADIUS: ExpressionSpecification = ["+", 4, ["*", 2, ["get", "severity"]]];
/** Cluster color = most severe event inside it. */
const CLUSTER_COLOR: ExpressionSpecification = ["step", ["get", "maxSev"], ACCENT, 3, WARN, 4, DANGER];
const PULSE_MS = 1800;
/** Zoom at which India fills an ~830px panel; scaled for smaller (mobile) panels. */
const BASE_ZOOM = 3.9;
function fitZoom(el: HTMLElement): number {
  const size = Math.min(el.clientWidth, el.clientHeight) || 830;
  return Math.min(BASE_ZOOM, Math.max(2.6, BASE_ZOOM + Math.log2(size / 830)));
}

/** Layers each toggle controls. */
const LAYER_IDS: Record<LayerKey, string[]> = {
  events: ["cluster-halo", "clusters", "cluster-count", "events-glow", "events-points", "events-hot"],
  pc: ["pc-fill", "pc-line"],
  ac: ["ac-line"],
  projects: ["projects"],
  reports: ["reports"],
  aqi: ["aqi"],
  wards: ["wards-fill", "wards-line", "wards-label"],
};
/** Overlay layers that open a popup when clicked. */
const POPUP_LAYERS = ["projects", "reports", "aqi"] as const;
/** Bengaluru ward outlines: fetched lazily the first time the viewport is zoomed into the city. */
const WARDS_URL = "/geo/wards-blr.geojson";
const WARDS_MINZOOM = 10;
const BLR_BBOX = { w: 77.3, s: 12.7, e: 77.9, n: 13.25 };

function toFeatures(events: GeoEvent[], lang: UiLang): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: events.map((e) => ({
      type: "Feature",
      id: e.id,
      geometry: { type: "Point", coordinates: [e.lng, e.lat] },
      properties: {
        id: e.id,
        title: displayTitle(e, lang),
        severity: e.severity,
        color: CATEGORY_META[e.category].color,
      },
    })),
  };
}

function formatCoord(value: number, pos: string, neg: string): string {
  return `${Math.abs(value).toFixed(2).padStart(6, "0")}°${value >= 0 ? pos : neg}`;
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Constituency outlines, development projects, citizen reports, AQI stations: under the events. */
function addOverlayLayers(map: MapLibreMap) {
  map.addSource("pc", { type: "geojson", data: EMPTY });
  map.addSource("ac", { type: "geojson", data: EMPTY });
  map.addSource("projects", { type: "geojson", data: EMPTY });
  map.addSource("reports", { type: "geojson", data: EMPTY });
  map.addSource("aqi", { type: "geojson", data: EMPTY });
  map.addSource("wards", { type: "geojson", data: EMPTY, promoteId: "code" });
  map.addSource("picked", { type: "geojson", data: EMPTY });

  map.addLayer({
    id: "pc-fill",
    type: "fill",
    source: "pc",
    layout: { visibility: "none" },
    paint: { "fill-color": ACCENT, "fill-opacity": 0.02 },
  });
  map.addLayer({
    id: "pc-line",
    type: "line",
    source: "pc",
    layout: { visibility: "none" },
    paint: { "line-color": "#0e8aa6", "line-opacity": 0.55, "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.4, 9, 1.4] },
  });
  map.addLayer({
    id: "wards-fill",
    type: "fill",
    source: "wards",
    minzoom: WARDS_MINZOOM,
    layout: { visibility: "none" },
    paint: { "fill-color": "#b8862b", "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.18, 0.02] },
  });
  map.addLayer({
    id: "wards-line",
    type: "line",
    source: "wards",
    minzoom: WARDS_MINZOOM,
    layout: { visibility: "none" },
    paint: { "line-color": "#b8862b", "line-opacity": 0.6, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 14, 1.5] },
  });
  map.addLayer({
    id: "wards-label",
    type: "symbol",
    source: "wards",
    minzoom: 12.5,
    layout: { visibility: "none", "text-field": ["to-string", ["get", "number"]], "text-font": ["Noto Sans Regular"], "text-size": 11 },
    paint: { "text-color": "#7a1e1e", "text-halo-color": "#f6efe0", "text-halo-width": 1.2 },
  });
  map.addLayer({
    id: "ac-line",
    type: "line",
    source: "ac",
    minzoom: 5,
    layout: { visibility: "none" },
    paint: { "line-color": "#7a1e1e", "line-opacity": 0.45, "line-dasharray": [1, 1], "line-width": 0.7 },
  });
  map.addLayer({
    id: "aqi",
    type: "circle",
    source: "aqi",
    layout: { visibility: "none" },
    paint: {
      "circle-color": ["get", "color"],
      "circle-opacity": 0.75,
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 4, 8, 9],
      "circle-stroke-color": "#fbf6ea",
      "circle-stroke-width": 0.8,
    },
  });
  map.addLayer({
    id: "projects",
    type: "circle",
    source: "projects",
    layout: { visibility: "none" },
    paint: {
      "circle-color": ["match", ["get", "kind"], "metro", "#c2308f", "railway", "#a8650a", "highway", "#0e8aa6", "#8a8576"],
      "circle-opacity": 0.85,
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 2.5, 9, 6],
      "circle-stroke-color": "#fbf6ea",
      "circle-stroke-width": 0.6,
    },
  });
  map.addLayer({
    id: "reports",
    type: "circle",
    source: "reports",
    layout: { visibility: "none" },
    paint: {
      "circle-color": ["case", ["==", ["get", "status"], "resolved"], "#346c25", "#c99700"],
      "circle-opacity": 0.9,
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, ["+", 3, ["min", ["get", "upvotes"], 6]], 10, 9],
      "circle-stroke-color": "#fbf6ea",
      "circle-stroke-width": 1,
    },
  });
}

/** Adds the event, cluster, pulse and selection layers on top of the overlays. */
function addEventLayers(map: MapLibreMap) {
  map.addSource("events", {
    type: "geojson",
    data: EMPTY,
    cluster: true,
    clusterRadius: 40,
    clusterMaxZoom: 7,
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
      "circle-color": "#fbf6ea",
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
    paint: { "text-color": CLUSTER_COLOR, "text-halo-color": "#fbf6ea", "text-halo-width": 0.6 },
  });
  map.addLayer({
    id: "events-glow",
    type: "circle",
    source: "events",
    filter: single,
    paint: { "circle-color": ["get", "color"], "circle-radius": ["+", RADIUS, 5], "circle-opacity": 0.22, "circle-blur": 1 },
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
  map.addLayer({
    id: "picked",
    type: "circle",
    source: "picked",
    paint: {
      "circle-color": "transparent",
      "circle-radius": 9,
      "circle-stroke-color": ACCENT,
      "circle-stroke-width": 2,
    },
  });
}

/** Lazily fetch the heavy constituency outlines the first time their layer is switched on. */
const BOUNDARY_URLS: Partial<Record<LayerKey, string>> = { pc: "/geo/pc.geojson", ac: "/geo/ac.geojson" };

export default function EventMap({ events, selected, flyTarget, onSelect, onPick, picked, layers, overlays, lang }: EventMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const readyRef = useRef(false);
  const latest = useRef({ events, selected, onSelect, onPick, layers, overlays, picked, lang });
  const loadedBoundaries = useRef(new Set<LayerKey>());
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [cursor, setCursor] = useState<LngLat | null>(null);
  const [zoom, setZoom] = useState(BASE_ZOOM);
  const [viewTick, setViewTick] = useState(0);

  useEffect(() => {
    latest.current = { events, selected, onSelect, onPick, layers, overlays, picked, lang };
  });

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current) return;
    let map: MapLibreMap;
    const initialZoom = fitZoom(containerRef.current);
    try {
      map = new MapLibreMap({
        container: containerRef.current,
        style: indiaStyle(),
        center: INDIA_CENTER,
        zoom: initialZoom,
        minZoom: 2.6,
        maxZoom: 16,
        maxBounds: INDIA_BOUNDS,
        attributionControl: { compact: true, customAttribution: "Boundaries: Survey of India via DataMeet" },
      });
    } catch (err) {
      console.warn("[map] WebGL2 unavailable:", err instanceof GPUInitializationError ? err.message : err);
      queueMicrotask(() => setFailed(true));
      return;
    }
    mapRef.current = map;
    queueMicrotask(() => setZoom(initialZoom));
    map.addControl(new NavigationControl({ visualizePitch: false }), "top-left");

    const hover = new Popup({ closeButton: false, closeOnClick: false, className: "pulse-tip", offset: 10 });
    const info = new Popup({ closeButton: true, closeOnClick: true, className: "pulse-tip pulse-info", offset: 10, maxWidth: "280px" });
    const wardTip = new Popup({ closeButton: false, closeOnClick: false, className: "pulse-tip", offset: 8 });
    const motionOk = !reducedMotion();
    let raf = 0;
    let lastFrame = 0;

    map.on("load", () => {
      addOverlayLayers(map);
      addEventLayers(map);
      readyRef.current = true;
      setReady(true);
      const cur = latest.current;
      (map.getSource("events") as GeoJSONSource).setData(toFeatures(cur.events, cur.lang));
      if (cur.selected) (map.getSource("selected") as GeoJSONSource).setData(toFeatures([cur.selected], cur.lang));

      // Pulse severity 4+ markers (animation).
      const tick = (now: number) => {
        raf = requestAnimationFrame(tick);
        if (document.hidden || now - lastFrame < 33) return;
        lastFrame = now;
        const p = (Math.sin(((now % PULSE_MS) / PULSE_MS) * Math.PI * 2) + 1) / 2;
        map.setPaintProperty("events-hot", "circle-stroke-width", 1.5 + 8 * p);
        map.setPaintProperty("events-hot", "circle-stroke-opacity", 0.9 - 0.75 * p);
      };
      if (motionOk) raf = requestAnimationFrame(tick);
    });

    map.on("click", (e) => {
      const hits = map.queryRenderedFeatures(e.point, {
        layers: ["events-points", "clusters", ...POPUP_LAYERS].filter((id) => map.getLayer(id)),
      });
      const top = hits[0];
      if (!top) {
        info.remove();
        latest.current.onPick?.(e.lngLat.lat, e.lngLat.lng);
        return;
      }
      const [lng, lat] = (top.geometry as GeoJSON.Point).coordinates;
      if (top.layer.id === "events-points") {
        const id = Number(top.properties?.id);
        if (Number.isFinite(id)) latest.current.onSelect(id);
      } else if (top.layer.id === "clusters") {
        void (map.getSource("events") as GeoJSONSource)
          .getClusterExpansionZoom(Number(top.properties?.cluster_id))
          .then((z) => map.easeTo({ center: [lng, lat], zoom: z + 0.5, duration: 700 }));
      } else {
        info.setLngLat([lng, lat]).setDOMContent(popupContent(top.layer.id, top.properties ?? {})).addTo(map);
      }
    });

    for (const layer of ["events-points", "clusters", ...POPUP_LAYERS]) {
      map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
    }
    map.on("mousemove", "events-points", (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
      hover.setLngLat([lng, lat]).setText(String(f.properties?.title ?? "")).addTo(map);
    });
    map.on("mouseleave", "events-points", () => hover.remove());
    let hoveredWard: string | null = null;
    const clearWard = () => {
      if (hoveredWard != null) map.setFeatureState({ source: "wards", id: hoveredWard }, { hover: false });
      hoveredWard = null;
      wardTip.remove();
    };
    map.on("mousemove", "wards-fill", (e: MapLayerMouseEvent) => {
      // Markers sit on top of the wards; don't show a ward tip while hovering one.
      const markers = ["events-points", "clusters", ...POPUP_LAYERS].filter((id) => map.getLayer(id));
      if (markers.length && map.queryRenderedFeatures(e.point, { layers: markers }).length) return clearWard();
      const f = e.features?.[0];
      if (!f) return;
      const code = String(f.properties?.code ?? "");
      if (code !== hoveredWard) {
        clearWard();
        hoveredWard = code;
        map.setFeatureState({ source: "wards", id: code }, { hover: true });
      }
      wardTip.setLngLat(e.lngLat).setDOMContent(wardContent(f.properties ?? {})).addTo(map);
    });
    map.on("mouseleave", "wards-fill", clearWard);
    map.on("mousemove", (e) => setCursor(e.lngLat.wrap()));
    map.on("mouseout", () => setCursor(null));
    map.on("zoomend", () => setZoom(map.getZoom()));
    map.on("moveend", () => setViewTick((n) => n + 1));

    return () => {
      cancelAnimationFrame(raf);
      hover.remove();
      info.remove();
      wardTip.remove();
      readyRef.current = false;
      mapRef.current = null;
      map.remove();
    };
  }, []);

  // Realtime: push new data into the existing sources; the map is never re-mounted.
  useEffect(() => {
    if (ready) (mapRef.current?.getSource("events") as GeoJSONSource | undefined)?.setData(toFeatures(events, lang));
  }, [events, lang, ready]);

  useEffect(() => {
    if (ready) {
      (mapRef.current?.getSource("selected") as GeoJSONSource | undefined)?.setData(
        selected ? toFeatures([selected], lang) : EMPTY,
      );
    }
  }, [selected, lang, ready]);

  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    if (!map) return;
    (map.getSource("picked") as GeoJSONSource | undefined)?.setData(
      picked ? { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [picked.lng, picked.lat] } } : EMPTY,
    );
  }, [picked, ready]);

  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    if (!map) return;
    (map.getSource("projects") as GeoJSONSource | undefined)?.setData(overlays.projects);
    (map.getSource("reports") as GeoJSONSource | undefined)?.setData(overlays.reports);
    (map.getSource("aqi") as GeoJSONSource | undefined)?.setData(overlays.aqi);
  }, [overlays, ready]);

  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    if (!map) return;
    for (const key of LAYER_KEYS) {
      const on = layers[key];
      for (const id of LAYER_IDS[key]) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
      const url = BOUNDARY_URLS[key];
      if (on && url && !loadedBoundaries.current.has(key)) {
        loadedBoundaries.current.add(key);
        (map.getSource(key) as GeoJSONSource | undefined)?.setData(url);
      }
    }
  }, [layers, ready]);

  // Ward outlines: fetched once, only when the toggle is on and the view is zoomed into Bengaluru.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !layers.wards || loadedBoundaries.current.has("wards")) return;
    const b = map.getBounds();
    const inBlr = b.getWest() < BLR_BBOX.e && b.getEast() > BLR_BBOX.w && b.getSouth() < BLR_BBOX.n && b.getNorth() > BLR_BBOX.s;
    if (map.getZoom() < WARDS_MINZOOM || !inBlr) return;
    loadedBoundaries.current.add("wards");
    (map.getSource("wards") as GeoJSONSource | undefined)?.setData(WARDS_URL);
  }, [viewTick, layers.wards, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyTarget) return;
    map.flyTo({ center: [flyTarget.lng, flyTarget.lat], zoom: Math.max(map.getZoom(), flyTarget.zoom ?? 6.5), duration: 1200 });
  }, [flyTarget]);

  if (failed) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-background text-center">
        <span className="blink text-sm font-bold tracking-[0.4em] text-danger">NO SIGNAL</span>
        <span className="max-w-xs text-[11px] text-muted">
          This device can&apos;t render the map (WebGL2 unavailable). The live feed and India Now panel still work.
        </span>
      </div>
    );
  }

  return (
    <div className="pulse-map relative h-full w-full" aria-label="Map of India with live events">
      {/* Not `absolute`: maplibre-gl.css (unlayered) forces .maplibregl-map to position: relative. */}
      <div ref={containerRef} className="h-full w-full" />
      <div
        aria-hidden
        className="pointer-events-none absolute right-2 top-2 z-10 hidden border border-border-strong bg-surface/90 px-2 py-1 font-mono text-[10px] tracking-wider text-maroon sm:block"
      >
        {cursor
          ? `LAT ${formatCoord(cursor.lat, "N", "S")}  LON ${formatCoord(cursor.lng, "E", "W")}`
          : "LAT ---.--°  LON ---.--°"}
        <span className="ml-3 text-muted">Z{zoom.toFixed(1).padStart(4, "0")}</span>
      </div>
    </div>
  );
}

/** Tooltip body for a ward polygon (names are untrusted data, so DOM text nodes). */
function wardContent(p: Record<string, unknown>): HTMLElement {
  const root = document.createElement("div");
  const title = document.createElement("div");
  title.className = "font-bold";
  title.textContent = `Ward ${String(p.number ?? "")} · ${String(p.name ?? "")}`;
  root.appendChild(title);
  if (p.corporation) {
    const corp = document.createElement("div");
    corp.textContent = String(p.corporation);
    root.appendChild(corp);
  }
  return root;
}

/** Popup body for an overlay feature, built as DOM nodes (feature text is untrusted). */
function popupContent(layer: string, p: Record<string, unknown>): HTMLElement {
  const root = document.createElement("div");
  const line = (text: string, cls = "") => {
    const el = document.createElement("div");
    el.textContent = text;
    if (cls) el.className = cls;
    root.appendChild(el);
  };
  const link = (href: unknown, text: string) => {
    if (typeof href !== "string" || !/^https:\/\//.test(href)) return;
    const a = document.createElement("a");
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = text;
    root.appendChild(a);
  };
  if (layer === "projects") {
    line(String(p.name ?? ""), "font-bold");
    line(`${String(p.kind ?? "").toUpperCase()} · under construction · ${String(p.segments ?? 1)} OSM segment(s)`);
    link(p.url, "View on OpenStreetMap ↗");
  } else if (layer === "reports") {
    line(String(p.kindLabel ?? p.kind ?? ""), "font-bold");
    line(String(p.description ?? ""));
    line(`${String(p.status ?? "")} · ${String(p.upvotes ?? 0)} ✋ · ${String(p.when ?? "")}`);
    link(p.photo, "Photo ↗");
  } else if (layer === "aqi") {
    line(`${String(p.label ?? "")}`, "font-bold");
    line(`AQI ${String(p.value ?? "")} — ${String(p.band ?? "")}${p.modelled ? " (modelled)" : ""}`);
  }
  return root;
}
