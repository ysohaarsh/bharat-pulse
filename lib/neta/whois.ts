import { z } from "zod";

/** Shape of the `public.whois(lat, lng)` RPC result (supabase/migrations/20261005110000_geo.sql). */
const Boundary = z.object({
  kind: z.enum(["state", "district", "pc", "ac", "ward"]),
  code: z.string(),
  name: z.string(),
  name_hi: z.string().nullable(),
  state_code: z.string().nullable(),
  meta: z.record(z.string(), z.unknown()).nullable().optional(),
});

const Representative = z.object({
  house: z.enum(["ls", "vs", "ward"]),
  boundary_code: z.string().nullable(),
  constituency: z.string(),
  name: z.string(),
  party: z.string().nullable(),
  party_short: z.string().nullable(),
  email: z.string().nullable(),
  photo_url: z.string().nullable(),
  profile_url: z.string().nullable(),
  source: z.string(),
  refreshed_at: z.string(),
});

const WhoisSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  boundaries: z.array(Boundary),
  representatives: z.array(Representative),
});

export type WhoisBoundary = z.infer<typeof Boundary>;
export type WhoisRepresentative = z.infer<typeof Representative>;

export interface Whois {
  lat: number;
  lng: number;
  state: WhoisBoundary | null;
  district: WhoisBoundary | null;
  pc: WhoisBoundary | null;
  ac: WhoisBoundary | null;
  ward: WhoisBoundary | null;
  mp: WhoisRepresentative | null;
  mla: WhoisRepresentative | null;
  councillor: WhoisRepresentative | null;
}

/** Validate and index the RPC payload; null when it's malformed. */
export function parseWhois(raw: unknown): Whois | null {
  const p = WhoisSchema.safeParse(raw);
  if (!p.success) return null;
  const { boundaries, representatives } = p.data;
  const b = (kind: WhoisBoundary["kind"]) => boundaries.find((x) => x.kind === kind) ?? null;
  const rep = (house: WhoisRepresentative["house"], boundary: WhoisBoundary | null) =>
    boundary ? (representatives.find((r) => r.house === house && r.boundary_code === boundary.code) ?? null) : null;
  const pc = b("pc");
  const ac = b("ac");
  const ward = b("ward");
  return {
    lat: p.data.lat,
    lng: p.data.lng,
    state: b("state"),
    district: b("district"),
    pc,
    ac,
    ward,
    mp: rep("ls", pc),
    mla: rep("vs", ac),
    councillor: rep("ward", ward),
  };
}
