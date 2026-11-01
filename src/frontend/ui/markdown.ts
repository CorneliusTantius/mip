// Reads a chat reply as Markdown: blocks (paragraphs, headings, lists, quotes, code blocks, rules), and inside them inline pieces
// (code spans, bold, italic, and web links). This file only returns data. Markdown.tsx draws it as elements, never as HTML, so
// a reply cannot add markup of its own. Anything not listed here stays as plain text.

export type Inline =
  | string
  | { kind: "code"; text: string }
  | { kind: "strong"; children: Inline[] }
  | { kind: "em"; children: Inline[] }
  | { kind: "link"; href: string; children: Inline[] };

export type Block =
  | { kind: "paragraph"; text: string }
  | { kind: "heading"; level: number; text: string }
  | { kind: "code"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "rule" };

const FENCE = /^\s*```/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;

// The inline patterns are sticky, so each one matches only where the scan is. Web links only: a javascript: link stays as text.
const CODE = /`([^`\n]+)`/y;
const LINK = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/y;
const STRONG = /\*\*(?=\S)([\s\S]*?\S)\*\*/y;
const EMPHASIS = /\*(?=\S)([^*\n]*?\S)\*/y;

// Whether a line opens a block of its own, so a paragraph ends before it.
function opensBlock(line: string): boolean {
  return FENCE.test(line) || HEADING.test(line) || RULE.test(line) || BULLET.test(line) || NUMBERED.test(line) || QUOTE.test(line);
}

// The blocks of a reply, in order. A single line break stays inside its paragraph; a blank line ends one.
export function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (!line.trim()) {
      i++;
      continue;
    }
    if (FENCE.test(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !FENCE.test(lines[i] ?? "")) body.push(lines[i++] ?? "");
      // The closing fence is skipped. A block that is never closed runs to the end of the reply.
      i++;
      blocks.push({ kind: "code", text: body.join("\n") });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1]?.length ?? 1, text: (heading[2] ?? "").trim() });
      i++;
      continue;
    }
    // A rule is checked before a bullet, because "* * *" also looks like a bullet.
    if (RULE.test(line)) {
      blocks.push({ kind: "rule" });
      i++;
      continue;
    }
    if (BULLET.test(line) || NUMBERED.test(line)) {
      const ordered = !BULLET.test(line);
      const item = ordered ? NUMBERED : BULLET;
      const items: string[] = [];
      while (i < lines.length) {
        const match = item.exec(lines[i] ?? "");
        if (!match) break;
        items.push((match[1] ?? "").trim());
        i++;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }
    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i] ?? "")) body.push((lines[i++] ?? "").replace(QUOTE, "$1"));
      blocks.push({ kind: "quote", text: body.join("\n") });
      continue;
    }
    const paragraph = [line.trim()];
    i++;
    while (i < lines.length && (lines[i] ?? "").trim() && !opensBlock(lines[i] ?? "")) paragraph.push((lines[i++] ?? "").trim());
    blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
  }
  return blocks;
}

function matchAt(pattern: RegExp, text: string, at: number): RegExpExecArray | null {
  pattern.lastIndex = at;
  return pattern.exec(text);
}

// The inline pieces of one block of text. Plain runs are strings; the rest are marked up.
export function parseInline(text: string): Inline[] {
  const pieces: Inline[] = [];
  let plain = "";
  let at = 0;
  const flush = () => {
    if (plain) pieces.push(plain);
    plain = "";
  };
  while (at < text.length) {
    const code = matchAt(CODE, text, at);
    if (code) {
      flush();
      pieces.push({ kind: "code", text: code[1] ?? "" });
      at += code[0].length;
      continue;
    }
    const link = matchAt(LINK, text, at);
    if (link) {
      flush();
      pieces.push({ kind: "link", href: link[2] ?? "", children: parseInline(link[1] ?? "") });
      at += link[0].length;
      continue;
    }
    const strong = matchAt(STRONG, text, at);
    if (strong) {
      flush();
      pieces.push({ kind: "strong", children: parseInline(strong[1] ?? "") });
      at += strong[0].length;
      continue;
    }
    const em = matchAt(EMPHASIS, text, at);
    if (em) {
      flush();
      pieces.push({ kind: "em", children: parseInline(em[1] ?? "") });
      at += em[0].length;
      continue;
    }
    plain += text[at++] ?? "";
  }
  flush();
  return pieces;
}
