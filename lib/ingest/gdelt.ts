import { inflateRawSync } from "node:zlib";
import { z } from "zod";
import type { Category, NormalizedEvent, Severity } from "@/lib/types";
import { classify } from "./classify";
import { fipsToIso } from "./fips";
import type { Ingester } from "./types";

/**
 * GDELT 2.0 Event export files (updated every 15 minutes).
 *
 * We used to call the DOC 2.0 search API, but it is aggressively per-IP rate limited and
 * effectively blocks shared cloud egress (Vercel): every call returned 429 or `{}`. The raw
 * 15-minute export files on GDELT's Google Cloud Storage mirror have no such limit.
 *
 * - `lastupdate.txt` lists the newest `*.export.CSV.zip` (events) and `*.gkg.csv.zip` (GKG).
 * - Events have no headline, so titles come from the GKG `<PAGE_TITLE>` extra, joined on
 *   SOURCEURL ↔ DocumentIdentifier. An event without a title is useless to us, so the GKG
 *   file is mandatory.
 *
 * Attribution: GDELT requires citing "The GDELT Project (gdeltproject.org)".
 */

export const GDELT_GCS_BASE = "https://storage.googleapis.com/data.gdeltproject.org/gdeltv2/";
export const GDELT_LASTUPDATE_URL = `${GDELT_GCS_BASE}lastupdate.txt`;

const FETCH_TIMEOUT_MS = 20_000;

/** Max events per run; highest severity / most mentions first. */
export const MAX_EVENTS = 150;

/**
 * Noise gate. Counts in a single 15-minute export only describe the window an event was
 * first seen in, so they are weak: across five sampled windows (186 conflict/protest
 * articles), NumSources was 1 for 96% of rows and NumArticles is capped around 10 and
 * mostly reflects repeated mentions inside one article — local crime stories hit 10 as
 * easily as wars do. So a single global threshold cannot separate signal from noise
 * without also discarding most real conflict reporting. Instead:
 *
 * 1. Every row needs NumArticles ≥ 2 (or NumSources ≥ 2): drops single-mention events,
 *    GDELT's most error-prone tier (misparsed sentences like sports "fights").
 * 2. Rows in the two buckets where local crime/court news concentrates need a second,
 *    independent outlet (NumSources ≥ 2):
 *    - root 17 "coerce" (arrests, sentencing, fines, raids) — ~35 of ~42 root-17-only
 *      articles in the sample were local crime, court or off-topic misparses;
 *    - US state/city geocodes (ActionGeo_Type 2/3) — virtually all local shootings,
 *      crashes and trials.
 * Net effect on the sample: local-crime articles mostly drop out, wars/strikes/protests stay.
 */
export const MIN_ARTICLES = 2;
export const CORROBORATED_SOURCES = 2;

const ROOT_CODES = new Set(["14", "17", "18", "19", "20"]);
const ROOT_SEVERITY: Record<string, Severity> = { "14": 2, "17": 3, "18": 3, "19": 4, "20": 5 };
/** classify() categories that override the CAMEO root mapping (a "protest over floods" is a flood). */
const SPECIFIC_CATEGORIES = new Set<Category>(["earthquake", "wildfire", "storm", "volcano", "flood", "health"]);
/** ActionGeo_Type: 1 country, 2 US state, 3 US city, 4 world city, 5 world state. */
const US_LOCAL_GEO_TYPES = new Set([2, 3]);

/** Export (events) TSV column indices, 0-based. */
const COL = {
  globalEventId: 0,
  isRootEvent: 25,
  eventCode: 26,
  rootCode: 28,
  quadClass: 29,
  goldstein: 30,
  numMentions: 31,
  numSources: 32,
  numArticles: 33,
  geoType: 51,
  geoFullName: 52,
  geoCountry: 53,
  lat: 56,
  lng: 57,
  dateAdded: 59,
  sourceUrl: 60,
} as const;
const EXPORT_COLUMNS = 61;

/** GKG TSV column indices. */
const GKG_DOC_ID = 4;
const GKG_EXTRAS = 26;

export interface GdeltRaw {
  /** Decompressed `*.export.CSV` (tab-separated, no header). */
  events: string;
  /** Decompressed `*.gkg.csv` (tab-separated, no header). */
  gkg: string;
}

// ---------------------------------------------------------------- fetching

