import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { isRunnable, runSource, type Runnable } from "@/lib/ingest/run";
import { SOURCES } from "@/lib/types";

// Overpass and data.gov.in can be slow; give runs the full minute.
export const maxDuration = 60;

// Triggered by Supabase pg_cron (via pg_net) with `Authorization: Bearer $CRON_SECRET`.
// POST /api/ingest               -> every event source (not the jobs)
// POST /api/ingest?source=sachet -> one event source, or a job: power | mandi | sansad | osm | translate
export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const param = request.nextUrl.searchParams.get("source");
  if (param && !isRunnable(param)) {
    return NextResponse.json({ error: `unknown source: ${param}` }, { status: 400 });
  }
  // The flights relay (GitHub Actions) POSTs the OpenSky /states/all JSON it fetched;
  // flightMetrics validates it like a fetched payload.
  let payload: unknown;
  if (param === "flights" && request.headers.get("content-type")?.includes("application/json")) {
    payload = await request.json().catch(() => undefined);
  }
  const sources: Runnable[] = param ? [param as Runnable] : [...SOURCES];
  const results = await Promise.all(sources.map((s) => runSource(s, payload)));
  return NextResponse.json({ results });
}
