// OSM relay: runs the Overpass queries from a GitHub runner (Overpass times out from Vercel/AWS)
// and POSTs the raw results to /api/ingest?source=osm. Used by .github/workflows/osm-relay.yml.
//
//   node scripts/osm-relay.mjs                      states due this hour (same rotation as statesForRun)
//   node scripts/osm-relay.mjs --states=IN-KA,IN-GA one or more states;  --states=all for all 36
//   node scripts/osm-relay.mjs --dry-run=out.json   fetch, print counts/timings, write payload, don't POST
//
// Env: CRON_SECRET (not needed for --dry-run), INGEST_URL (default: production), OSM_BUDGET_MS (default 480000).
//
// SOURCE OF TRUTH for the query text, bbox splits and rotation is lib/jobs/osm.ts; this file is a
// plain-JS copy (Node can't resolve the "@/" alias or TypeScript there). lib/jobs/jobs.test.ts
// checks the copies stay identical.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const STATES = JSON.parse(readFileSync(new URL("../lib/india/states.json", import.meta.url), "utf8"));

export const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
/** OVERPASS_URLS env (comma-separated) overrides the mirrors, for testing against a local stub. */
const MIRRORS = process.env.OVERPASS_URLS ? process.env.OVERPASS_URLS.split(",") : OVERPASS_URLS;
export const STATES_PER_RUN = 6;
export const SPLIT_BBOXES = {
  "IN-UP": [23.8, 77.0, 30.5, 84.7],
  "IN-MH": [15.6, 72.6, 22.1, 80.9],
  "IN-RJ": [23.0, 69.4, 30.2, 78.3],
  "IN-MP": [21.0, 74.0, 26.9, 82.9],
};
/** Per-POST body cap; Vercel rejects request bodies over 4.5 MB. */
export const MAX_BODY_BYTES = 3_500_000;

export function overpassQuery(stateCode, bbox, serverTimeoutS = 25) {
  const box = bbox ? `(${bbox.join(",")})` : "";
  return `[out:json][timeout:${serverTimeoutS}];
area["ISO3166-2"="${stateCode}"][admin_level=4]->.a;
(
  way["railway"="construction"](area.a)${box};
  way["highway"="construction"]["construction"~"^(motorway|trunk|primary)$"](area.a)${box};
);
out center tags qt;`;
}

export function overpassQueries(stateCode, serverTimeoutS = 25) {
  const box = SPLIT_BBOXES[stateCode];
  if (!box) return [overpassQuery(stateCode, undefined, serverTimeoutS)];
  const [s, w, n, e] = box;
  const mid = (s + n) / 2;
  return [overpassQuery(stateCode, [s, w, mid, e], serverTimeoutS), overpassQuery(stateCode, [mid, w, n, e], serverTimeoutS)];
}

export function statesForRun(now, perRun = STATES_PER_RUN) {
  const slots = Math.ceil(STATES.length / perRun);
  const slot = Math.floor(now.getTime() / 3_600_000) % slots;
  return STATES.slice(slot * perRun, slot * perRun + perRun).map((s) => s.code);
}

/** Keep only what projectsFromOverpass reads (center + a few tags) so POST bodies stay small. */
const KEEP_TAGS = ["name", "railway", "highway", "construction", "operator", "ref"];
export function slimElement(el) {
  const tags = {};
  for (const k of KEEP_TAGS) if (el.tags?.[k] !== undefined) tags[k] = el.tags[k];
  return { type: el.type, id: el.id, center: el.center, tags };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = "BharatPulse/1.0 (https://bharat-pulse-india.vercel.app; https://github.com/ysohaarsh/bharat-pulse)";
let rotation = 0;

/** One query against the mirrors in rotation, with growing backoff between full passes, until `deadline`. */
async function overpassRequest(query, deadline, log) {
  let lastError = new Error("no time left in budget");
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < MIRRORS.length; i++) {
      const left = deadline - Date.now();
      if (left < 5_000) throw lastError;
      const url = MIRRORS[(rotation + i) % MIRRORS.length];
      const host = new URL(url).host;
      try {
        const res = await fetch(url, {
          method: "POST",
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(Math.min(60_000, left)),
          headers: { "User-Agent": UA },
        });
        if (res.ok) {
          const body = await res.json();
          if (Array.isArray(body.elements) && !(body.remark && /timed out|out of memory/i.test(body.remark))) {
            rotation = (rotation + i + 1) % MIRRORS.length;
            return body.elements;
          }
          lastError = new Error(`${host}: ${body.remark ?? "no elements"}`);
        } else lastError = new Error(`${host}: HTTP ${res.status}`);
      } catch (err) {
        lastError = new Error(`${host}: ${err instanceof Error ? err.message : String(err)}`);
      }
      log(`  retry (${lastError.message})`);
    }
    await sleep(Math.min(5_000 * 2 ** pass, Math.max(0, deadline - Date.now() - 5_000)));
  }
  throw lastError;
}

