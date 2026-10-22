import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ASSEMBLIES, htmlText, isVacated, membersSectionIndex, mlasFromWikipedia, tableGrid, type AcBoundary, type Assembly } from "./mla";

const acs: AcBoundary[] = JSON.parse(readFileSync(join(process.cwd(), "public", "geo", "ac.geojson"), "utf8")).features.map(
  (f: { properties: AcBoundary }) => ({ code: f.properties.code, name: f.properties.name, state_code: f.properties.state_code }),
);
const acCodes = new Set(acs.map((a) => a.code));

/** Saved `action=parse&section=<members>&prop=text|revid` responses (style attributes stripped). */
const wiki = (name: string): unknown =>
  JSON.parse(readFileSync(join(process.cwd(), "lib", "jobs", "__fixtures__", `mla.${name}.json`), "utf8"));
const assembly = (state: string) => ASSEMBLIES.find((a) => a.state === state)!;
const load = (state: string, file: string) => mlasFromWikipedia(wiki(file), assembly(state), acs);

describe("mla html helpers", () => {
  it("expands rowspan and colspan so cells line up with the header", () => {
    const grid = tableGrid(`<table>
      <tr><th>D</th><th>No.</th><th>Name</th><th colspan="2">Party</th></tr>
      <tr><td rowspan="2">X</td><td>1</td><td>A</td><td rowspan="2" data-sort-value="Foo Party"></td><td rowspan="2">FP</td></tr>
      <tr><td>2</td><td>B</td></tr>
    </table>`);
    expect(grid.map((r) => r.map((c) => c.text))).toEqual([
      ["D", "No.", "Name", "Party", "Party"],
      ["X", "1", "A", "", "FP"],
      ["X", "2", "B", "", "FP"],
    ]);
  });

  it("strips footnotes and decodes entities", () => {
    expect(htmlText('Died on 4 Nov<sup class="reference"><a>&#91;1&#93;</a></sup> &amp; more&nbsp;')).toBe("Died on 4 Nov & more");
  });

  it("finds the members section in a tocdata response", () => {
    expect(membersSectionIndex(wiki("mh.sections"))).toBe("2");
    expect(membersSectionIndex({ parse: {} })).toBeNull();
    const toc = (...lines: string[]) => ({ parse: { tocdata: { sections: lines.map((line, i) => ({ line, index: String(i + 1) })) } } });
    // The specific "Members of …" section wins over a bare "Members" parent.
    expect(membersSectionIndex(toc("Office bearers", "Members", "Members of Legislative Assembly (MLA)"))).toBe("3");
    expect(membersSectionIndex(toc("Composition", "List of the Members of the Legislative Assembly"))).toBe("2");
    expect(membersSectionIndex(toc("Composition", "By constituency"))).toBe("2");
  });
});

/** [state, fixture, sitting members, rows with no AC polygon in public/geo/ac.geojson]. */
const MORE_STATES: [string, string, number, number][] = [
  ["IN-BR", "br", 243, 0],
  ["IN-WB", "wb", 294, 0],
  ["IN-TN", "tn", 228, 0], // 6 vacant after resignations
  ["IN-KL", "kl", 140, 0],
  ["IN-AS", "as", 126, 0],
  ["IN-PY", "py", 30, 0],
  ["IN-RJ", "rj", 200, 0],
  ["IN-MP", "mp", 230, 4], // 4 seats absent from the boundary file
  ["IN-GJ", "gj", 182, 20], // 20 seats absent from the boundary file
  ["IN-AP", "ap", 175, 0], // polygon numbers are offset by 119
  ["IN-TS", "ts", 118, 1], // Khairatabad vacant; 1 polygon missing
  ["IN-OD", "od", 147, 0],
  ["IN-PB", "pb", 117, 0],
  ["IN-HR", "hr", 90, 0],
  ["IN-DL", "dl", 70, 0],
  ["IN-JH", "jh", 81, 0],
  ["IN-CG", "cg", 90, 0],
  ["IN-UK", "uk", 70, 0],
  ["IN-HP", "hp", 68, 0], // no seat numbers on the page: taken from the polygon names
  ["IN-GA", "ga", 40, 0],
  ["IN-JK", "jk", 90, 0],
  ["IN-MN", "mn", 58, 0], // 2 vacant after deaths
  ["IN-ML", "ml", 60, 0],
  ["IN-NL", "nl", 60, 0],
  ["IN-TR", "tr", 60, 0],
  ["IN-MZ", "mz", 40, 0],
  ["IN-AR", "ar", 60, 0],
  ["IN-SK", "sk", 32, 1],
];

