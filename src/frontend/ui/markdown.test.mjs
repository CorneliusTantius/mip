// Checks how a chat reply is read as Markdown: blocks, then inline pieces. Only web links become links.
// Run after a build: node src/frontend/ui/markdown.test.mjs
import assert from "node:assert/strict";
import { parseBlocks, parseInline } from "./markdown.ts";

// 1. Blank lines separate paragraphs, and a single line break stays inside its paragraph.
assert.deepEqual(parseBlocks("one\ntwo\n\nthree"), [
  { kind: "paragraph", text: "one\ntwo" },
  { kind: "paragraph", text: "three" },
]);

// 2. A fenced code block keeps its lines as they are, and an unclosed one runs to the end.
assert.deepEqual(parseBlocks("```js\nconst a = 1;\n\n  b()\n```\nafter"), [
  { kind: "code", text: "const a = 1;\n\n  b()" },
  { kind: "paragraph", text: "after" },
]);
assert.deepEqual(parseBlocks("```\nopen"), [{ kind: "code", text: "open" }]);

// 3. Headings take their level, lists are bullet or numbered, and each run of list lines is one list.
assert.deepEqual(parseBlocks("## Title\n- one\n- two\n1. first\n2) second"), [
  { kind: "heading", level: 2, text: "Title" },
  { kind: "list", ordered: false, items: ["one", "two"] },
  { kind: "list", ordered: true, items: ["first", "second"] },
]);

// 4. A rule is not a bullet, and quote lines join into one block.
assert.deepEqual(parseBlocks("* * *\n> a\n> b"), [{ kind: "rule" }, { kind: "quote", text: "a\nb" }]);

// 5. A line that opens a block ends the paragraph before it.
assert.deepEqual(parseBlocks("intro\n- item"), [
  { kind: "paragraph", text: "intro" },
  { kind: "list", ordered: false, items: ["item"] },
]);

// 6. Code spans, bold and italic are marked up, and the text around them is kept.
assert.deepEqual(parseInline("run `ls` now"), ["run ", { kind: "code", text: "ls" }, " now"]);
assert.deepEqual(parseInline("a **bold** and *soft*"), [
  "a ",
  { kind: "strong", children: ["bold"] },
  " and ",
  { kind: "em", children: ["soft"] },
]);

// 7. Markers can nest: bold may hold italic.
assert.deepEqual(parseInline("**x *y* z**"), [{ kind: "strong", children: ["x ", { kind: "em", children: ["y"] }, " z"] }]);

// 8. A web link is a link, and its text can be marked up too.
assert.deepEqual(parseInline("see [the **docs**](https://example.test/a)."), [
  "see ",
  { kind: "link", href: "https://example.test/a", children: ["the ", { kind: "strong", children: ["docs"] }] },
  ".",
]);

// 9. Anything else stays as text: a script link, an unmatched marker, and a star with spaces around it.
assert.deepEqual(parseInline("[x](javascript:alert(1))"), ["[x](javascript:alert(1))"]);
assert.deepEqual(parseInline("open **bold"), ["open **bold"]);
assert.deepEqual(parseInline("2 * 3 = 6"), ["2 * 3 = 6"]);

// 10. Empty text has no blocks and no pieces.
assert.deepEqual(parseBlocks(""), []);
assert.deepEqual(parseInline(""), []);

console.log("markdown tests passed");
