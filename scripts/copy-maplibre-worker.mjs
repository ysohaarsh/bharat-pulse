// MapLibre v6's worker imports its sibling `maplibre-gl-shared.mjs`, which Next's bundlers
// don't emit next to the worker. Serve both from public/ instead (MapLibre's documented
// Turbopack/Next setup). Runs before dev/build so the files always match node_modules.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const dist = path.join(path.dirname(createRequire(import.meta.url).resolve("maplibre-gl/package.json")), "dist");
const dest = path.join(process.cwd(), "public", "maplibre");

mkdirSync(dest, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(path.join(dist, file), path.join(dest, file));
}
