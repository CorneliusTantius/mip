// Reads a Slack message in Slack's own text format (mrkdwn): quotes, code blocks, and paragraphs, and inside them bold, italic, strike,
// code, links, and mentions. Slack writes &, <, and > escaped, so the markup is read first and the escapes are undone in the text.
// This file only returns data. SlackText.tsx draws it as elements, never as HTML, so a message cannot add markup of its own.

export type Inline =
  | string
  | { kind: "code"; text: string }
  | { kind: "bold" | "italic" | "strike"; children: Inline[] }
  | { kind: "link"; href: string; children: Inline[] }
  | { kind: "mention"; text: string };

export type Block = { kind: "paragraph"; text: string } | { kind: "quote"; text: string } | { kind: "code"; text: string };

const FENCE = /```([\s\S]*?)```/;
const QUOTE = /^(?:&gt;|>)\s?/;
// A marker opens only in front of a non-space and closes only after one, and never inside a word, as Slack does.
const INLINE = /`([^`\n]+)`|<([^<>\n]+)>|(?<![\w*~_])\*(?=\S)([^*\n]*?\S)\*(?![\w*~_])|(?<![\w*~_])_(?=\S)([^_\n]*?\S)_(?![\w*~_])|(?<![\w*~_])~(?=\S)([^~\n]*?\S)~(?![\w*~_])/g;

// Undoes Slack's escapes. &amp; comes last, so an escaped "&lt;" stays readable as "&lt;".
function decode(text: string): string {
  return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

// The blocks of a message, in order. A code block is kept as it is. Consecutive quote lines form one quote.
export function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  source.split(FENCE).forEach((part, index) => {
    if (index % 2 === 1) {
      blocks.push({ kind: "code", text: decode(part.replace(/^\n|\n$/g, "")) });
      return;
    }
    const lines = part.split("\n");
    let i = 0;
    while (i < lines.length) {
      if (QUOTE.test(lines[i] ?? "")) {
        const quoted: string[] = [];
        while (i < lines.length && QUOTE.test(lines[i] ?? "")) quoted.push((lines[i++] ?? "").replace(QUOTE, ""));
        blocks.push({ kind: "quote", text: quoted.join("\n") });
      } else {
        const plain: string[] = [];
        while (i < lines.length && !QUOTE.test(lines[i] ?? "")) plain.push(lines[i++] ?? "");
        const text = plain.join("\n").replace(/^\n+|\n+$/g, "");
        if (text) blocks.push({ kind: "paragraph", text });
      }
    }
  });
  return blocks;
}

// The inline pieces of a line of text, in order.
export function parseInline(text: string): Inline[] {
  const nodes: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const at = match.index ?? 0;
    if (at > last) nodes.push(decode(text.slice(last, at)));
    last = at + match[0].length;
    const [, code, angle, bold, italic, strike] = match;
    if (code !== undefined) nodes.push({ kind: "code", text: decode(code) });
    else if (angle !== undefined) nodes.push(angleNode(angle));
    else if (bold !== undefined) nodes.push({ kind: "bold", children: parseInline(bold) });
    else if (italic !== undefined) nodes.push({ kind: "italic", children: parseInline(italic) });
    else if (strike !== undefined) nodes.push({ kind: "strike", children: parseInline(strike) });
  }
  if (last < text.length) nodes.push(decode(text.slice(last)));
  return nodes;
}

// What goes between < and >: a link, a broadcast (@here), a channel (#name), a user (@name), or plain text. Only http and mailto links
// become links, so a javascript: address stays as text.
function angleNode(inner: string): Inline {
  const bar = inner.indexOf("|");
  const target = bar === -1 ? inner : inner.slice(0, bar);
  const label = bar === -1 ? undefined : inner.slice(bar + 1);
  if (/^(https?:\/\/|mailto:)/.test(target)) {
    return { kind: "link", href: decode(target), children: [decode(label ?? target)] };
  }
  if (target.startsWith("!")) return { kind: "mention", text: label ? decode(label) : `@${target.slice(1).split("^")[0]}` };
  if (target.startsWith("#")) return { kind: "mention", text: label ? `#${decode(label)}` : "#channel" };
  if (target.startsWith("@")) return { kind: "mention", text: label ? `@${decode(label)}` : decode(target) };
  return decode(inner);
}
