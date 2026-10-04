import { test, type Page } from "@playwright/test";

/** True when the app can reach Supabase; DB-dependent assertions are skipped otherwise. */
export const HAS_DB = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function skipWithoutDb() {
  test.skip(!HAS_DB, "NEXT_PUBLIC_SUPABASE_URL / ANON_KEY not set — skipping DB-dependent checks");
}

/**
 * Network noise that isn't an app bug: resource 404s/blocked fetches (map tiles, fonts)
 * and Supabase realtime socket hiccups in headless runs.
 */
const IGNORED = [
  /Failed to load resource/i,
  /tile\.openstreetmap|basemaps\.cartocdn|arcgisonline|openfreemap/i,
  /WebSocket connection to .* failed/i,
  // Without Supabase env the app deliberately logs that realtime is unavailable; that's the expected degraded mode.
  ...(HAS_DB ? [] : [/Missing environment variable: NEXT_PUBLIC_SUPABASE/]),
];

/** Collects console errors and uncaught page errors; assert the returned array is empty at the end. */
export function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (IGNORED.some((re) => re.test(text))) return;
    errors.push(`console.error: ${text}`);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}
