import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { runIngester } from "@/lib/ingest/run";
import { SOURCES, type Source } from "@/lib/types";

// Triggered by Supabase pg_cron (via pg_net) with `Authorization: Bearer $CRON_SECRET`.
// POST /api/ingest            -> all sources
// POST /api/ingest?source=usgs -> one source
export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const param = request.nextUrl.searchParams.get("source");
  if (param && !SOURCES.includes(param as Source)) {
    return NextResponse.json({ error: `unknown source: ${param}` }, { status: 400 });
  }
  const sources = param ? [param as Source] : [...SOURCES];
  const results = await Promise.all(sources.map(runIngester));
  return NextResponse.json({ results });
}
