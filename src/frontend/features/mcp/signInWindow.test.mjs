// Checks the sign-in tab's rules: only a web link is opened, and a tab with no link to open is closed. The tab is a stand-in here, since
// the test runs without a browser. Run after a build: node src/frontend/features/mcp/signInWindow.test.mjs
import assert from "node:assert/strict";
import { goToSignIn, isWebLink } from "./signInWindow.ts";

// 1. Only an http or https link counts, so a link from a server's metadata cannot open anything else.
assert.equal(isWebLink("https://auth.example.test/authorize?x=1"), true);
assert.equal(isWebLink("http://127.0.0.1:9/authorize"), true);
assert.equal(isWebLink("javascript:alert(1)"), false);
assert.equal(isWebLink("file:///etc/passwd"), false);
assert.equal(isWebLink(""), false);
assert.equal(isWebLink(null), false);
assert.equal(isWebLink(undefined), false);

// 2. A tab goes to the sign-in page when there is a link.
const opened = { location: { href: "about:blank" }, closed: false, close() { this.closed = true; } };
assert.equal(goToSignIn(opened, "https://auth.example.test/authorize"), true, "a sent tab reports it was sent");
assert.equal(opened.location.href, "https://auth.example.test/authorize");
assert.equal(opened.closed, false);

// 3. A tab with no link is closed, and it is never sent anywhere.
const empty = { location: { href: "about:blank" }, closed: false, close() { this.closed = true; } };
assert.equal(goToSignIn(empty, null), false);
assert.equal(empty.closed, true);
assert.equal(empty.location.href, "about:blank");
const unsafe = { location: { href: "about:blank" }, closed: false, close() { this.closed = true; } };
goToSignIn(unsafe, "javascript:alert(1)");
assert.equal(unsafe.closed, true);
assert.equal(unsafe.location.href, "about:blank");

// 4. No tab (a popup that was blocked) does nothing, and reports that nothing was sent.
assert.equal(goToSignIn(null, "https://auth.example.test/authorize"), false);

console.log("sign-in window tests passed");
