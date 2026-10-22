import { z } from "zod";
import { seatKey } from "@/lib/jobs/sansad";

/**
 * Sitting MLAs (Vidhan Sabha) from English Wikipedia's "<n>th <State> Assembly" pages — there is
 * no national API for state legislators. Each page has a "Members of Legislative Assembly" table
 * (District | No. | Constituency | Name | Party ×2 | [Alliance ×2] | Remarks), with rowspans for the
 * district and for seats that changed hands mid-term (one row per successive member).
 *
 * Wikipedia text is CC BY-SA 4.0: every row links back to the member's article (or the list page),
 * and `source` is "wikipedia". Seats are joined to the DataMeet assembly polygons by
 * `AC:<state>:<number>` (post-2008 delimitation numbering on both sides); names are a fallback only.
 */
export const WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php";
export const WIKI_USER_AGENT = "BharatPulse/0.1 (India situation monitor; MLA list job) fetch";

export interface Assembly {
  state: string; // ISO 3166-2:IN
  page: string; // en.wikipedia page title (redirects are followed)
  seats: number;
  /** Polygon code = page seat no. + offset, where DataMeet keeps pre-bifurcation numbering (AP: 119). */
  codeOffset?: number;
}

/** Current assemblies. Bump the page when a new assembly is constituted after an election. */
export const ASSEMBLIES: readonly Assembly[] = [
  { state: "IN-KA", page: "16th Karnataka Assembly", seats: 224 },
  { state: "IN-UP", page: "18th Uttar Pradesh Assembly", seats: 403 },
  { state: "IN-MH", page: "15th Maharashtra Legislative Assembly", seats: 288 },
  { state: "IN-BR", page: "18th Bihar Assembly", seats: 243 }, // Nov 2025
  { state: "IN-WB", page: "18th West Bengal Assembly", seats: 294 }, // 2026
  { state: "IN-TN", page: "17th Tamil Nadu Assembly", seats: 234 }, // 2026
  { state: "IN-KL", page: "16th Kerala Assembly", seats: 140 }, // 2026
  { state: "IN-AS", page: "16th Assam Assembly", seats: 126 }, // 2026
  { state: "IN-PY", page: "16th Puducherry Assembly", seats: 30 }, // 2026
  { state: "IN-RJ", page: "16th Rajasthan Assembly", seats: 200 },
  { state: "IN-MP", page: "16th Madhya Pradesh Assembly", seats: 230 },
  { state: "IN-GJ", page: "15th Gujarat Assembly", seats: 182 },
  { state: "IN-AP", page: "16th Andhra Pradesh Assembly", seats: 175, codeOffset: 119 },
  { state: "IN-TS", page: "3rd Telangana Assembly", seats: 119 },
  { state: "IN-OD", page: "17th Odisha Assembly", seats: 147 },
  { state: "IN-PB", page: "16th Punjab Assembly", seats: 117 },
  { state: "IN-HR", page: "15th Haryana Assembly", seats: 90 },
  { state: "IN-DL", page: "8th Delhi Assembly", seats: 70 },
  { state: "IN-JH", page: "6th Jharkhand Assembly", seats: 81 },
  { state: "IN-CG", page: "6th Chhattisgarh Assembly", seats: 90 },
  { state: "IN-UK", page: "5th Uttarakhand Assembly", seats: 70 },
  { state: "IN-HP", page: "14th Himachal Pradesh Assembly", seats: 68 },
  { state: "IN-GA", page: "8th Goa Assembly", seats: 40 },
  { state: "IN-JK", page: "Jammu and Kashmir Legislative Assembly", seats: 90 },
  { state: "IN-MN", page: "12th Manipur Assembly", seats: 60 },
  { state: "IN-ML", page: "11th Meghalaya Assembly", seats: 60 },
  { state: "IN-NL", page: "14th Nagaland Assembly", seats: 60 },
  { state: "IN-TR", page: "13th Tripura Assembly", seats: 60 },
  { state: "IN-MZ", page: "9th Mizoram Assembly", seats: 40 },
  { state: "IN-AR", page: "11th Arunachal Pradesh Assembly", seats: 60 },
  { state: "IN-SK", page: "11th Sikkim Assembly", seats: 32 },
];

