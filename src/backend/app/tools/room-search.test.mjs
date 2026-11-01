// Checks room_search and the room's message search: it finds older messages by every word, newest first, keeps calls with their
// messages, and treats % and _ as plain characters. Run after a build: node src/backend/app/tools/room-search.test.mjs
// It sets MIP_HOME to a temporary folder before the modules load.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIST = pathToFileURL(fileURLToPath(new URL("../../../../dist/backend/", import.meta.url))).href;
const root = mkdtempSync(join(tmpdir(), "mip-room-search-"));
process.env.MIP_HOME = join(root, "mip-home");

try {
  const { addRoomMessage, searchRoomMessages } = await import(`${DIST}storage/room.js`);
  const { roomSearchTool } = await import(`${DIST}app/tools/room.js`);
  const context = { workspace: root };

  const say = (authorName, text, kind = "bot") => addRoomMessage({ kind, botId: null, authorName, text });
  say("You", "Plan the Giza trip for May", "user");
  say("Freya", "Giza is best before noon.");
  say("Thorin", "Bring water: 100% of the day is hot.");
  say("You", "My goal is 1000 steps a day", "user");
  say("Freya", "Line one\n\n   line two of a long   reply");

  // 1. Every word must match, ignoring case. The newest match comes first.
  const giza = await roomSearchTool.run({ query: "giza" }, context);
  assert.equal(giza.isError, false);
  assert.deepEqual(giza.text.split("\n"), ["Freya: Giza is best before noon.", "You: Plan the Giza trip for May"]);

  // 2. More words narrow the match.
  const trip = await roomSearchTool.run({ query: "giza TRIP" }, context);
  assert.equal(trip.text, "You: Plan the Giza trip for May");
  const none = await roomSearchTool.run({ query: "giza pyramid" }, context);
  assert.equal(none.isError, false);
  assert.equal(none.text, "No message matches. Try fewer or different words.");

  // 3. A query with no words to search for is refused, as a failed result.
  const empty = await roomSearchTool.run({ query: "?! a" }, context);
  assert.equal(empty.isError, true);
  assert.match(empty.text, /at least one word/);

  // 4. Replies are shown on one line, and the search matches across the whole text.
  const steps = await roomSearchTool.run({ query: "long reply" }, context);
  assert.equal(steps.text, "Freya: Line one line two of a long reply");

  // 5. % and _ match only themselves. "100%" does not match "1000", and "_" does not match every message.
  say("Thorin", "snake_case names are fine");
  assert.deepEqual(searchRoomMessages(["100%"], 10).map((m) => m.text), ["Bring water: 100% of the day is hot."]);
  assert.deepEqual(searchRoomMessages(["_"], 10).map((m) => m.text), ["snake_case names are fine"]);
  assert.equal(searchRoomMessages([], 10).length, 0);

  // 6. A long message is cut in the result, so one search cannot fill a bot's context.
  say("Freya", `${"x".repeat(1000)} needle`);
  const cut = await roomSearchTool.run({ query: "needle" }, context);
  assert.ok(cut.text.length < 500, "the long message is cut");
  assert.match(cut.text, /…$/);

  // 7. A bot's calls are stored with its message and come back with it.
  const call = { name: "room_search", input: '{"query":"giza"}', output: "Freya: Giza", isError: false };
  addRoomMessage({ kind: "bot", botId: null, authorName: "Thorin", text: "Found the Giza note", calls: [call] });
  const [withCalls] = searchRoomMessages(["Found the Giza"], 1);
  assert.deepEqual(withCalls.calls, [call]);
  say("You", "no calls here", "user");
  assert.deepEqual(searchRoomMessages(["no calls"], 1)[0].calls, []);

  console.log("room search tests passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}
