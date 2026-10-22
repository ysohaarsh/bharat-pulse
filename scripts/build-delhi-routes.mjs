// Builds public/geo/delhi-routes.json (route_id -> [short name, agency_id]) from the Delhi static GTFS.
//
// The static GTFS is a free download but sits behind a short form (name, e-mail, purpose, accept
// Terms) at https://otd.delhi.gov.in/data/static/ , so it cannot be fetched by a script. Download
// the zip yourself, unzip it, then:
//   node scripts/build-delhi-routes.mjs path/to/routes.txt
// Until then the map labels buses with the raw route_id.
import { readFileSync, writeFileSync } from "node:fs";

const src = process.argv[2];
if (!src) {
  console.error("usage: node scripts/build-delhi-routes.mjs <routes.txt>");
  process.exit(1);
}

/** Minimal CSV line splitter with double-quote support. */
function cells(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    }
    else cur += c;
  }
  out.push(cur);
  return out;
}

const lines = readFileSync(src, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
const head = cells(lines[0]).map((h) => h.trim());
const col = (n) => head.indexOf(n);
const [iId, iShort, iLong, iAgency] = ["route_id", "route_short_name", "route_long_name", "agency_id"].map(col);
if (iId < 0) throw new Error("routes.txt has no route_id column");

const routes = {};
for (const line of lines.slice(1)) {
  const r = cells(line);
  const id = r[iId]?.trim();
  if (!id) continue;
  const short = (iShort >= 0 && r[iShort]?.trim()) || (iLong >= 0 && r[iLong]?.trim()) || id;
  routes[id] = [short, iAgency >= 0 ? (r[iAgency]?.trim() ?? "") : ""];
}

const out = new URL("../public/geo/delhi-routes.json", import.meta.url);
writeFileSync(out, JSON.stringify({ source: "otd.delhi.gov.in static GTFS routes.txt", routes }) + "\n");
console.log(`wrote ${Object.keys(routes).length} routes`);
