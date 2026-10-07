import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ASSEMBLIES, htmlText, membersSectionIndex, mlasFromWikipedia, tableGrid, type AcBoundary, type Assembly } from "./mla";

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