/** Rewrite `http(s)://data.gdeltproject.org/gdeltv2/…` to the GCS mirror. */
export function toGcsUrl(url: string): string {
  return url.replace(/^https?:\/\/data\.gdeltproject\.org\/gdeltv2\//, GDELT_GCS_BASE);
}

/** Pick the export + GKG zip URLs out of `lastupdate.txt` ("<size> <md5> <url>" per line). */
export function parseLastUpdate(text: string): { exportUrl: string; gkgUrl: string } {
  const urls = text
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/).pop() ?? "")
    .filter((u) => /^https?:\/\//.test(u));
  const exportUrl = urls.find((u) => u.endsWith(".export.CSV.zip"));
  const gkgUrl = urls.find((u) => u.endsWith(".gkg.csv.zip"));
  if (!exportUrl || !gkgUrl) throw new Error("GDELT lastupdate.txt: export/gkg URL not found");
  return { exportUrl: toGcsUrl(exportUrl), gkgUrl: toGcsUrl(gkgUrl) };
}

/**
 * Decompress a single-entry deflate zip (what GDELT publishes) to UTF-8 text.
 * Reads the first local file header; rejects anything we can't handle rather than guessing.
 */
export function unzipSingle(buf: Uint8Array): string {
  const b = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  if (b.length < 30 || b.readUInt32LE(0) !== 0x04034b50) throw new Error("unzip: not a zip file");
  const flags = b.readUInt16LE(6);
  const method = b.readUInt16LE(8);
  if (method !== 8) throw new Error(`unzip: unsupported compression method ${method}`);
  if (flags & 0x0008) throw new Error("unzip: data descriptor (streamed zip) not supported");
  const compressedSize = b.readUInt32LE(18);
  const start = 30 + b.readUInt16LE(26) + b.readUInt16LE(28);
  const end = start + compressedSize;
  if (end > b.length) throw new Error("unzip: truncated archive");
  return inflateRawSync(b.subarray(start, end)).toString("utf8");
}

async function fetchOk(url: string, label: string): Promise<Response> {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: "no-store" });
  if (!res.ok) throw new Error(`GDELT ${label} HTTP ${res.status}`);
  return res;
}

async function fetchZip(url: string, label: string): Promise<string> {
  const res = await fetchOk(url, label);
  return unzipSingle(new Uint8Array(await res.arrayBuffer()));
}

// ---------------------------------------------------------------- parsing

/** "20261004161500" (UTC) → ISO string; null if malformed. */
export function parseGdeltDate(s: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m.map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, se));
  // Reject rollovers like month 13 / hour 25.
  if (date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d || date.getUTCHours() !== h || date.getUTCMinutes() !== mi) {
    return null;
  }
  return date.toISOString();
}

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Decode the HTML entities GDELT leaves in page titles (`&#x2013;`, `&#39;`, `&amp;`, …). */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ent: string) => {
    if (ent[0] === "#") {
      const code = ent[1] === "x" || ent[1] === "X" ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[ent.toLowerCase()] ?? whole;
  });
}

const PAGE_TITLE = /<PAGE_TITLE>(.*?)<\/PAGE_TITLE>/;

/** DocumentIdentifier → cleaned page title, from GKG lines. Only URLs in `wanted` if given. */
export function parseGkgTitles(gkg: string, wanted?: ReadonlySet<string>): Map<string, string> {
  const titles = new Map<string, string>();
  for (const line of gkg.split("\n")) {
    if (!line) continue;
    const cols = line.split("\t");
    const docId = cols[GKG_DOC_ID];
    if (!docId || (wanted && !wanted.has(docId))) continue;
    const m = PAGE_TITLE.exec(cols[GKG_EXTRAS] ?? "");
    if (!m) continue;
    const title = decodeEntities(m[1]).replace(/\s+/g, " ").trim();
    if (title) titles.set(docId, title);
  }
  return titles;
}

const numStr = z.string().trim().min(1).transform(Number).pipe(z.number());
const intStr = numStr.pipe(z.number().int().nonnegative());

