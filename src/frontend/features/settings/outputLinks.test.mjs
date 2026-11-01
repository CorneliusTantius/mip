// Checks how a line of sign-in output is split into text and links. Each link becomes a button that opens it in a new tab.
// Run after a build: node src/frontend/features/settings/outputLinks.test.mjs
import assert from "node:assert/strict";
import { splitLinks } from "./outputLinks.ts";

// 1. A link in the middle of a line is its own piece, and the text around it is kept.
assert.deepEqual(splitLinks("Open https://example.com/login now."), ["Open ", { url: "https://example.com/login" }, " now."]);

// 2. Punctuation after a link is not part of the address.
assert.deepEqual(splitLinks("(see https://a.b/c)."), ["(see ", { url: "https://a.b/c" }, ")."]);
assert.deepEqual(splitLinks("Visit http://localhost:1455/auth/callback."), ["Visit ", { url: "http://localhost:1455/auth/callback" }, "."]);

// 3. Two links on one line are two pieces, in order.
assert.deepEqual(splitLinks("a https://one.test x https://two.test"), ["a ", { url: "https://one.test" }, " x ", { url: "https://two.test" }]);

// 4. A line with no link stays as text, and an empty line has no pieces.
assert.deepEqual(splitLinks("Enter code: ABCD-1234"), ["Enter code: ABCD-1234"]);
assert.deepEqual(splitLinks(""), []);

// 5. A link at the end of a line leaves nothing after it.
assert.deepEqual(splitLinks("https://end.test"), [{ url: "https://end.test" }]);

console.log("output link tests passed");
