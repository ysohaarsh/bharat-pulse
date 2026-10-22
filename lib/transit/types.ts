import { z } from "zod";

/** Client-safe shapes for the Delhi bus feed (no protobuf imports here). */

/** Delhi NCR box used by the map to decide when to poll. */
export const DELHI_BBOX = { w: 76.7, s: 28.2, e: 77.7, n: 29.0 } as const;

/** [vehicle id, route id, lat, lng, speed km/h, bearing deg (-1 = unknown), fix time (unix s)] */
export type BusRow = [id: string, route: string, lat: number, lng: number, speed: number, bearing: number, ts: number];

export interface BusSnapshot {
  /** Feed header timestamp (unix s), or the newest vehicle fix when the header has none. */
  ts: number;
  count: number;
  vehicles: BusRow[];
}

export const rowSchema = z.tuple([
  z.string().min(1),
  z.string(),
  z.number().min(-90).max(90),
  z.number().min(-180).max(180),
  z.number().min(0).max(200),
  z.number().min(-1).max(360),
  z.number().int().nonnegative(),
]);

export const busSnapshotSchema = z.object({
  ts: z.number().int().nonnegative(),
  count: z.number().int().nonnegative(),
  vehicles: z.array(rowSchema),
});
