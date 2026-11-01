// Checks how the mail card shows a sender and a date. Run with: node src/frontend/features/email/mailFormat.test.mjs
import assert from "node:assert/strict";
import { displaySender, formatMailDate } from "./mailFormat.ts";

// 1. A message with no date, or a date that cannot be read, shows a dash.
assert.equal(formatMailDate(null), "—");
assert.equal(formatMailDate("not a date"), "—");

// 2. A date that is set shows some text, not the dash.
assert.notEqual(formatMailDate("2026-06-02T08:30:00.000Z", new Date("2026-06-02T12:00:00Z")), "—");

// 3. A sender with a name shows the name. One with only an address shows the address.
assert.equal(displaySender("Ann <ann@example.test>"), "Ann");
assert.equal(displaySender("bob@example.test"), "bob@example.test");
assert.equal(displaySender(""), "");

console.log("mail format tests passed");
