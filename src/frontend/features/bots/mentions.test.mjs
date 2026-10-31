// Checks how a message is split into text and bot mentions. The pills are drawn from these pieces, so a mention here is a pill there.
// Run after a build: node src/frontend/features/bots/mentions.test.mjs
import assert from "node:assert/strict";
import { splitMentions } from "./mentions.ts";

const bots = [
  { name: "Thorin", color: "teal" },
  { name: "Freya", color: "frost" },
];

// Shows each piece as text, with mentions in brackets, so the expected values read at a glance.
const show = (text) => splitMentions(text, bots).map((piece) => (piece.kind === "mention" ? `[${piece.text}]` : piece.text));

assert.deepEqual(show("tabs or spaces?"), ["tabs or spaces?"]);
assert.deepEqual(show("@Thorin is tabs"), ["[@Thorin]", " is tabs"]);
assert.deepEqual(show("ask @thorin, then @FREYA."), ["ask ", "[@thorin]", ", then ", "[@FREYA]", "."]);
assert.deepEqual(show("@Loki is not a bot"), ["@Loki is not a bot"]);
assert.deepEqual(show("email me@Thorin later"), ["email me", "[@Thorin]", " later"], "a mention is matched wherever the @ is, as the server does");
assert.deepEqual(show("@Thorin-x is not a bot"), ["@Thorin-x is not a bot"], "a dash is part of the name, so this is not Thorin");
assert.deepEqual(show(""), []);

// The bot in each mention piece is the bot from the list, so its color is the one shown.
const [mention] = splitMentions("hi @freya", bots).filter((piece) => piece.kind === "mention");
assert.equal(mention.bot.color, "frost");

console.log("mention tests passed");
