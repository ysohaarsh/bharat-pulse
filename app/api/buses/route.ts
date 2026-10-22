import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { decodeVehiclePositions } from "@/lib/transit/delhi";
import { busSnapshotSchema, type BusSnapshot } from "@/lib/transit/types";

export const runtime = "nodejs";

// Delhi Open Transit Data live buses (GTFS-RT VehiclePositions). The key stays on the server.
// Docs: https://otd.delhi.gov.in/documentation/ · Terms: https://otd.delhi.gov.in/terms
const OTD_URL = "https://otd.delhi.gov.in/api/realtime/VehiclePositions.pb";
const CACHE = "public, s-maxage=15, stale-while-revalidate=30";

const fail = (status: number, error: string) =>
  NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

// The live feed is ~0.5 MB (thousands of buses). Besides the CDN cache (s-maxage), keep the decoded
// snapshot in-process for the same window so concurrent/uncached requests don't re-fetch or re-decode.
const MEMO_MS = 15_000;
let memo: { at: number; body: BusSnapshot } | null = null;
let inflight: Promise<NextResponse> | null = null;

export async function GET() {
  if (memo && Date.now() - memo.at < MEMO_MS && process.env.OTD_DELHI_FIXTURE !== "1") {
    return NextResponse.json(memo.body, { headers: { "Cache-Control": CACHE } });
  }
  inflight ??= load().finally(() => {
    inflight = null;
  });
  const res = await inflight;
  return res.clone();
}

async function load(): Promise<NextResponse> {
  // Dev-only: serve the committed test feed so the layer can be seen without a key.
  // Ignored in production builds.
  const useFixture = process.env.OTD_DELHI_FIXTURE === "1" && process.env.NODE_ENV !== "production";

  const key = process.env.OTD_DELHI_API_KEY;
  if (!key && !useFixture) return fail(503, "OTD_DELHI_API_KEY not set");

  let bytes: Uint8Array;
  if (useFixture) {
    bytes = await readFile(path.join(process.cwd(), "lib/transit/__fixtures__/delhi-vehicle-positions.pb"));
  } else {
    try {
      // Error messages below deliberately never include the URL (it carries the key).
      const res = await fetch(`${OTD_URL}?key=${encodeURIComponent(key!)}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return fail(502, `OTD Delhi responded ${res.status}`);
      bytes = new Uint8Array(await res.arrayBuffer());
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      return fail(502, timedOut ? "OTD Delhi timed out" : "OTD Delhi unreachable");
    }
  }

  try {
    let snapshot = busSnapshotSchema.parse(decodeVehiclePositions(bytes));
    if (useFixture) {
      // Re-date the saved feed to "now" so ages and colours look live in dev.
      const shift = Math.floor(Date.now() / 1000) - snapshot.ts;
      snapshot = { ...snapshot, ts: snapshot.ts + shift, vehicles: snapshot.vehicles.map((r) => [...r.slice(0, 6), r[6] + shift] as typeof r) };
    }
    if (!useFixture) memo = { at: Date.now(), body: snapshot };
    return NextResponse.json(snapshot, { headers: { "Cache-Control": CACHE } });
  } catch {
    return fail(502, "OTD Delhi returned an unreadable feed");
  }
}
