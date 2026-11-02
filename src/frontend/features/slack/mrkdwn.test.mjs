// Checks how a Slack message is read in Slack's text format: blocks, then inline pieces. Only http and mailto links become links.
// Run after a build: node src/frontend/features/slack/mrkdwn.test.mjs
import assert from "node:assert/strict";
import { parseBlocks, parseInline } from "./mrkdwn.ts";

// 1. Bold, italic, and strike need a non-space inside their markers, and must not sit inside a word.
assert.deepEqual(parseInline("*bold* and _it_ and ~gone~"), [
  { kind: "bold", children: ["bold"] },
  " and ",
  { kind: "italic", children: ["it"] },
  " and ",
  { kind: "strike", children: ["gone"] },
]);
assert.deepEqual(parseInline("snake_case_name and 2 * 3 * 4"), ["snake_case_name and 2 * 3 * 4"]);

// 2. Inline code keeps its text as it is, and Slack's escapes are undone outside the markup.
assert.deepEqual(parseInline("use `a &lt; b` &amp; <@U1|x> &gt;"), [
  "use ",
  { kind: "code", text: "a < b" },
  " & ",
  { kind: "mention", text: "@x" },
  " >",
]);

// 3. Links: the address is decoded, and only http and mailto addresses become links.
assert.deepEqual(parseInline("<https://a.test/x?a=1&amp;b=2|site> and <https://b.test>"), [
  { kind: "link", href: "https://a.test/x?a=1&b=2", children: ["site"] },
  " and ",
  { kind: "link", href: "https://b.test", children: ["https://b.test"] },
]);
assert.deepEqual(parseInline("<javascript:alert(1)|x>"), ["javascript:alert(1)|x"]);

// 4. Broadcasts and channels: <!here> is @here, <#C1|general> is #general, and a channel without a name is #channel.
assert.deepEqual(parseInline("<!here> <#C1|general> <#C2>"), [
  { kind: "mention", text: "@here" },
  " ",
  { kind: "mention", text: "#general" },
  " ",
  { kind: "mention", text: "#channel" },
]);

// 5. Quote lines form a quote, a blank-free run of other lines is a paragraph, and a code block keeps its lines decoded.
assert.deepEqual(parseBlocks("&gt; quoted\n&gt; more\nplain\n```\nx &lt; y\n```\nafter"), [
  { kind: "quote", text: "quoted\nmore" },
  { kind: "paragraph", text: "plain" },
  { kind: "code", text: "x < y" },
  { kind: "paragraph", text: "after" },
]);

console.log("slack mrkdwn tests passed");
