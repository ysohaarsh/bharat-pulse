import { describe, expect, it } from "vitest";
import { jsonFixture } from "@/lib/test/fixtures";
import { STATES } from "@/lib/india/states";
// The relay script is plain JS (Node can't resolve "@/" or TS), so it carries copies of the
// query builder and rotation. These tests keep the copies identical to lib/jobs/osm.ts.
import * as relay from "../../scripts/osm-relay.mjs";
import { OVERPASS_URLS, OVERPASS_SERVER_TIMEOUT_S, overpassQueries, parseOsmPayload, projectsFromOverpass, statesForRun } from "./osm";

describe("osm relay script stays in sync with lib/jobs/osm.ts", () => {
  it("builds identical queries for every state", () => {
    for (const s of STATES) expect(relay.overpassQueries(s.code, OVERPASS_SERVER_TIMEOUT_S)).toEqual(overpassQueries(s.code));
  });
  it("uses the same mirrors and rotation", () => {
    expect(relay.OVERPASS_URLS).toEqual(OVERPASS_URLS);
    for (let h = 0; h < 12; h++) expect(relay.statesForRun(new Date(h * 3_600_000))).toEqual(statesForRun(new Date(h * 3_600_000)));
  });
});

describe("osm relay payload", () => {
  const ka = jsonFixture<{ elements: Record<string, unknown>[] }>("osm.ka.json");

  it("slimmed elements give the same projects as the raw Overpass result", () => {
    const slim = { elements: ka.elements.map((e) => relay.slimElement(e)) };
    expect(projectsFromOverpass("IN-KA", slim)).toEqual(projectsFromOverpass("IN-KA", ka));
  });

  it("splits states into POST bodies under the size cap", () => {
    const slim = { elements: ka.elements.map((e) => relay.slimElement(e)) };
    const one = Buffer.byteLength(JSON.stringify(slim));
    const bodies = relay.chunkStates({ "IN-KA": slim, "IN-GA": slim, "IN-DL": slim }, one * 2 + 100);
    expect(bodies).toHaveLength(2);
    expect(bodies.flatMap((b) => Object.keys(b.states))).toEqual(["IN-KA", "IN-GA", "IN-DL"]);
    for (const b of bodies) expect(parseOsmPayload(b)).not.toBeNull();
  });

  it("validates the payload: unknown states dropped, junk rejected", () => {
    expect(Object.keys(parseOsmPayload({ states: { "IN-KA": ka, "XX-ZZ": ka } })!)).toEqual(["IN-KA"]);
    expect(parseOsmPayload({ states: { "XX-ZZ": ka } })).toBeNull();
    expect(parseOsmPayload({ states: {} })).toBeNull();
    expect(parseOsmPayload({ states: { "IN-KA": { elements: "nope" } } })).toBeNull();
    expect(parseOsmPayload(null)).toBeNull();
    expect(parseOsmPayload([])).toBeNull();
  });
});
