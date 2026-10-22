"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Popup, type ExpressionSpecification, type FilterSpecification, type Map as MapLibreMap, type MapLayerMouseEvent } from "maplibre-gl";
import { t as tr } from "@/lib/i18n/dict";
import type { UiLang } from "@/lib/i18n/languages";
import { stateByCode } from "@/lib/india/states";
import { NFHS_BY_KEY, nfhsRamp, type NfhsFile, type NfhsIndicator, type NfhsKey } from "@/lib/india/nfhs";

export type NfhsStatus = "idle" | "loading" | "ok" | "error";

const DISTRICTS_URL = "/geo/districts.geojson";
const NFHS_URL = "/geo/nfhs5-districts.json";
const HATCH = "nfhs-hatch";
/** Marker layers that should win the hover over a district. */
const MARKER_LAYERS = ["events-points", "clusters", "projects", "reports", "aqi"];

/** fill-color expression: 5 classes from the indicator's break points, transparent when there is no value. */
export function nfhsFillColor(ind: NfhsIndicator): ExpressionSpecification {
  const [c0, c1, c2, c3, c4] = nfhsRamp(ind);
  const [b0, b1, b2, b3] = ind.bins;
  return ["case", ["has", ind.key], ["step", ["get", ind.key], c0, b0, c1, b1, c2, b2, c3, b3, c4], "rgba(0,0,0,0)"] as ExpressionSpecification;
}

export function formatNfhs(ind: NfhsIndicator, v: number): string {
  return ind.unit === "%" ? `${v.toFixed(1)}%` : String(Math.round(v));
}

function hatchImage(): ImageData | null {
  const c = document.createElement("canvas");
  c.width = c.height = 8;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.strokeStyle = "rgba(86,91,120,0.55)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const o of [-8, 0, 8]) {
    ctx.moveTo(o, 8);
    ctx.lineTo(o + 8, 0);
  }
  ctx.stroke();
  return ctx.getImageData(0, 0, 8, 8);
}

/** Tooltip body, built from DOM nodes (names come from data files). */
function tipContent(p: Record<string, unknown>, ind: NfhsIndicator, file: NfhsFile, lang: UiLang): HTMLElement {
  const root = document.createElement("div");
  const state = stateByCode(String(p.state_code ?? ""));
  const title = document.createElement("div");
  title.className = "font-bold";
  title.textContent = `${String(p.name ?? "")}${state ? ` · ${lang === "hi" ? state.hi : state.name}` : ""}`;
  root.appendChild(title);
  const line = (text: string, cls = "") => {
    const el = document.createElement("div");
    if (cls) el.className = cls;
    el.textContent = text;
    root.appendChild(el);
  };
  const v = p[ind.key];
  const label = tr(lang, ind.label);
  if (typeof v !== "number") {
    line(`${label}: ${tr(lang, "nfhsNoData")}`, "text-muted");
    return root;
  }
  line(`${label}: ${formatNfhs(ind, v)}`);
  const st = file.s[String(p.state_code ?? "")]?.[ind.key];
  const ctx = [st != null ? `${tr(lang, "nfhsState")} ${formatNfhs(ind, st)}` : "", file.nat[ind.key] != null ? `${tr(lang, "nfhsIndia")} ${formatNfhs(ind, file.nat[ind.key]!)}` : ""].filter(Boolean);
  if (ctx.length) line(ctx.join(" · "), "text-muted whitespace-nowrap");
  if (typeof p.n === "number" && p.n > 1) line(tr(lang, "nfhsMerged").replace("{n}", String(p.n - 1)), "text-muted text-[11px]");
  return root;
}

/**
 * NFHS-5 district choropleth. Nothing is fetched until `enabled` first becomes true; then the district
 * polygons (~0.5 MB) and the indicator file (~60 KB) are loaded once, joined by district code, and added
 * as a source plus fill/hatch/line layers below the pincode layer (so markers stay on top).
 */
