import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown } from "./markdown";

describe("parseInline", () => {
  it("splits bold segments", () => {
    expect(parseInline("a **b** c")).toEqual([
      { text: "a ", bold: false },
      { text: "b", bold: true },
      { text: " c", bold: false },
    ]);
  });
  it("keeps unmatched markers and HTML as literal text", () => {
    expect(parseInline("2 ** 3 <b>x</b>")).toEqual([{ text: "2 ** 3 <b>x</b>", bold: false }]);
  });
  it("handles empty input", () => {
    expect(parseInline("")).toEqual([]);
  });
});

describe("parseMarkdown", () => {
  it("parses paragraphs, headings and bullets", () => {
    const blocks = parseMarkdown(
      "## Overview\nLine one\nline two\n\n- **Quake** in Japan\n* Fires\n  continuing west\n\nClosing.",
    );
    expect(blocks).toEqual([
      { type: "heading", level: 2, content: [{ text: "Overview", bold: false }] },
      { type: "paragraph", content: [{ text: "Line one line two", bold: false }] },
      {
        type: "list",
        items: [
          [
            { text: "Quake", bold: true },
            { text: " in Japan", bold: false },
          ],
          [{ text: "Fires continuing west", bold: false }],
        ],
      },
      { type: "paragraph", content: [{ text: "Closing.", bold: false }] },
    ]);
  });
  it("returns no blocks for blank input", () => {
    expect(parseMarkdown("  \n\n")).toEqual([]);
  });
});
