// Builds every boundary file the app uses from open sources (run: `npm run geo:build`).
//
// Sources (downloaded into data/raw/ on first run, gitignored):
//   - DataMeet maps (MIT): Survey of India outline, states, 2011 districts, assembly constituencies
//   - shijithpk/2024_maps_supplement (public domain): 543 Lok Sabha seats after the 2023
//     Assam + J&K delimitation, new J&K and Sikkim assembly maps
//
// Outputs:
//   public/geo/*.geojson       light, simplified overlays the map fetches on demand (committed)
//   data/processed/*.geojson   finer polygons for PostGIS; loaded by scripts/load-boundaries.mjs (gitignored)
//   lib/india/places.json      state + district centroids for the offline news geocoder (committed)
//
// Known gaps, documented in docs/INDIA_DATA_SOURCES.md: assembly seats outside J&K/Sikkim are
// pre-2023 (Assam is pre-delimitation), districts are Census 2011 (~640, today ~780), and the
// AC file predates Telangana — states are assigned spatially, so Telangana seats land correctly.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import mapshaper from "mapshaper";

const ROOT = process.cwd();
const RAW = path.join(ROOT, "data", "raw");
const PROCESSED = path.join(ROOT, "data", "processed");
const PUBLIC_GEO = path.join(ROOT, "public", "geo");

const DATAMEET = "https://raw.githubusercontent.com/datameet/maps/master";
const SUPPLEMENT = "https://raw.githubusercontent.com/shijithpk/2024_maps_supplement/main";
const shp = (dir, base) => ["shp", "dbf", "shx", "prj"].map((ext) => [`${base}.${ext}`, `${dir}/${base}.${ext}`]);

const DOWNLOADS = [
  ["india-soi.geojson", `${DATAMEET}/Country/india-soi.geojson`],
  ...shp(`${DATAMEET}/States`, "Admin2"),
  ...shp(`${DATAMEET}/Districts/Census_2011`, "2011_Dist"),
  ...shp(`${DATAMEET}/assembly-constituencies`, "India_AC"),
  ["india_ls_seats_543.geojson", `${SUPPLEMENT}/india_ls_seats_543.geojson`],
  ["jk_assembly.geojson", `${SUPPLEMENT}/j_and_k_assembly_new_borders.geojson`],
  ["sikkim_assembly.geojson", `${SUPPLEMENT}/sikkim_assembly_updated.geojson`],
];

const STATES = JSON.parse(readFileSync(path.join(ROOT, "lib", "india", "states.json"), "utf8"));
const norm = (s) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z]/g, "");
const STATE_BY_NAME = new Map();
for (const s of STATES) for (const n of [s.name, ...s.aliases]) STATE_BY_NAME.set(norm(n), s);
function stateCode(name) {
  const s = STATE_BY_NAME.get(norm(String(name ?? "")));
  if (!s) throw new Error(`Unknown state name in source data: "${name}"`);
  return s.code;
}

/** "Sonitpur (ex Tezpur)" → "Sonitpur"; title-case ALL-CAPS names. */
function cleanName(name) {
  const s = String(name ?? "")
    .replace(/\s*\(ex [^)]*\)\s*/i, "")
    .trim();
  const titled = s === s.toUpperCase() ? s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()) : s;
  return titled.replace(/\((sc|st)\)/gi, (m) => m.toUpperCase());
}

/** Merge features sharing `properties.code` into one (Multi)Polygon; source files split some seats. */
function mergeByCode(features) {
  const byCode = new Map();
  for (const f of features) {
    if (!f.geometry) continue;
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    const prev = byCode.get(f.properties.code);
    if (prev) prev.geometry.coordinates.push(...polys);
    else byCode.set(f.properties.code, { ...f, geometry: { type: "MultiPolygon", coordinates: [...polys] } });
  }
  return [...byCode.values()];
}