const httpUrl = z
  .string()
  .trim()
  .refine((s) => {
    try {
      const u = new URL(s);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  });

const rowSchema = z.object({
  globalEventId: z.string().regex(/^\d+$/),
  isRootEvent: z.string(),
  eventCode: z.string().regex(/^\d{2,4}$/),
  rootCode: z.string().refine((s) => ROOT_CODES.has(s)),
  quadClass: intStr,
  goldstein: numStr,
  numMentions: intStr,
  numSources: intStr,
  numArticles: intStr,
  geoType: intStr,
  geoFullName: z.string().trim(),
  geoCountry: z.string().trim(),
  lat: numStr.pipe(z.number().min(-90).max(90)),
  lng: numStr.pipe(z.number().min(-180).max(180)),
  dateAdded: z.string().regex(/^\d{14}$/),
  sourceUrl: httpUrl,
});
type EventRow = z.infer<typeof rowSchema>;

/** One export TSV line → validated row, or null (wrong shape / not a root we track / bad values). */
export function parseEventRow(line: string): EventRow | null {
  const cols = line.split("\t");
  if (cols.length < EXPORT_COLUMNS || !ROOT_CODES.has(cols[COL.rootCode])) return null;
  const parsed = rowSchema.safeParse(
    Object.fromEntries(Object.entries(COL).map(([key, i]) => [key, cols[i]])),
  );
  if (!parsed.success) return null;
  const r = parsed.data;
  if (r.lat === 0 && r.lng === 0) return null; // GDELT's "no location" placeholder
  return r;
}

/** Noise gate — see MIN_ARTICLES / CORROBORATED_SOURCES. */
export function passesNoiseGate(r: Pick<EventRow, "rootCode" | "geoType" | "numSources" | "numArticles">): boolean {
  if (r.numArticles < MIN_ARTICLES && r.numSources < CORROBORATED_SOURCES) return false;
  const needsCorroboration = r.rootCode === "17" || US_LOCAL_GEO_TYPES.has(r.geoType);
  return !needsCorroboration || r.numSources >= CORROBORATED_SOURCES;
}

const clampSeverity = (n: number): Severity => Math.min(5, Math.max(1, Math.round(n))) as Severity;

/** True when the headline matches at least one classify() keyword (i.e. isn't "other"). */
export function isNewsworthyTitle(title: string): boolean {
  return classify(title).category !== "other";
}

export function categorize(rootCode: string, title: string): { category: Category; severity: Severity } {
  const c = classify(title);
  const category: Category = SPECIFIC_CATEGORIES.has(c.category)
    ? c.category
    : rootCode === "14"
      ? "politics"
      : "conflict";
  return { category, severity: clampSeverity(Math.max(c.severity, ROOT_SEVERITY[rootCode] ?? 1)) };
}

// ---------------------------------------------------------------- ingester

export const gdeltIngester: Ingester<GdeltRaw> = {
  source: "gdelt",

  async fetchRaw() {
    const lastUpdate = await (await fetchOk(GDELT_LASTUPDATE_URL, "lastupdate")).text();
    const { exportUrl, gkgUrl } = parseLastUpdate(lastUpdate);
    const [events, gkg] = await Promise.all([fetchZip(exportUrl, "export"), fetchZip(gkgUrl, "GKG")]);
    return { events, gkg };
  },

  normalize(raw) {
    if (!raw || typeof raw.events !== "string" || typeof raw.gkg !== "string") return [];

    // One row per article: keep the most-mentioned qualifying event.
    const best = new Map<string, EventRow>();
    for (const line of raw.events.split("\n")) {
      const row = parseEventRow(line);
      if (!row || !passesNoiseGate(row)) continue;
      const prev = best.get(row.sourceUrl);
      if (!prev || row.numMentions > prev.numMentions) best.set(row.sourceUrl, row);
    }
    if (best.size === 0) return [];

    const titles = parseGkgTitles(raw.gkg, new Set(best.keys()));
    const now = Date.now();
    const scored: { event: NormalizedEvent; mentions: number }[] = [];

    for (const r of best.values()) {
      const title = titles.get(r.sourceUrl);
      const dateIso = parseGdeltDate(r.dateAdded);
      if (!title || !dateIso) continue;
      // GDELT's CAMEO coding misfires often ("10 Best Far Side Comics About Crime" as a fight);
      // only keep events whose headline itself reads as news our classifier recognises.
      if (!isNewsworthyTitle(title)) continue;

      const { category, severity } = categorize(r.rootCode, title);
      const where = r.geoFullName ? `${r.geoFullName} · ` : "";
      scored.push({
        mentions: r.numMentions,
        event: {
          source: "gdelt",
          external_id: r.sourceUrl,
          title,
          summary: `${where}${r.numSources} source${r.numSources === 1 ? "" : "s"}`,
          category,
          severity,
          lat: r.lat,
          lng: r.lng,
          country: fipsToIso(r.geoCountry),
          url: r.sourceUrl,
          occurred_at: new Date(Math.min(Date.parse(dateIso), now)).toISOString(),
          raw: {
            globalEventId: r.globalEventId,
            eventCode: r.eventCode,
            rootCode: r.rootCode,
            quadClass: r.quadClass,
            goldstein: r.goldstein,
            isRootEvent: r.isRootEvent === "1",
            numMentions: r.numMentions,
            numSources: r.numSources,
            numArticles: r.numArticles,
            geoType: r.geoType,
            geoFullName: r.geoFullName,
            geoCountryFips: r.geoCountry,
            dateAdded: r.dateAdded,
          },
        },
      });
    }

    // Syndicated copies (same headline, different URL) collapse to the strongest one.
    const seenTitles = new Set<string>();
    return scored
      .sort((a, b) => b.event.severity - a.event.severity || b.mentions - a.mentions)
      .filter(({ event }) => {
        const key = event.title.toLowerCase();
        if (seenTitles.has(key)) return false;
        seenTitles.add(key);
        return true;
      })
      .slice(0, MAX_EVENTS)
      .map((s) => s.event);
  },
};
