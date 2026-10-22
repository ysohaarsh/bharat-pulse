import { transit_realtime } from "gtfs-realtime-bindings";
import { rowSchema, type BusRow, type BusSnapshot } from "./types";

/**
 * Delhi Open Transit Data (otd.delhi.gov.in) live bus positions: GTFS-Realtime VehiclePositions
 * protobuf -> compact rows for the map. Pure (no network); the Route Handler does the fetching.
 */

/** protobufjs gives Long for 64-bit fields; plain numbers for the rest. */
function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v && typeof (v as { toNumber?: unknown }).toNumber === "function") return (v as { toNumber(): number }).toNumber();
  return null;
}

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

export function decodeVehiclePositions(buf: Uint8Array): BusSnapshot {
  const feed = transit_realtime.FeedMessage.decode(buf);
  const headerTs = num(feed.header?.timestamp) ?? 0;
  const byId = new Map<string, BusRow>();

  for (const entity of feed.entity) {
    const v = entity.vehicle;
    const pos = v?.position;
    if (!v || !pos) continue;
    const lat = pos.latitude;
    const lng = pos.longitude;
    // (0,0) is what feeds send for "no GPS fix yet".
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) continue;

    const id = v.vehicle?.id || v.vehicle?.label || entity.id;
    const ts = num(v.timestamp) || headerTs;
    const row = [
      id,
      v.trip?.routeId ?? "",
      round(lat, 5),
      round(lng, 5),
      // Unset optional fields read as 0 on decoded messages, hence hasOwn.
      // GTFS-RT speed is metres per second.
      Object.hasOwn(pos, "speed") ? Math.round((pos.speed ?? 0) * 3.6) : 0,
      Object.hasOwn(pos, "bearing") ? Math.round(pos.bearing ?? 0) % 360 : -1,
      ts,
    ];
    const parsed = rowSchema.safeParse(row);
    if (!parsed.success) continue; // skip bad items instead of failing the whole feed
    const prev = byId.get(id);
    if (!prev || prev[6] <= ts) byId.set(id, parsed.data);
  }

  const vehicles = [...byId.values()];
  const newest = vehicles.reduce((m, r) => Math.max(m, r[6]), 0);
  return { ts: headerTs || newest, count: vehicles.length, vehicles };
}
