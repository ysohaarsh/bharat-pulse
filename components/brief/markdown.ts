// Tiny, safe markdown subset for AI briefs: paragraphs, "- "/"* " bullets,
// "#" headings and **bold**. Output is plain data rendered as React text nodes,
// so nothing from the brief is ever interpreted as HTML.

export type Inline = { text: string; bold: boolean };

export type Block =
  | { type: "heading"; level: 2 | 3; content: Inline[] }
  | { type: "paragraph"; content: Inline[] }
  | { type: "list"; items: Inline[][] };

/** Split on **bold** markers. Unmatched ** are kept as literal text. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), bold: false });
    out.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), bold: false });
  return out;
}

const BULLET = /^\s*[-*•]\s+(.*)$/;
const HEADING = /^\s*(#{1,6})\s+(.*)$/;

export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: Inline[][] | null = null;

  const flushPara = () => {
    if (para.length) blocks.push({ type: "paragraph", content: parseInline(para.join(" ")) });
    para = [];
  };
  const flushList = () => {
    if (list?.length) blocks.push({ type: "list", items: list });
    list = null;
  };

  for (const raw of src.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      flushList();
      continue;
    }
    const h = HEADING.exec(line);
    if (h) {
      flushPara();
      flushList();
      blocks.push({ type: "heading", level: h[1].length <= 2 ? 2 : 3, content: parseInline(h[2].trim()) });
      continue;
    }
    const b = BULLET.exec(line);
    if (b) {
      flushPara();
      (list ??= []).push(parseInline(b[1].trim()));
      continue;
    }
    if (list) {
      // Continuation line of the previous bullet.
      const items: Inline[][] = list;
      const prev = items[items.length - 1];
      items[items.length - 1] = parseInline(prev.map((i) => (i.bold ? `**${i.text}**` : i.text)).join("") + " " + line);
      continue;
    }
    para.push(line);
  }
  flushPara();
  flushList();
  return blocks;
}