export function useNfhsLayer(mapRef: RefObject<MapLibreMap | null>, ready: boolean, enabled: boolean, indicator: NfhsKey, lang: UiLang): NfhsStatus {
  const [status, setStatus] = useState<NfhsStatus>("idle");
  const started = useRef(false);
  const file = useRef<NfhsFile | null>(null);
  const live = useRef({ indicator, lang });
  const popup = useRef<Popup | null>(null);

  useEffect(() => {
    live.current = { indicator, lang };
  }, [indicator, lang]);

  // Load once, build layers.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !enabled || started.current) return;
    started.current = true;
    queueMicrotask(() => setStatus("loading"));
    Promise.all([fetch(DISTRICTS_URL).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))), fetch(NFHS_URL).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))])
      .then(([geo, nfhs]: [GeoJSON.FeatureCollection, NfhsFile]) => {
        if (mapRef.current !== map) return;
        file.current = nfhs;
        for (const f of geo.features) {
          const row = nfhs.d[String(f.properties?.code)];
          if (row) Object.assign(f.properties!, row);
        }
        const ind = NFHS_BY_KEY[live.current.indicator];
        const img = hatchImage();
        if (img && !map.hasImage(HATCH)) map.addImage(HATCH, img);
        const before = map.getLayer("pc-fill") ? "pc-fill" : undefined;
        map.addSource("nfhs", { type: "geojson", data: geo, promoteId: "code" });
        map.addLayer(
          {
            id: "nfhs-fill",
            type: "fill",
            source: "nfhs",
            filter: ["has", ind.key] as FilterSpecification,
            paint: { "fill-color": nfhsFillColor(ind), "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.95, 0.8] },
          },
          before,
        );
        map.addLayer(
          {
            id: "nfhs-nodata",
            type: "fill",
            source: "nfhs",
            filter: ["!", ["has", ind.key]] as FilterSpecification,
            paint: img ? { "fill-pattern": HATCH, "fill-opacity": 0.9 } : { "fill-color": "#565b78", "fill-opacity": 0.2 },
          },
          before,
        );
        map.addLayer(
          {
            id: "nfhs-line",
            type: "line",
            source: "nfhs",
            paint: { "line-color": "#a8915a", "line-opacity": 0.55, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.2, 8, 1] },
          },
          before,
        );

        const tip = new Popup({ closeButton: false, closeOnClick: false, className: "pulse-tip", offset: 8 });
        popup.current = tip;
        let hovered: string | null = null;
        const clear = () => {
          if (hovered != null && map.getSource("nfhs")) map.setFeatureState({ source: "nfhs", id: hovered }, { hover: false });
          hovered = null;
          tip.remove();
        };
        const show = (e: MapLayerMouseEvent) => {
          const markers = MARKER_LAYERS.filter((id) => map.getLayer(id));
          if (markers.length && map.queryRenderedFeatures(e.point, { layers: markers }).length) return clear();
          const f = e.features?.[0];
          if (!f) return;
          const code = String(f.properties?.code ?? "");
          if (code !== hovered) {
            clear();
            hovered = code;
            map.setFeatureState({ source: "nfhs", id: code }, { hover: true });
          }
          const cur = live.current;
          tip.setLngLat(e.lngLat).setDOMContent(tipContent(f.properties ?? {}, NFHS_BY_KEY[cur.indicator], nfhs, cur.lang)).addTo(map);
        };
        for (const id of ["nfhs-fill", "nfhs-nodata"]) {
          map.on("mousemove", id, show);
          map.on("click", id, show); // touch screens have no hover
          map.on("mouseleave", id, clear);
        }
        setStatus("ok");
      })
      .catch((err) => {
        console.warn("[nfhs] load failed", err);
        started.current = false;
        setStatus("error");
      });
  }, [mapRef, ready, enabled]);

  // Show/hide.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || status !== "ok") return;
    for (const id of ["nfhs-fill", "nfhs-nodata", "nfhs-line"]) map.setLayoutProperty(id, "visibility", enabled ? "visible" : "none");
    if (!enabled) popup.current?.remove();
  }, [mapRef, ready, enabled, status]);

  // Indicator switch: paint + filters only, no data reload.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || status !== "ok" || !map.getLayer("nfhs-fill")) return;
    const ind = NFHS_BY_KEY[indicator];
    map.setPaintProperty("nfhs-fill", "fill-color", nfhsFillColor(ind));
    map.setFilter("nfhs-fill", ["has", ind.key] as FilterSpecification);
    map.setFilter("nfhs-nodata", ["!", ["has", ind.key]] as FilterSpecification);
    popup.current?.remove();
  }, [mapRef, ready, status, indicator]);

  useEffect(
    () => () => {
      popup.current?.remove();
    },
    [],
  );

  return enabled ? status : "idle";
}
