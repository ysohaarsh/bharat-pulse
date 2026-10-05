import type { ExpressionSpecification, StyleSpecification } from "maplibre-gl";

/**
 * Green-on-black basemap centred on India.
 * Vector data: OpenFreeMap (free, keyless, OpenMapTiles schema — https://openfreemap.org).
 *
 * Borders: OpenStreetMap draws the de-facto lines of control, which is not how maps of India
 * may be published here. So the basemap's own boundary layers are left out and India's outline
 * and state lines are drawn from the Survey of India based GeoJSON in public/geo/ (DataMeet,
 * built by scripts/build-geo.mjs).
 */
export const TILEJSON_URL = "https://tiles.openfreemap.org/planet";
export const GLYPHS_URL = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";

const FONT = ["Noto Sans Regular"];
const C = {
  land: "#062417",
  water: "#010a06",
  waterLine: "#06281a",
  road: "#0b3a24",
  roadMajor: "#11573a",
  building: "#062016",
  border: "#00ff88",
  stateBorder: "#14603e",
  label: "#7dffbf",
  labelMinor: "#3fa874",
  halo: "#000000",
};

const NAME: ExpressionSpecification = ["coalesce", ["get", "name_en"], ["get", "name:latin"], ["get", "name"]];
const isPolygon: ExpressionSpecification = ["match", ["geometry-type"], ["MultiPolygon", "Polygon"], true, false];
const isLine: ExpressionSpecification = ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false];
const isPoint: ExpressionSpecification = ["match", ["geometry-type"], ["MultiPoint", "Point"], true, false];

/** Where the map opens and how far it may pan: the subcontinent plus the island territories. */
export const INDIA_CENTER: [number, number] = [80.5, 22.6];
export const INDIA_BOUNDS: [[number, number], [number, number]] = [
  [55, -2],
  [108, 42],
];

export function indiaStyle(): StyleSpecification {
  return {
    version: 8,
    projection: { type: "mercator" },
    glyphs: GLYPHS_URL,
    sources: {
      openmaptiles: { type: "vector", url: TILEJSON_URL },
      india: { type: "geojson", data: "/geo/india.geojson" },
      states: { type: "geojson", data: "/geo/states.geojson" },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": C.land } },
      {
        id: "water",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "water",
        filter: ["all", isPolygon, ["!=", ["get", "brunnel"], "tunnel"]],
        paint: { "fill-color": C.water, "fill-antialias": false },
      },
      {
        id: "waterway",
        type: "line",
        source: "openmaptiles",
        "source-layer": "waterway",
        minzoom: 6,
        filter: isLine,
        paint: { "line-color": C.waterLine, "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.5, 14, 2] },
      },
      {
        id: "building",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "building",
        minzoom: 13,
        filter: isPolygon,
        paint: { "fill-color": C.building, "fill-outline-color": C.road },
      },
      {
        id: "road-minor",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        minzoom: 10,
        filter: ["all", isLine, ["match", ["get", "class"], ["minor", "service", "tertiary"], true, false]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": C.road, "line-width": ["interpolate", ["exponential", 1.4], ["zoom"], 10, 0.4, 18, 8] },
      },
      {
        id: "road-major",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        minzoom: 5,
        filter: ["all", isLine, ["match", ["get", "class"], ["motorway", "trunk", "primary", "secondary"], true, false]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": C.roadMajor,
          "line-width": ["interpolate", ["exponential", 1.4], ["zoom"], 5, 0.4, 10, 1.2, 18, 12],
        },
      },
      {
        id: "india-fill",
        type: "fill",
        source: "india",
        paint: { "fill-color": C.border, "fill-opacity": 0.035 },
      },
      {
        id: "state-lines",
        type: "line",
        source: "states",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": C.stateBorder,
          "line-dasharray": [2, 2],
          "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.6, 8, 1.4],
        },
      },
      {
        id: "india-outline",
        type: "line",
        source: "india",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": C.border,
          "line-opacity": 0.75,
          "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1.1, 8, 2.2, 12, 3],
          "line-blur": 0.4,
        },
      },
      {
        id: "place-town",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "place",
        minzoom: 8,
        maxzoom: 15,
        filter: ["all", isPoint, ["==", ["get", "class"], "town"]],
        layout: { "text-field": NAME, "text-font": FONT, "text-size": 10, "text-transform": "uppercase" },
        paint: { "text-color": C.labelMinor, "text-halo-color": C.halo, "text-halo-width": 1.2 },
      },
      {
        id: "place-city",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "place",
        minzoom: 3,
        maxzoom: 14,
        filter: ["all", isPoint, ["==", ["get", "class"], "city"]],
        layout: {
          "text-field": NAME,
          "text-font": FONT,
          "text-size": ["interpolate", ["linear"], ["zoom"], 3, 9, 8, 12],
          "text-transform": "uppercase",
          "text-letter-spacing": 0.08,
        },
        paint: { "text-color": C.labelMinor, "text-halo-color": C.halo, "text-halo-width": 1.2 },
      },
      {
        id: "place-country",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "place",
        maxzoom: 8,
        filter: ["all", isPoint, ["==", ["get", "class"], "country"], ["has", "iso_a2"]],
        layout: {
          "text-field": NAME,
          "text-font": FONT,
          "text-size": ["interpolate", ["linear"], ["zoom"], 1, 9, 4, 13, 7, 15],
          "text-transform": "uppercase",
          "text-letter-spacing": 0.2,
          "text-max-width": 8,
        },
        paint: {
          "text-color": C.label,
          "text-opacity": ["interpolate", ["linear"], ["zoom"], 1, 0.55, 3, 0.85],
          "text-halo-color": C.halo,
          "text-halo-width": 1.4,
        },
      },
    ],
  };
}
