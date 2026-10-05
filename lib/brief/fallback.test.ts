import { describe, expect, it } from "vitest";
import { parseMarkdown } from "@/components/brief/markdown";
import { buildExtractiveBrief, EXTRACTIVE_MODEL } from "./fallback";
import { ev } from "./test-utils";

const selected = [
  ev({ title: "M4.9 earthquake — Assam", category: "earthquake", severity: 4, state: "IN-AS" }),
  ev({ title: "Three Maoists killed in encounter", category: "security", severity: 5, state: "IN-CG" }),
  ev({ title: "बीजापुर में मुठभेड़", title_en: "Encounter in Bijapur", category: "security", severity: 3, state: null }),
  ev({ title: "**Bold** - injected", category: "politics", severity: 1, state: "IN-KL" }),
];

describe("buildExtractiveBrief", () => {
  const md = buildExtractiveBrief(selected, { total: 142, highSeverity: 6 });

  it("starts with an overview lead containing the counts", () => {
    expect(md.startsWith("# Overview\n\n142 events in the last 24h; 6 high-severity.")).toBe(true);
  });

  it("groups by category, most severe category first, with title — state bullets", () => {
    const security = md.indexOf("## Security");
    const quake = md.indexOf("## Earthquake");
    const politics = md.indexOf("## Politics");
    expect(security).toBeGreaterThan(0);
    expect(security).toBeLessThan(quake);
    expect(quake).toBeLessThan(politics);
    expect(md).toContain("- Three Maoists killed in encounter — Chhattisgarh");
    expect(md).toContain("- M4.9 earthquake — Assam — Assam");
    expect(md).toContain("- Encounter in Bijapur\n"); // English translation, no state
  });

  it("strips markdown control characters from titles", () => {
    expect(md).toContain("- Bold - injected — Kerala");
  });

  it("is deterministic and parses with the brief renderer", () => {
    expect(buildExtractiveBrief([...selected].reverse(), { total: 142, highSeverity: 6 })).toBe(md);
    const blocks = parseMarkdown(md);
    expect(blocks[0]).toMatchObject({ type: "heading" });
    expect(blocks.filter((b) => b.type === "list")).toHaveLength(3);
  });

  it("limits bullets per section", () => {
    const many = Array.from({ length: 9 }, (_, i) => ev({ title: `Storm ${i}`, category: "cyclone" }));
    const out = buildExtractiveBrief(many, { total: 9, highSeverity: 0 }, { perSection: 3 });
    expect(out.match(/^- /gm)).toHaveLength(3);
  });

  it("handles an empty period", () => {
    expect(buildExtractiveBrief([], { total: 0, highSeverity: 0 })).toBe(
      "# Overview\n\n0 events in the last 24h; 0 high-severity.",
    );
    expect(buildExtractiveBrief([], { total: 1, highSeverity: 0 })).toContain("1 event in");
  });

  it("exports the model name", () => {
    expect(EXTRACTIVE_MODEL).toBe("extractive");
  });
});
