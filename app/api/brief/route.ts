import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { generateWorldBrief } from "@/lib/brief/generate";

// LLM call has a 60s timeout; leave headroom for DB work.
export const maxDuration = 90;

// Triggered daily by Supabase pg_cron (via pg_net) with `Authorization: Bearer $CRON_SECRET`.
// POST /api/brief                    -> world brief for the 24h ending at the last full UTC hour
// POST /api/brief?force=1            -> regenerate even if that period already has a brief
// POST /api/brief?end=<ISO 8601>     -> 24h ending at a specific time (testing/backfill)
export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const force = params.get("force") === "1" || params.get("force") === "true";
  const endParam = params.get("end");
  let periodEnd: Date | undefined;
  if (endParam) {
    periodEnd = new Date(endParam);
    if (Number.isNaN(periodEnd.getTime())) {
      return NextResponse.json({ error: `invalid end: ${endParam}` }, { status: 400 });
    }
  }

  try {
    return NextResponse.json(await generateWorldBrief({ force, periodEnd }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[brief] generation failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