export async function fetchState(stateCode, deadline, log = () => {}) {
  const seen = new Set();
  const elements = [];
  for (const q of overpassQueries(stateCode, 50)) {
    for (const el of await overpassRequest(q, deadline, log)) {
      const k = `${el.type}/${el.id}`;
      if (seen.has(k)) continue;
      seen.add(k);
      elements.push(slimElement(el));
    }
  }
  return { elements };
}

/** Group state results into POST bodies of at most `maxBytes` (a single oversized state still goes alone). */
export function chunkStates(results, maxBytes = MAX_BODY_BYTES) {
  const chunks = [];
  let cur = {};
  let size = 20;
  for (const [code, value] of Object.entries(results)) {
    const bytes = Buffer.byteLength(JSON.stringify(value)) + code.length + 10;
    if (Object.keys(cur).length && size + bytes > maxBytes) {
      chunks.push(cur);
      cur = {};
      size = 20;
    }
    cur[code] = value;
    size += bytes;
  }
  if (Object.keys(cur).length) chunks.push(cur);
  return chunks.map((states) => ({ states }));
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split(/=(.*)/s).slice(0, 2)));
  const dryRun = "dry-run" in args;
  const budget = Number(process.env.OSM_BUDGET_MS ?? 480_000);
  const states =
    !args.states ? statesForRun(new Date())
    : args.states === "all" ? STATES.map((s) => s.code)
    : args.states.split(",").map((s) => s.trim()).filter(Boolean);
  const unknown = states.filter((c) => !STATES.some((s) => s.code === c));
  if (unknown.length) throw new Error(`unknown state(s): ${unknown.join(", ")}`);

  const started = Date.now();
  const deadline = started + budget;
  const queue = [...states];
  const results = {};
  const failed = [];
  const log = (m) => console.log(m);
  console.log(`relaying ${states.length} state(s): ${states.join(" ")}`);
  // Two workers: Overpass allows two concurrent slots per IP.
  const worker = async () => {
    while (queue.length && deadline - Date.now() > 10_000) {
      const code = queue.shift();
      const t0 = Date.now();
      try {
        results[code] = await fetchState(code, deadline, log);
        console.log(`${code}: ${results[code].elements.length} elements in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      } catch (err) {
        failed.push(code);
        console.log(`${code}: FAILED after ${((Date.now() - t0) / 1000).toFixed(1)}s (${err instanceof Error ? err.message : err})`);
      }
    }
  };
  await Promise.all([worker(), worker()]);
  const skipped = queue;
  const bodies = chunkStates(results);
  console.log(`fetched ${Object.keys(results).length}/${states.length} in ${((Date.now() - started) / 1000).toFixed(1)}s; payload ${bodies.map((b) => (Buffer.byteLength(JSON.stringify(b)) / 1024).toFixed(0) + " KB").join(" + ") || "empty"}${skipped.length ? `; out of budget: ${skipped.join(" ")}` : ""}`);

  if (dryRun) {
    const file = args["dry-run"] || "osm-payload.json";
    writeFileSync(file, JSON.stringify({ states: Object.assign({}, ...bodies.map((b) => b.states)) }));
    console.log(`dry run: payload written to ${file}`);
  } else if (bodies.length) {
    const secret = process.env.CRON_SECRET;
    if (!secret) throw new Error("CRON_SECRET is not set");
    const url = `${process.env.INGEST_URL ?? "https://bharat-pulse-india.vercel.app"}/api/ingest?source=osm`;
    for (const body of bodies) {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });
      const text = await res.text();
      console.log(`POST ${Object.keys(body.states).join(",")} -> HTTP ${res.status} ${text.slice(0, 300)}`);
      const out = (() => { try { return JSON.parse(text).results?.[0]; } catch { return undefined; } })();
      if (!res.ok || out?.error) throw new Error(`ingest rejected the payload (HTTP ${res.status})`);
    }
  }
  if (failed.length || skipped.length) {
    console.log(`::warning::OSM relay incomplete. failed: ${failed.join(" ") || "-"}; skipped: ${skipped.join(" ") || "-"}`);
  }
  // Overpass has public outages lasting hours (all mirrors 502/504); failing the hourly job would
  // email the repo owner every hour. Warn instead — the rotation retries these states later.
  if (!Object.keys(results).length) {
    console.log("::warning::no state could be fetched from any Overpass mirror (Overpass outage?) — nothing posted");
    if (process.env.OSM_RELAY_STRICT === "1") throw new Error("no state could be fetched from any Overpass mirror");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`::error::${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
}