async function download() {
  mkdirSync(RAW, { recursive: true });
  for (const [file, url] of DOWNLOADS) {
    const dest = path.join(RAW, file);
    if (existsSync(dest)) continue;
    console.log(`downloading ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  }
}

/** Runs a mapshaper command string; returns the parsed GeoJSON written to `out`. */
async function ms(cmd, out = "out.json") {
  const outputs = await mapshaper.applyCommands(`${cmd} -o ${out} format=geojson precision=0.00001`);
  return JSON.parse(outputs[out].toString());
}

const raw = (f) => JSON.stringify(path.join(RAW, f));

function write(file, data) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data));
  console.log(`wrote ${path.relative(ROOT, file)} (${(Buffer.byteLength(JSON.stringify(data)) / 1024).toFixed(0)} KB, ${data.features?.length ?? data.length} items)`);
}

function mapProps(fc, fn) {
  return { type: "FeatureCollection", features: fc.features.map((f) => ({ ...f, properties: fn(f.properties) })) };
}

async function main() {
  await download();

  // ---- States (the spatial reference for everything else) ----
  const statesFine = mapProps(await ms(`-i ${raw("Admin2.shp")} -simplify 8% keep-shapes`), (p) => ({
    code: stateCode(p.ST_NM),
    name: STATES.find((s) => s.code === stateCode(p.ST_NM)).name,
  }));
  write(path.join(PROCESSED, "states.geojson"), statesFine);
  const statesPath = path.join(PROCESSED, "states.geojson");

  write(
    path.join(PUBLIC_GEO, "states.geojson"),
    await ms(`-i ${JSON.stringify(statesPath)} -simplify 12% keep-shapes`),
  );
  write(
    path.join(PUBLIC_GEO, "india.geojson"),
    // -each after -dissolve: without attributes mapshaper writes a bare GeometryCollection.
    await ms(`-i ${raw("india-soi.geojson")} -simplify 1% keep-shapes -dissolve -each 'name="India"'`),
  );

  // ---- Lok Sabha seats (2024) ----
  const pcFine = mapProps(await ms(`-i ${raw("india_ls_seats_543.geojson")} -simplify 15% keep-shapes`), (p) => ({
    code: `PC:${p.unique_id}`,
    name: cleanName(p.ls_seat_name),
    source_name: p.ls_seat_name,
    state_code: stateCode(p.state_ut_name),
  }));
  write(path.join(PROCESSED, "pc.geojson"), pcFine);
  write(
    path.join(PUBLIC_GEO, "pc.geojson"),
    mapProps(await ms(`-i ${JSON.stringify(path.join(PROCESSED, "pc.geojson"))} -simplify 20% keep-shapes`), (p) => ({
      code: p.code,
      name: p.name,
      state_code: p.state_code,
    })),
  );

  // ---- Assembly seats: DataMeet all-India, minus J&K and Sikkim (replaced by newer maps) ----
  // `-join point-method` gives each seat the state its interior point falls in.
  const acMain = await ms(
    `-i ${raw("India_AC.shp")} -filter "ST_NAME !== 'JAMMU & KASHMIR' && ST_NAME !== 'SIKKIM'"` +
      ` -join ${JSON.stringify(statesPath)} point-method fields=code -simplify 15% keep-shapes`,
  );
  const acJk = await ms(`-i ${raw("jk_assembly.geojson")} -simplify 15% keep-shapes`);
  const acSk = await ms(`-i ${raw("sikkim_assembly.geojson")} -simplify 15% keep-shapes`);
  const acFeatures = mergeByCode([
    // AC_NO 0 rows are unnamed slivers (water bodies, gaps), not seats.
    ...acMain.features.filter((f) => f.properties.AC_NO > 0 && f.properties.AC_NAME).map((f) => ({
      ...f,
      properties: {
        code: `AC:${f.properties.code ?? stateCode(f.properties.ST_NAME)}:${f.properties.AC_NO}`,
        name: cleanName(f.properties.AC_NAME),
        name_hi: null,
        state_code: f.properties.code ?? stateCode(f.properties.ST_NAME),
        number: f.properties.AC_NO,
        district: cleanName(f.properties.DIST_NAME),
      },
    })),
    // seat_id 9999 marks areas claimed by India that are in no seat; the outline still covers them.
    ...acJk.features.filter((f) => f.properties.seat_name_en && f.properties.seat_id < 9999).map((f) => ({
      ...f,
      properties: {
        code: `AC:IN-JK:${f.properties.seat_id}`,
        name: f.properties.seat_name_en,
        name_hi: f.properties.seat_name_hi ?? null,
        state_code: "IN-JK",
        number: f.properties.seat_id,
        district: f.properties.seat_district_en ?? null,
      },
    })),
    ...acSk.features.map((f) => ({
      ...f,
      properties: {
        code: `AC:IN-SK:${f.properties.ac_num}`,
        name: f.properties.ac_name,
        name_hi: null,
        state_code: "IN-SK",
        number: f.properties.ac_num,
        district: null,
      },
    })),
  ]);
  const unassigned = acFeatures.filter((f) => !f.properties.state_code);
  if (unassigned.length) throw new Error(`${unassigned.length} assembly seats without a state`);
  const acFine = { type: "FeatureCollection", features: acFeatures };
  write(path.join(PROCESSED, "ac.geojson"), acFine);
  write(
    path.join(PUBLIC_GEO, "ac.geojson"),
    mapProps(await ms(`-i ${JSON.stringify(path.join(PROCESSED, "ac.geojson"))} -simplify 12% keep-shapes`), (p) => ({
      code: p.code,
      name: p.name,
      state_code: p.state_code,
    })),
  );

  // ---- Districts (Census 2011), state assigned spatially (fixes Telangana) ----
  const districts = mapProps(
    await ms(
      `-i ${raw("2011_Dist.shp")} -join ${JSON.stringify(statesPath)} point-method fields=code -simplify 10% keep-shapes`,
    ),
    (p) => ({
      code: `DT:${p.censuscode}`,
      name: cleanName(p.DISTRICT),
      state_code: p.code ?? stateCode(p.ST_NM),
    }),
  );
  write(path.join(PROCESSED, "districts.geojson"), districts);

  // ---- Gazetteer: interior points of states and districts ----
  const points = async (file) =>
    (await ms(`-i ${JSON.stringify(file)} -points inner`)).features.map((f) => ({
      ...f.properties,
      lng: Math.round(f.geometry.coordinates[0] * 1000) / 1000,
      lat: Math.round(f.geometry.coordinates[1] * 1000) / 1000,
    }));
  const statePts = await points(statesPath);
  const districtPts = await points(path.join(PROCESSED, "districts.geojson"));
  const places = [
    ...statePts.map((p) => ({ kind: "state", name: p.name, state: p.code, lat: p.lat, lng: p.lng })),
    ...districtPts.map((p) => ({ kind: "district", name: p.name, state: p.state_code, lat: p.lat, lng: p.lng })),
  ];
  writeFileSync(path.join(ROOT, "lib", "india", "places.json"), JSON.stringify(places, null, 0).replace(/\},\{/g, "},\n{") + "\n");
  console.log(`wrote lib/india/places.json (${places.length} places)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
