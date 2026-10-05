import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { detectPlace } from "@/lib/ingest/geo";
import { stateByName } from "@/lib/india/states";

/**
 * GET /api/pincode?pin=560001 → { lat, lng, district, state, postOffice }
 * India Post's public API (api.postalpincode.in, keyless) names the district; our gazetteer turns
 * that into a point. Approximate by design: it's the district centre, not the street.
 */
const PostOffice = z.object({ Name: z.string(), District: z.string(), State: z.string() });
const Response = z.array(z.object({ Status: z.string(), PostOffice: z.array(PostOffice).nullable() })).min(1);

export async function GET(request: NextRequest) {
  const pin = request.nextUrl.searchParams.get("pin") ?? "";
  if (!/^[1-9]\d{5}$/.test(pin)) return NextResponse.json({ error: "Enter a 6-digit pincode" }, { status: 400 });

  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`, {
      signal: AbortSignal.timeout(8_000),
      next: { revalidate: 60 * 60 * 24 * 30 },
    });
    const parsed = Response.safeParse(await res.json());
    const office = parsed.success ? parsed.data[0].PostOffice?.[0] : undefined;
    if (!office) return NextResponse.json({ error: "Pincode not found" }, { status: 404 });

    const state = stateByName(office.State)?.code ?? null;
    const place = detectPlace(`${office.District}, ${office.State}`) ?? detectPlace(office.Name) ?? detectPlace(office.State);
    if (!place) return NextResponse.json({ error: "Couldn't place that pincode on the map" }, { status: 404 });
    return NextResponse.json(
      { lat: place.lat, lng: place.lng, district: office.District, state: state ?? place.state, postOffice: office.Name },
      { headers: { "Cache-Control": "public, max-age=86400" } },
    );
  } catch {
    return NextResponse.json({ error: "Pincode service unavailable" }, { status: 502 });
  }
}
