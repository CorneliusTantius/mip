// Checks how a message from the server becomes a header and a message: the sender, the date, the read state, the cut body, and an HTML body
// with no plain text. Run after a build: node src/backend/app/mail/messages.test.mjs
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIST = pathToFileURL(fileURLToPath(new URL("../../../../dist/backend/", import.meta.url))).href;
const { clipBody, headerOf, htmlToText, messageOf, senderText } = await import(`${DIST}app/mail/messages.js`);

// 1. A header comes from the envelope and the flags.
const header = headerOf({
  uid: 7,
  seq: 3,
  flags: new Set(["\\Seen"]),
  envelope: { subject: "Hi", date: new Date("2026-06-01T10:00:00Z"), from: [{ name: "Ann", address: "ann@example.test" }] },
});
assert.deepEqual(header, { uid: 7, from: "Ann <ann@example.test>", subject: "Hi", date: "2026-06-01T10:00:00.000Z", seen: true });

// 2. A message with no envelope or flags still gives a header, with empty fields and unread.
assert.deepEqual(headerOf({ uid: 8, seq: 4 }), { uid: 8, from: "", subject: "", date: null, seen: false });

// 3. A sender with no name is shown as the address.
assert.equal(senderText(undefined, "bob@example.test"), "bob@example.test");
assert.equal(senderText("", "bob@example.test"), "bob@example.test");
assert.equal(senderText("Bob", undefined), "Bob");

// 4. A body is cut to its byte limit, and the cut is reported.
assert.deepEqual(clipBody("short", 10), { text: "short", truncated: false });
assert.deepEqual(clipBody("abcdefghij", 4), { text: "abcd", truncated: true });

// 5. An HTML body with no plain text loses its tags and its scripts.
assert.equal(htmlToText(false), "");
assert.equal(htmlToText("<p>Hello <b>there</b></p><script>track()</script><div>Next</div>").replace(/\s+/g, " ").trim(), "Hello there Next");

// 6. A message gives its recipients, its text, and whether the text was cut.
const message = messageOf(header, { to: [{ text: "a@x.test" }, { text: "b@x.test" }], text: "Body text here" }, 8);
assert.deepEqual(message, { ...header, to: "a@x.test, b@x.test", text: "Body tex", truncated: true });
assert.equal(messageOf(header, { to: { text: "me@x.test" }, html: "<p>Only html</p>" }, 100).text, "Only html");

console.log("mail message tests passed");
