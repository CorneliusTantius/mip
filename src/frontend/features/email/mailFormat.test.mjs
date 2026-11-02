// Checks how the mail card shows a sender and a date. Run with: node src/frontend/features/email/mailFormat.test.mjs
import assert from "node:assert/strict";
import { displaySender, formatMailDate, linkPieces, paragraphsOf } from "./mailFormat.ts";

// 1. A message with no date, or a date that cannot be read, shows a dash.
assert.equal(formatMailDate(null), "—");
assert.equal(formatMailDate("not a date"), "—");

// 2. A date that is set shows some text, not the dash.
assert.notEqual(formatMailDate("2026-06-02T08:30:00.000Z", new Date("2026-06-02T12:00:00Z")), "—");

// 3. A sender with a name shows the name. One with only an address shows the address.
assert.equal(displaySender("Ann <ann@example.test>"), "Ann");
assert.equal(displaySender("bob@example.test"), "bob@example.test");
assert.equal(displaySender(""), "");

// 4. Wrapped lines are joined into one line, a blank line starts a paragraph, and a bullet keeps its own line.
assert.deepEqual(paragraphsOf("Hello there,\nthis line is wrapped.\n\nSecond para\n\n- one\n- two"), [
  ["Hello there, this line is wrapped."],
  ["Second para"],
  ["- one", "- two"],
]);

// 5. A link is its own piece, without the punctuation after it. Only http and https addresses are links.
assert.deepEqual(linkPieces("See https://a.test/x?a=1&b=2, then go."), [
  { text: "See " },
  { text: "https://a.test/x?a=1&b=2", href: "https://a.test/x?a=1&b=2" },
  { text: ", then go." },
]);
assert.deepEqual(linkPieces("no links here"), [{ text: "no links here" }]);

console.log("mail format tests passed");