export interface AcBoundary {
  code: string;
  name: string;
  state_code: string | null;
}

export interface MlaRow {
  house: "vs";
  boundary_code: string | null;
  constituency: string;
  state_code: string;
  name: string;
  party: string | null;
  party_short: string | null;
  email: null;
  photo_url: null;
  profile_url: string;
  source: "wikipedia";
  external_id: string; // "<state>:<seat no.>" — one sitting member per seat
}

const ParseSchema = z.object({
  parse: z.object({ title: z.string(), revid: z.number().optional(), text: z.string() }),
});

const TocSchema = z.object({
  parse: z.object({
    tocdata: z.object({ sections: z.array(z.object({ line: z.string(), index: z.string() })) }),
  }),
});

const MemberSchema = z.object({
  number: z.number().int().positive(),
  constituency: z.string().min(2),
  name: z.string().min(2).refine((s) => !/^(vacant|none|tbd|-|—)$/i.test(s), "vacant seat"),
  party: z.string().min(1).nullable(),
  party_short: z.string().min(1).nullable(),
  profile_url: z.url(),
  remarks: z.string(),
});

/** The seat was vacated by its last listed member and no successor row follows. */
const VACATED = /\b(?:has died|died|death|passed away|resigned|disqualified|expelled from the (?:assembly|house)|elected (?:as (?:an? )?mp|to (?:the )?(?:lok|rajya) sabha))\b/i;

/**
 * Remarks that mention a departure without the member leaving the seat: resigning a ministry or
 * party, or a by-election the member *won* ("Elected in by-election necessitated after death of X").
 */
const NOT_VACATING = [
  /\bresigned\b[^.;]*?\bas (?:the )?(?:chief minister|deputy chief minister|minister|speaker|deputy speaker|president|cm)\b[^.;]*/gi,
  /\bresigned\s+from\s+(?!(?:the\s+)?(?:mla|assembly|house|legislative|membership|his seat|post|office)\b)[^.;]*/gi,
  /\b(?:elected|won|returned)\b[^.;]*\bby[\s-]?elections?\b[^.;]*/gi,
  /\bby[\s-]?elections?\s+necessitated\b[^.;]*/gi,
];

export function isVacated(remarks: string): boolean {
  return VACATED.test(NOT_VACATING.reduce((r, re) => r.replace(re, ""), remarks));
}

// ---------- tiny HTML table reader (no DOM in the job runtime) ----------