describe("mla: more states", () => {
  const seat = (state: string, file: string, n: number) => load(state, file).find((r) => r.external_id === `${state}:${n}`);

  it.each(MORE_STATES)("%s: one sitting member per seat, joined to its AC polygon by number", (state, file, count, unjoined) => {
    const rows = load(state, file);
    const offset = assembly(state).codeOffset ?? 0;
    expect(rows).toHaveLength(count);
    expect(new Set(rows.map((r) => r.external_id)).size).toBe(count);
    expect(rows.filter((r) => r.boundary_code !== `AC:${state}:${Number(r.external_id.split(":")[1]) + offset}`).map((r) => [r.external_id, r.constituency, r.boundary_code])).toHaveLength(unjoined);
    for (const r of rows) {
      if (r.boundary_code) {
        expect(acCodes.has(r.boundary_code)).toBe(true);
        expect(r.boundary_code).toBe(`AC:${state}:${Number(r.external_id.split(":")[1]) + offset}`);
      }
      expect(r).toMatchObject({ house: "vs", state_code: state, source: "wikipedia" });
      expect(r.profile_url).toMatch(/^https:\/\/en\.wikipedia\.org\/wiki\//);
      expect(r.name.length).toBeGreaterThan(1);
    }
    // At most a handful of by-election rows list no party at all.
    expect(rows.filter((r) => !r.party).length).toBeLessThanOrEqual(5);
    expect(assembly(state).seats).toBeGreaterThanOrEqual(count);
  });

  it("reads members across the different table layouts", () => {
    expect(seat("IN-TN", "tn", 1)).toMatchObject({ constituency: "Gummidipoondi", name: "S. Vijayakumar", party_short: "TVK" });
    expect(seat("IN-WB", "wb", 148)).toMatchObject({ constituency: "Bhangar", name: "Naushad Siddiqui", party_short: "AISF" });
    expect(seat("IN-DL", "dl", 36)).toMatchObject({ name: "Kailash Gahlot", party: "Bharatiya Janata Party" });
    // Two-row headers (District | Constituency{No.,Name} | Member{Name,Party}).
    expect(seat("IN-RJ", "rj", 101)).toMatchObject({ constituency: "Ajmer South (SC)", name: "Anita Bhadel", party_short: "BJP" });
    expect(seat("IN-CG", "cg", 1)).toMatchObject({ constituency: "Bharatpur-Sonhat (ST)", name: "Renuka Singh" });
    expect(seat("IN-MP", "mp", 230)).toMatchObject({ constituency: "Jawad", name: "Om Prakash Sakhlecha" });
    // Andhra: page numbers 1..175, polygons 120..294.
    expect(seat("IN-AP", "ap", 175)).toMatchObject({ constituency: "Kuppam", name: "N. Chandrababu Naidu", boundary_code: "AC:IN-AP:294" });
    // Himachal: no number column; numbers come from polygon names (incl. the "Sri Renukaji (SC" typo in the boundary file).
    expect(seat("IN-HP", "hp", 57)).toMatchObject({ boundary_code: "AC:IN-HP:57" });
    expect(seat("IN-HP", "hp", 68)).toMatchObject({ name: "Jagat Singh Negi" });
  });

  it("handles vacancies and mid-term changes", () => {
    for (const n of [101, 103, 135, 141, 179, 225]) expect(seat("IN-TN", "tn", n)).toBeUndefined(); // resigned
    expect(seat("IN-TS", "ts", 60)).toBeUndefined(); // disqualified
    // "Resigned from BJP" is a party change, not a vacancy.
    expect(seat("IN-TS", "ts", 65)).toMatchObject({ name: "T. Raja Singh", party: "Independent" });
    // "Resigned ... as Chief Minister" keeps the seat; deaths do not.
    expect(seat("IN-MN", "mn", 2)).toMatchObject({ name: "N. Biren Singh" });
    expect(seat("IN-MN", "mn", 49)).toBeUndefined();
    // By-election winner whose remark mentions the predecessor's death.
    expect(seat("IN-GJ", "gj", 145)).toMatchObject({ name: "Satish Patel" });
  });

  it("classifies vacating remarks", () => {
    expect(isVacated("Died on 4 Nov 2022")).toBe(true);
    expect(isVacated("Resigned on 22 March 2024")).toBe(true);
    expect(isVacated("On 25 May 2026, resigned from office and officially joined TVK")).toBe(true);
    expect(isVacated("Resigned from BJP in 2025")).toBe(false);
    expect(isVacated("Resigned as Minister")).toBe(false);
    expect(isVacated("Elected in by election necessitated after death of Yogesh Patel.")).toBe(false);
    expect(isVacated("")).toBe(false);
  });
});

describe("mla from wikipedia", () => {
  it.each([
    ["IN-KA", "ka", 223], // 100 Hiriyur vacant
    ["IN-UP", "up", 396], // 7 seats vacant after deaths / disqualification
    ["IN-MH", "mh", 288],
  ])("%s: one sitting member per seat, every seat joined to its AC polygon", (state, file, count) => {
    const rows = load(state, file);
    expect(rows).toHaveLength(count);
    expect(new Set(rows.map((r) => r.external_id)).size).toBe(count);
    for (const r of rows) {
      expect(r.boundary_code && acCodes.has(r.boundary_code)).toBe(true);
      expect(r.boundary_code).toBe(`AC:${r.external_id}`);
      expect(r).toMatchObject({ house: "vs", state_code: state, source: "wikipedia" });
      expect(r.profile_url).toMatch(/^https:\/\/en\.wikipedia\.org\/wiki\//);
      expect(r.party).toBeTruthy();
    }
  });

  it("reads names, parties and reservation suffixes", () => {
    const ka = load("IN-KA", "ka");
    expect(ka[0]).toMatchObject({
      external_id: "IN-KA:1",
      constituency: "Nippani",
      name: "Shashikala Jolle",
      party: "Bharatiya Janata Party",
      party_short: "BJP",
      profile_url: "https://en.wikipedia.org/wiki/Shashikala_Annasaheb_Jolle",
    });
    expect(ka.find((r) => r.external_id === "IN-KA:5")?.constituency).toBe("Kudachi (SC)");
    // Same seat db:check's whois finds at Bengaluru MG Road (AC:IN-KA:162).
    expect(ka.find((r) => r.boundary_code === "AC:IN-KA:162")?.constituency).toBe("Shivajinagar");
    // Expelled from the party is not a vacancy.
    expect(ka.find((r) => r.external_id === "IN-KA:30")).toMatchObject({ party: "Independent", party_short: "IND" });
    // UP lists full party names only.
    expect(load("IN-UP", "up")[0]).toMatchObject({ name: "Umar Ali Khan", party: "Samajwadi Party", party_short: null });
    // MH: "Shiv Sena (2022–present)" → "Shiv Sena"; party sorted by leader's name falls back to its short label.
    const mh = load("IN-MH", "mh");
    expect(mh[0]).toMatchObject({ constituency: "Akkalkuwa (ST)", party: "Shiv Sena", party_short: "SHS" });
    expect(mh.find((r) => r.external_id === "IN-MH:37")).toMatchObject({ name: "Ravi Rana", party: "RYSP", party_short: null });
  });

  it("keeps the latest member of seats that changed hands, drops vacated seats", () => {
    const up = load("IN-UP", "up");
    const seat = (n: number) => up.find((r) => r.external_id === `IN-UP:${n}`);
    expect(seat(110)?.name).toBe("Tej Pratap Singh Yadav"); // Akhilesh Yadav resigned → by-election
    expect(seat(29)?.name).toBe("Ramveer Singh");
    expect(seat(403)).toBeUndefined(); // disqualified, successor died, now vacant
    expect(seat(69)).toBeUndefined(); // died, vacant

    const mh = load("IN-MH", "mh");
    expect(mh.find((r) => r.external_id === "IN-MH:201")).toMatchObject({ name: "Sunetra Pawar", party_short: "NCP" });
    // Successor without an article links to the list page (CC BY-SA attribution).
    expect(mh.find((r) => r.external_id === "IN-MH:223")).toMatchObject({
      name: "Akshay Shivajirao Kardile",
      party_short: "BJP",
      profile_url: "https://en.wikipedia.org/wiki/15th_Maharashtra_Assembly",
    });
  });

  it("falls back to the constituency name when the number has no polygon", () => {
    const fake: Assembly = { state: "IN-KA", page: "x", seats: 1 };
    const html = `<table><tr><th>No.</th><th>Constituency</th><th>Name</th><th>Party</th></tr>
      <tr><td>999</td><td>Nippani</td><td>Someone</td><td>INC</td></tr>
      <tr><td>abc</td><td>Bad row</td><td>Nobody</td><td>INC</td></tr>
      <tr><td>7</td><td>Hukkeri</td><td>Vacant</td><td></td></tr></table>`;
    const rows = mlasFromWikipedia({ parse: { title: "T", text: html } }, fake, acs);
    expect(rows).toEqual([expect.objectContaining({ external_id: "IN-KA:999", boundary_code: "AC:IN-KA:1", party: "INC", party_short: null })]);
  });

  it("returns nothing for a malformed payload", () => {
    expect(mlasFromWikipedia({ error: { code: "missingtitle" } }, assembly("IN-KA"), acs)).toEqual([]);
    expect(mlasFromWikipedia({ parse: { title: "T", text: "<p>no table</p>" } }, assembly("IN-KA"), acs)).toEqual([]);
  });
});
