import { describe, expect, it } from "vitest";
import { parseMarkdown } from "@/components/brief/markdown";
import { buildExtractiveBrief, EXTRACTIVE_MODEL } from "./fallback";
import { ev } from "./test-utils";

const selected = [
  ev({ title: "M 6.1 - 30 km S of Hualien", category: "earthquake", severity: 4, country: "TW" }),
  ev({ title: "Shelling reported near Kharkiv", category: "conflict", severity: 5, country: "UA" }),
  ev({ title: "Clashes in border region", category: "conflict", severity: 3, country: null }),
  ev({ title: "**Bold** - injected", category: "politics", severity: 1, country: "FR" }),
];

describe("buildExtractiveBrief", () => {
  const md = buildExtractiveBrief(selected, { total: 142, highSeverity: 6 });

  it("starts with an overview lead containing the counts", () => {
    expect(md.startsWith("# Overview\n\n142 events in the last 24h; 6 high-severity.")).toBe(true);
  });

  it("groups by category, most severe category first, with title — country bullets", () => {
    const conflict = md.indexOf("## Conflict");
    const quake = md.indexOf("## Earthquake");
    const politics = md.indexOf("## Politics");
    expect(conflict).toBeGreaterThan(0);
    expect(conflict).toBeLessThan(quake);
    expect(quake).toBeLessThan(politics);
    expect(md).toContain("- Shelling reported near Kharkiv — Ukraine");
    expect(md).toContain("- M 6.1 - 30 km S of Hualien — Taiwan");
    expect(md).toContain("- Clashes in border region\n");
  });

  it("strips markdown control characters from titles", () => {
    expect(md).toContain("- Bold - injected — France");
  });

  it("is deterministic and parses with the brief renderer", () => {
    expect(buildExtractiveBrief([...selected].reverse(), { total: 142, highSeverity: 6 })).toBe(md);
    const blocks = parseMarkdown(md);
    expect(blocks[0]).toMatchObject({ type: "heading" });
    expect(blocks.filter((b) => b.type === "list")).toHaveLength(3);
  });

  it("limits bullets per section", () => {
    const many = Array.from({ length: 9 }, (_, i) => ev({ title: `Storm ${i}`, category: "storm" }));
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
