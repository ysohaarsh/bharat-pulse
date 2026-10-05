"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import "./map.css";

import { useEffect, useRef } from "react";
import { Map as MapLibreMap, NavigationControl, setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
import { INDIA_BOUNDS, INDIA_CENTER, indiaStyle } from "./india-style";

setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

export interface PickMapProps {
  value: { lat: number; lng: number } | null;
  onChange: (p: { lat: number; lng: number }) => void;
}

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const pin = (p: { lat: number; lng: number }): GeoJSON.Feature => ({
  type: "Feature",
  properties: {},
  geometry: { type: "Point", coordinates: [p.lng, p.lat] },
});

/** Small map for placing one pin (report location). Click to move the pin. */
export default function PickMap({ value, onChange }: PickMapProps) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const readyRef = useRef(false);
  const latest = useRef({ value, onChange });
  useEffect(() => {
    latest.current = { value, onChange };
  });

  useEffect(() => {
    if (!ref.current) return;
    const start = latest.current.value;
    const map = new MapLibreMap({
      container: ref.current,
      style: indiaStyle(),
      center: start ? [start.lng, start.lat] : INDIA_CENTER,
      zoom: start ? 13 : 3.6,
      maxBounds: INDIA_BOUNDS,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), "top-left");
    map.on("load", () => {
      map.addSource("pin", { type: "geojson", data: latest.current.value ? pin(latest.current.value) : EMPTY });
      map.addLayer({
        id: "pin-halo",
        type: "circle",
        source: "pin",
        paint: { "circle-color": "#f5e663", "circle-opacity": 0.25, "circle-radius": 16, "circle-blur": 0.6 },
      });
      map.addLayer({
        id: "pin",
        type: "circle",
        source: "pin",
        paint: { "circle-color": "#f5e663", "circle-radius": 6, "circle-stroke-color": "#000", "circle-stroke-width": 2 },
      });
      readyRef.current = true;
    });
    map.on("click", (e) => latest.current.onChange({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
    map.getCanvas().style.cursor = "crosshair";
    return () => {
      readyRef.current = false;
      mapRef.current = null;
      map.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    (map.getSource("pin") as GeoJSONSource | undefined)?.setData(value ? pin(value) : EMPTY);
    if (value && !map.getBounds().contains([value.lng, value.lat])) map.flyTo({ center: [value.lng, value.lat], zoom: 14 });
  }, [value]);

  return <div ref={ref} className="pulse-map h-full w-full" aria-label="Click to place the report location" />;
}