interface Cell {
  html: string;
  text: string;
  attrs: string;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function htmlText(html: string): string {
  return decodeEntities(
    html
      .replace(/<sup\b[\s\S]*?<\/sup>/gi, "")
      .replace(/<style\b[\s\S]*?<\/style>/gi, "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\s+/g, " ")
    .trim();
}

const attr = (attrs: string, name: string) => attrs.match(new RegExp(`\\b${name}="([^"]*)"`, "i"))?.[1];
const span = (attrs: string, name: string) => Math.max(1, Math.min(500, parseInt(attr(attrs, name) ?? "1", 10) || 1));

/** Rows of a <table> with rowspan/colspan expanded, so every row has its cells at header positions. */
export function tableGrid(tableHtml: string): Cell[][] {
  const grid: Cell[][] = [];
  const carry: { cell: Cell; left: number }[] = []; // per column: cell continuing from a row above
  for (const rowHtml of tableHtml.split(/<tr\b[^>]*>/i).slice(1)) {
    const cells = [...rowHtml.matchAll(/<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi)].map((m) => ({
      attrs: m[2],
      html: m[3],
      text: htmlText(m[3]),
    }));
    const row: Cell[] = [];
    let col = 0;
    const fillCarried = () => {
      while (carry[col]?.left > 0) {
        row[col] = carry[col].cell;
        carry[col].left--;
        col++;
      }
    };
    for (const cell of cells) {
      fillCarried();
      const rs = span(cell.attrs, "rowspan");
      for (let k = 0; k < span(cell.attrs, "colspan"); k++, col++) {
        row[col] = cell;
        carry[col] = { cell, left: rs - 1 };
      }
    }
    fillCarried();
    if (row.length) grid.push(row);
  }
  return grid;
}

function firstWikiLink(html: string): { href: string; title: string | null } | null {
  for (const m of html.matchAll(/<a\b([^>]*)>/gi)) {
    const href = attr(m[1], "href");
    if (!href?.startsWith("/wiki/") || /redlink=1|action=edit/.test(href) || /\bclass="[^"]*\bnew\b/.test(m[1])) continue;
    return { href: `https://en.wikipedia.org${href}`, title: attr(m[1], "title") ?? null };
  }
  return null;
}

const tidyParty = (s: string | null | undefined) =>
  s
    ? decodeEntities(s)
        .replace(/\s*\((?:\d{4}\s*[–-]\s*(?:present|\d{4}))\)$/i, "")
        .replace(/^Independent politician$/i, "Independent")
        .trim() || null
    : null;

const digits = (s: string) => s.replace(/\D+/g, "");

export function pageUrl(title: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

/** Section index of the members table in a `prop=tocdata` response, or null. */
export function membersSectionIndex(raw: unknown): string | null {
  const p = TocSchema.safeParse(raw);
  if (!p.success) return null;
  const lines = p.data.parse.tocdata.sections.map((s) => ({ index: s.index, line: htmlText(s.line) }));
  // Most specific title first ("Members of Legislative Assembly" beats a bare "Members" parent section).
  for (const re of [/^(?:list of (?:the )?)?members of\b/i, /^members\b/i, /^by constituency$/i]) {
    const hit = lines.find((s) => re.test(s.line));
    if (hit) return hit.index;
  }
  return null;
}

/**
 * Pure transform: `action=parse&prop=text` response for an assembly page → one row per seat whose
 * latest listed member is sitting. Vacant seats and malformed rows are skipped.
 */
export function mlasFromWikipedia(raw: unknown, assembly: Assembly, acs: readonly AcBoundary[]): MlaRow[] {
  const parsed = ParseSchema.safeParse(raw);
  if (!parsed.success) return [];
  const listUrl = pageUrl(parsed.data.parse.title);
  const stateAcs = acs.filter((a) => a.state_code === assembly.state);
  const byCode = new Map(stateAcs.map((a) => [a.code, a]));
  const byName = new Map<string, AcBoundary[]>();
  for (const a of stateAcs) byName.set(seatKey(a.name), [...(byName.get(seatKey(a.name)) ?? []), a]);

  const offset = assembly.codeOffset ?? 0;
  const seatNo = (name: string) => {
    const hit = byName.get(seatKey(name));
    return hit?.length === 1 ? Number(hit[0].code.split(":")[2]) - offset : NaN;
  };

  // Latest member per seat number (successors are listed below their predecessors).
  const latest = new Map<number, z.infer<typeof MemberSchema>>();
  for (const table of parsed.data.parse.text.match(/<table\b[\s\S]*?<\/table>/gi) ?? []) {
    const grid = tableGrid(table);
    // Some pages (CG, MP, RJ) use a two-row header: group cells ("Constituency", "Member of
    // Legislative Assembly") over sub-cells ("No.", "Name", "Party"). Join them per column.
    const twoRow = !!grid[1] && grid[1].some((c, i) => c !== grid[0]?.[i] && /^(?:no\.?|#|name|member)$/i.test(c.text));
    const header = (grid[0] ?? []).map((c, i) => {
      const top = c.text.toLowerCase();
      const sub = twoRow ? (grid[1][i]?.text.toLowerCase() ?? "") : "";
      return sub && sub !== top && grid[1][i] !== c ? `${top} ${sub}` : top;
    });
    const col = (re: RegExp) => header.findIndex((h) => re.test(h));
    const iNo = col(/(?:^|\s)(?:no\.?|#|s\.?\s?no\.?|ac\.?\s?no\.?|sl\.?\s?no\.?)$/);
    const nameCol = (re: RegExp) => header.findIndex((h) => !h.startsWith("constituency") && re.test(h));
    const iName = nameCol(/(?:^|\s)(?:candidate|member|mla|winner|elected member)$/) >= 0 ? nameCol(/(?:^|\s)(?:candidate|member|mla|winner|elected member)$/) : nameCol(/(?:^|\s)name$/);
    // Telangana-style pages label the seat column "Name" and the person "Candidate".
    const iSeat = col(/^constituency(?: name)?$/) >= 0 ? col(/^constituency(?: name)?$/) : header.findIndex((h, i) => i !== iName && h === "name");
    const iParty = col(/(?:^|\s)party(?: affiliation)?$/);
    const nameNo = iNo < 0 && iSeat >= 0 && stateAcs.length > 0;
    const iRemarks = col(/^remarks?/);
    // HP's table has no seat numbers: take them from the unique polygon with the same name.
    if ((iNo < 0 && !nameNo) || iSeat < 0 || iName < 0) continue;
    const partyCols = iParty < 0 ? [] : header.flatMap((h, i) => (i >= iParty && h === header[iParty] ? [i] : []));

    for (const row of grid.slice(twoRow ? 2 : 1)) {
      if (row.every((c) => c.text === "")) continue;
      // Party is a colour swatch (data-sort-value = full name) + a cell with the short name or link.
      const cells = partyCols.map((i) => row[i]).filter((c): c is Cell => !!c);
      const swatch = cells.find((c) => attr(c.attrs, "data-sort-value"));
      const label = [...cells].reverse().find((c) => c.text);
      const name = row[iName]?.text ?? "";
      const shown = tidyParty(label?.text);
      let full = tidyParty(attr(swatch?.attrs ?? "", "data-sort-value") ?? firstWikiLink(label?.html ?? "")?.title ?? label?.text);
      // Small parties without a Wikipedia article sometimes sort (and link) by their leader's name.
      if (full && name.toLowerCase().startsWith(full.toLowerCase())) full = shown;
      const member = MemberSchema.safeParse({
        number: iNo >= 0 ? Number(row[iNo]?.text.replace(/\D+$/, "")) : seatNo(row[iSeat]?.text ?? ""),
        constituency: row[iSeat]?.text ?? "",
        name,
        party: full ?? shown,
        party_short: shown && shown !== full ? shown : null,
        profile_url: firstWikiLink(row[iName]?.html ?? "")?.href ?? listUrl,
        remarks: iRemarks >= 0 ? (row[iRemarks]?.text ?? "") : "",
      });
      if (!member.success) {
        // A "Vacant" row after the last member clears the seat.
        const n = Number(row[iNo]?.text);
        if (Number.isInteger(n) && /^vacant/i.test(row[iName]?.text ?? "")) latest.delete(n);
        continue;
      }
      latest.set(member.data.number, member.data);
    }
  }

  const out: MlaRow[] = [];
  for (const m of latest.values()) {
    if (isVacated(m.remarks)) continue;
    const code = `AC:${assembly.state}:${m.number + offset}`;
    const named = byName.get(seatKey(m.constituency));
    // Name fallback only for a unique polygon with the same numerals ("Indore-2" must not land on "Indore-1").
    const ac = byCode.get(code) ?? (named?.length === 1 && digits(named[0].name) === digits(m.constituency) ? named[0] : undefined);
    out.push({
      house: "vs",
      boundary_code: ac?.code ?? null,
      constituency: m.constituency,
      state_code: assembly.state,
      name: m.name,
      party: m.party,
      party_short: m.party_short,
      email: null,
      photo_url: null,
      profile_url: m.profile_url,
      source: "wikipedia",
      external_id: `${assembly.state}:${m.number}`,
    });
  }
  return out.sort((a, b) => a.external_id.localeCompare(b.external_id, "en", { numeric: true }));
}

async function wikiApi(params: Record<string, string>): Promise<unknown> {
  const url = `${WIKIPEDIA_API}?${new URLSearchParams({ format: "json", formatversion: "2", redirects: "1", ...params })}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
    headers: { "User-Agent": WIKI_USER_AGENT, "Api-User-Agent": WIKI_USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Wikipedia API ${res.status} for ${params.page}`);
  return res.json();
}

/** Fetch the members section of an assembly page (two small API calls instead of the whole page). */
export async function fetchAssembly(assembly: Assembly): Promise<unknown> {
  const index = membersSectionIndex(await wikiApi({ action: "parse", page: assembly.page, prop: "tocdata" }));
  if (!index) throw new Error(`No "Members" section on ${assembly.page}`);
  return wikiApi({
    action: "parse",
    page: assembly.page,
    section: index,
    prop: "text|revid",
    disableeditsection: "1",
    disablelimitreport: "1",
  });
}
