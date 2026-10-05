// Loads state / district / Lok Sabha / assembly polygons into Supabase (PostGIS) via the
// service-role-only `load_boundaries` RPC. Run after `npm run geo:build`:
//
//   npm run geo:load            (reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local)
//
// Idempotent: rows upsert on `code`.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. in .env.local).");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const PROCESSED = path.join(process.cwd(), "data", "processed");
const LAYERS = [
  ["state", "states.geojson"],
  ["district", "districts.geojson"],
  ["pc", "pc.geojson"],
  ["ac", "ac.geojson"],
];
// Payload size per RPC call; assembly polygons are small, states are large.
const BATCH = { state: 4, district: 40, pc: 40, ac: 150 };

for (const [kind, file] of LAYERS) {
  const full = path.join(PROCESSED, file);
  if (!existsSync(full)) {
    console.error(`${full} missing — run \`npm run geo:build\` first.`);
    process.exit(1);
  }
  const { features } = JSON.parse(readFileSync(full, "utf8"));
  let loaded = 0;
  for (let i = 0; i < features.length; i += BATCH[kind]) {
    const rows = features.slice(i, i + BATCH[kind]).map((f) => {
      const { code, name, name_hi = null, state_code = null, ...meta } = f.properties;
      return {
        kind,
        code,
        name,
        name_hi,
        state_code: kind === "state" ? code : state_code,
        meta,
        geometry: JSON.stringify(f.geometry),
      };
    });
    const { data, error } = await db.rpc("load_boundaries", { rows });
    if (error) {
      console.error(`${kind} batch at ${i}: ${error.message}`);
      process.exit(1);
    }
    loaded += data ?? 0;
  }
  console.log(`${kind}: ${loaded} rows`);
}
