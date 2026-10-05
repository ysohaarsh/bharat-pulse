import { z } from "zod";
import { BOT_HEADERS } from "@/lib/ingest/rss";
import { normalizeName, stateByName } from "@/lib/india/states";

/**
 * Sitting Lok Sabha MPs from sansad.in (Parliament's own site; keyless JSON), joined to the
 * Lok Sabha seat polygons loaded by scripts/load-boundaries.mjs.
 *
 * Only Parliament-published official data is stored: name, party, constituency, photo and the
 * official (sansad.in / nic.in) email. Assets and criminal cases are NOT copied from MyNeta:
 * ADR declined bulk-scraping permission to a similar project, so the UI deep-links to MyNeta.
 */
export const SANSAD_URL = "https://sansad.in/api_ls/member?loksabha=18&page=1&size=600&locale=en";

const MemberSchema = z.object({
  mpsno: z.union([z.number(), z.string()]).transform(String),
  mpFirstLastName: z.string().min(1),
  initial: z.string().nullish(),
  partyFname: z.string().nullish(),
  partySname: z.string().nullish(),
  stateName: z.string().min(1),
  constName: z.string().min(1),
  imageUrl: z.string().nullish(),
  email: z.union([z.array(z.string()), z.string()]).nullish(),
  status: z.string().nullish(),
});

const ResponseSchema = z.object({ membersDtoList: z.array(z.unknown()) });

export interface PcBoundary {
  code: string;
  name: string;
  state_code: string | null;
}

export interface RepresentativeRow {
  house: "ls";
  boundary_code: string | null;
  constituency: string;
  state_code: string | null;
  name: string;
  party: string | null;
  party_short: string | null;
  email: string | null;
  photo_url: string | null;
  profile_url: string;
  source: "sansad.in";
  external_id: string;
}

/** Seat names that differ between sansad.in and the ECI-derived boundary file. */
const SEAT_ALIASES: Record<string, string> = {
  guwahati: "gauhati",
  puducherry: "pondicherry",
};

/** Seat key: letters only, no reservation suffix, no "(ex …)". */
export function seatKey(name: string): string {
  const base = normalizeName(name.replace(/\((?:sc|st)\)/gi, "").replace(/\(ex [^)]*\)/gi, ""));
  return SEAT_ALIASES[base] ?? base;
}

function officialEmail(email: string[] | string | null | undefined): string | null {
  const list = Array.isArray(email) ? email : email ? [email] : [];
  return list.find((e) => /@(?:[\w-]+\.)*(?:sansad\.in|nic\.in|gov\.in)$/i.test(e.trim()))?.trim() ?? null;
}

export function representativesFromSansad(raw: unknown, pcs: readonly PcBoundary[]): RepresentativeRow[] {
  const parsed = ResponseSchema.safeParse(raw);
  if (!parsed.success) return [];
  const byKey = new Map<string, PcBoundary[]>();
  const byState = new Map<string, PcBoundary[]>();
  for (const pc of pcs) {
    byKey.set(seatKey(pc.name), [...(byKey.get(seatKey(pc.name)) ?? []), pc]);
    if (pc.state_code) byState.set(pc.state_code, [...(byState.get(pc.state_code) ?? []), pc]);
  }

  const out: RepresentativeRow[] = [];
  for (const item of parsed.data.membersDtoList) {
    const m = MemberSchema.safeParse(item);
    if (!m.success) continue;
    const mp = m.data;
    // The list keeps members who died/resigned during the term next to their successors.
    if (mp.status && mp.status.toLowerCase() !== "sitting") continue;
    const state = stateByName(mp.stateName)?.code ?? null;
    const candidates = byKey.get(seatKey(mp.constName)) ?? [];
    const onlySeatInState = state && byState.get(state)?.length === 1 ? byState.get(state)![0] : undefined;
    const pc = (candidates.length === 1 ? candidates[0] : candidates.find((c) => c.state_code === state)) ?? onlySeatInState;
    out.push({
      house: "ls",
      boundary_code: pc?.code ?? null,
      constituency: mp.constName,
      state_code: state,
      name: mp.mpFirstLastName.trim(),
      party: mp.partyFname?.trim() || null,
      party_short: mp.partySname?.trim() || null,
      email: officialEmail(mp.email),
      photo_url: mp.imageUrl?.startsWith("https://") ? mp.imageUrl : null,
      profile_url: `https://sansad.in/ls/members/biography/${mp.mpsno}?from=members`,
      source: "sansad.in",
      external_id: mp.mpsno,
    });
  }
  return out;
}

export async function fetchSansad(): Promise<unknown> {
  const res = await fetch(SANSAD_URL, { signal: AbortSignal.timeout(30_000), cache: "no-store", headers: BOT_HEADERS });
  if (!res.ok) throw new Error(`sansad.in fetch failed: ${res.status}`);
  return res.json();
}
