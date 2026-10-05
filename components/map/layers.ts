import type { DictKey } from "@/lib/i18n/dict";

export const LAYER_KEYS = ["events", "pc", "ac", "projects", "reports", "aqi"] as const;
export type LayerKey = (typeof LAYER_KEYS)[number];

export const LAYER_LABEL: Record<LayerKey, DictKey> = {
  events: "layerEvents",
  pc: "layerPc",
  ac: "layerAc",
  projects: "layerProjects",
  reports: "layerReports",
  aqi: "layerAqi",
};

export const DEFAULT_LAYERS: Record<LayerKey, boolean> = {
  events: true,
  pc: false,
  ac: false,
  projects: false,
  reports: true,
  aqi: false,
};

export interface OverlayData {
  projects: GeoJSON.FeatureCollection<GeoJSON.Point>;
  reports: GeoJSON.FeatureCollection<GeoJSON.Point>;
  aqi: GeoJSON.FeatureCollection<GeoJSON.Point>;
}

export const EMPTY_POINTS: GeoJSON.FeatureCollection<GeoJSON.Point> = { type: "FeatureCollection", features: [] };

export const EMPTY_OVERLAYS: OverlayData = { projects: EMPTY_POINTS, reports: EMPTY_POINTS, aqi: EMPTY_POINTS };
