import { z } from "zod";
import { stateByName } from "@/lib/india/states";
import type { Category, NormalizedEvent, Severity } from "@/lib/types";
import { BOT_HEADERS } from "./rss";
import type { Ingester } from "./types";

/**
 * NDMA SACHET — India's Common Alerting Protocol (CAP) portal, built by C-DOT. Every live
 * government warning lands here: IMD (weather), CWC (river floods), INCOIS (tsunami, high
 * waves) and 30+ State Disaster Management Authorities. Keyless JSON.
 *
 * Messages are often in the state's language (`actual_lang`: "te", "hi", "bn", ...); they're
 * stored as-is and translated after ingest (lib/i18n).
 */
export const SACHET_URL = "https://sachet.ndma.gov.in/cap_public_website/FetchAllAlertDetails";
export const SACHET_CAP_URL = (id: string) => `https://sachet.ndma.gov.in/cap_public_website/FetchXMLFile?identifier=${id}`;

const AlertSchema = z.object({
  identifier: z.union([z.number(), z.string()]).transform(String),
  severity: z.string().nullish(),
  severity_color: z.string().nullish(),
  severity_level: z.string().nullish(),
  disaster_type: z.string().min(1),
  area_description: z.string().nullish(),
  warning_message: z.string().nullish(),
  effective_start_time: z.string().min(1),
  effective_end_time: z.string().nullish(),
  actual_lang: z.string().nullish(),
  centroid: z.string().nullish(),
  alert_source: z.string().nullish(),
});

/** Colour-coded CAP severity → 1..5. IMD/NDMA colours: red > orange > yellow > green. */
export function severityFromColor(color: string | null | undefined): Severity {
  switch ((color ?? "").toLowerCase()) {
    case "red":
      return 5;
    case "orange":
      return 4;
    case "yellow":
      return 3;
    case "green":
      return 2;
    default:
      return 2;
  }
}

export function categoryFromDisasterType(type: string): Category {
  const t = type.toLowerCase();
  if (/tsunami|earthquake/.test(t)) return "earthquake";
  if (/cyclone|depression|storm surge/.test(t)) return "cyclone";
  if (/flood|landslide|avalanche|dam|inundation/.test(t)) return "flood";
  if (/heat/.test(t)) return "heat";
  if (/fire/.test(t)) return "wildfire";
  if (/pollution|air/.test(t)) return "air";
  if (/epidemic|disease|outbreak/.test(t)) return "health";
  if (/rain|thunder|lightning|wind|hail|fog|cold|snow|weather|squall|dust|sea|wave/.test(t)) return "weather";
  return "other";
}

/** "Mon Oct 05 00:15:00 IST 2026" (Java Date#toString) → epoch ms; NaN if unparseable. */
export function parseSachetTime(s: string): number {
  const m = /^\w{3} (\w{3}) (\d{1,2}) (\d{2}:\d{2}:\d{2}) (\w+) (\d{4})$/.exec(s.trim());
  if (!m) return Date.parse(s);
  const [, mon, day, time, zone, year] = m;
  const offset = zone === "IST" ? "+05:30" : zone === "UTC" || zone === "GMT" ? "+00:00" : null;
  if (!offset) return NaN;
  const month = "JanFebMarAprMayJunJulAugSepOctNovDec".indexOf(mon) / 3 + 1;
  if (month < 1) return NaN;
  return Date.parse(`${year}-${String(month).padStart(2, "0")}-${day.padStart(2, "0")}T${time}${offset}`);
}

/** "77.53,13.82" (lng,lat) → coordinates, or null when missing/out of range. */
export function parseCentroid(s: string | null | undefined): { lat: number; lng: number } | null {
  if (!s) return null;
  const [lng, lat] = s.split(",").map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/** "Uttar Pradesh SDMA" → IN-UP; agencies like "CWC" or "IMD Chennai" → null (the DB fills it from the centroid). */
export function stateFromSource(source: string | null | undefined): string | null {
  if (!source) return null;
  const m = /^(.*?)\s+SDMA$/i.exec(source.trim());
  return m ? (stateByName(m[1])?.code ?? null) : null;
}

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const truncate = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);

export const sachetIngester: Ingester = {
  source: "sachet",

  async fetchRaw() {
    const res = await fetch(SACHET_URL, { signal: AbortSignal.timeout(20_000), cache: "no-store", headers: BOT_HEADERS });
    if (!res.ok) throw new Error(`SACHET fetch failed: ${res.status} ${res.statusText}`);
    return res.json();
  },

  normalize(raw) {
    if (!Array.isArray(raw)) return [];
    const out: NormalizedEvent[] = [];
    for (const item of raw) {
      const parsed = AlertSchema.safeParse(item);
      if (!parsed.success) continue;
      const a = parsed.data;
      const start = parseSachetTime(a.effective_start_time);
      if (Number.isNaN(start)) continue;
      const end = a.effective_end_time ? parseSachetTime(a.effective_end_time) : NaN;
      const point = parseCentroid(a.centroid);
      const area = clean(a.area_description);
      const message = clean(a.warning_message);
      // The warning itself is the headline (in the issuing state's language); type, area and
      // agency go in the summary, which is English as the portal publishes it.
      const lang = message && /^[a-z]{2,3}$/.test(a.actual_lang ?? "") ? (a.actual_lang as string) : "en";
      const title = message ? truncate(message, 300) : `${a.disaster_type} alert${area ? `: ${area}` : ""}`;
      const summary = [a.disaster_type, area, clean(a.alert_source)].filter(Boolean).join(" · ");

      out.push({
        source: "sachet",
        external_id: a.identifier,
        title,
        summary: summary || null,
        category: categoryFromDisasterType(a.disaster_type),
        severity: severityFromColor(a.severity_color),
        lat: point?.lat ?? null,
        lng: point?.lng ?? null,
        state: stateFromSource(a.alert_source),
        district: null,
        lang,
        url: SACHET_CAP_URL(a.identifier),
        occurred_at: new Date(start).toISOString(),
        raw: { ...a, effective_end: Number.isNaN(end) ? null : new Date(end).toISOString() },
      });
    }
    return out;
  },
};
