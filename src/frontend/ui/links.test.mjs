// Checks the short label of a web link: the scheme and www are dropped, a trailing slash is dropped, and a long one is cut with an ellipsis.
// Run after a build: node src/frontend/ui/links.test.mjs
import assert from "node:assert/strict";
import { shortLink } from "./links.ts";

assert.equal(shortLink("https://www.example.test/"), "example.test");
assert.equal(shortLink("http://example.test/a/b"), "example.test/a/b");
assert.equal(shortLink("https://example.test/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", 20), "example.test/aaaaaa…");
assert.equal(shortLink("https://example.test/short", 40), "example.test/short");

console.log("link label tests passed");
