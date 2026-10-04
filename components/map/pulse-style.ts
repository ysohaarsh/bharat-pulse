import type { ExpressionSpecification, StyleSpecification } from "maplibre-gl";

/**
 * Green-on-black basemap for the "control room" globe.
 * Vector data: OpenFreeMap (free, keyless, OpenMapTiles schema — https://openfreemap.org).
 * Any OpenMapTiles-schema provider (e.g. MapTiler) works by swapping TILEJSON_URL/GLYPHS_URL.
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
  graticule: "#00ff88",
};

const NAME: ExpressionSpecification = ["coalesce", ["get", "name_en"], ["get", "name:latin"], ["get", "name"]];
const isPolygon: ExpressionSpecification = ["match", ["geometry-type"], ["MultiPolygon", "Polygon"], true, false];
const isLine: ExpressionSpecification = ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false];
const isPoint: ExpressionSpecification = ["match", ["geometry-type"], ["MultiPoint", "Point"], true, false];

/** Lat/long grid every 15°, drawn as real lines so it curves with the globe. */
export function graticule(step = 15): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  for (let lng = -180; lng < 180; lng += step) {
    const coords: [number, number][] = [];
    for (let lat = -85; lat <= 85; lat += 5) coords.push([lng, lat]);
    features.push({ type: "Feature", properties: { major: lng === 0 }, geometry: { type: "LineString", coordinates: coords } });
  }
  for (let lat = -75; lat <= 75; lat += step) {
    const coords: [number, number][] = [];
    for (let lng = -180; lng <= 180; lng += 5) coords.push([lng, lat]);
    features.push({ type: "Feature", properties: { major: lat === 0 }, geometry: { type: "LineString", coordinates: coords } });
  }
  return { type: "FeatureCollection", features };
}

export function pulseStyle(): StyleSpecification {
  return {
    version: 8,
    projection: { type: "globe" },
    // No physically-based (blue) atmosphere; the green halo is drawn in CSS behind the canvas.
    sky: { "atmosphere-blend": 0 },
    glyphs: GLYPHS_URL,
    sources: {
      openmaptiles: { type: "vector", url: TILEJSON_URL },
      graticule: { type: "geojson", data: graticule() },
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
        id: "graticule",
        type: "line",
        source: "graticule",
        paint: {
          "line-color": C.graticule,
          "line-opacity": ["case", ["get", "major"], 0.35, 0.16],
          "line-width": ["case", ["get", "major"], 1, 0.6],
        },
      },
      {
        id: "boundary-state",
        type: "line",
        source: "openmaptiles",
        "source-layer": "boundary",
        minzoom: 3,
        filter: ["==", ["get", "admin_level"], 4],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": C.stateBorder, "line-dasharray": [2, 2], "line-width": 0.7 },
      },
      {
        id: "boundary-country",
        type: "line",
        source: "openmaptiles",
        "source-layer": "boundary",
        filter: ["all", ["==", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": C.border,
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.45, 6, 0.7],
          "line-width": ["interpolate", ["linear"], ["zoom"], 0, 0.6, 6, 1.4, 12, 2.5],
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
