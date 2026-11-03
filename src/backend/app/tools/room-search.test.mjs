// Checks room_search and the room's message search: it finds older messages in the bot's own room by every word, newest first, keeps
// calls with their messages, and treats % and _ as plain characters. Run after a build: node src/backend/app/tools/room-search.test.mjs
// It sets HOME to a temporary folder before the modules load.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIST = pathToFileURL(fileURLToPath(new URL("../../../../dist/backend/", import.meta.url))).href;
const root = mkdtempSync(join(tmpdir(), "mip-room-search-"));
process.env.HOME = join(root, "home");

try {
  const { addRoomMessage, searchRoomMessages } = await import(`${DIST}storage/room.js`);
  const { roomSearchTool } = await import(`${DIST}app/tools/room.js`);
  // The bot's room is "main". Messages in "other" are never searched from "main".
  const context = { workspace: root, roomId: "main" };

  const say = (authorName, text, kind = "bot", roomId = "main") => addRoomMessage({ roomId, kind, botId: null, authorName, text });
  say("You", "Plan the Giza trip for May", "user");
  say("Freya", "Giza is best before noon.");
  say("Thorin", "Bring water: 100% of the day is hot.");
  say("You", "My goal is 1000 steps a day", "user");
  say("Freya", "Line one\n\n   line two of a long   reply");
  say("Elsewhere", "Giza in another room", "bot", "other");

  // 1. Every word must match, ignoring case. The newest match comes first, and only this room's messages are searched.
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

  // 4. A run that is not in a room has no room to search, so it is refused.
  const noRoom = await roomSearchTool.run({ query: "giza" }, { workspace: root });
  assert.equal(noRoom.isError, true);
  assert.match(noRoom.text, /not in a room/);

  // 5. Replies are shown on one line, and the search matches across the whole text.
  const steps = await roomSearchTool.run({ query: "long reply" }, context);
  assert.equal(steps.text, "Freya: Line one line two of a long reply");

  // 6. % and _ match only themselves. "100%" does not match "1000", and "_" does not match every message.
  say("Thorin", "snake_case names are fine");
  assert.deepEqual(searchRoomMessages("main", ["100%"], 10).map((m) => m.text), ["Bring water: 100% of the day is hot."]);
  assert.deepEqual(searchRoomMessages("main", ["_"], 10).map((m) => m.text), ["snake_case names are fine"]);
  assert.equal(searchRoomMessages("main", [], 10).length, 0);

  // 7. A long message is cut in the result, so one search cannot fill a bot's context.
  say("Freya", `${"x".repeat(1000)} needle`);
  const cut = await roomSearchTool.run({ query: "needle" }, context);
  assert.ok(cut.text.length < 500, "the long message is cut");
  assert.match(cut.text, /…$/);

  // 8. A bot's calls are stored with its message and come back with it.
  const call = { name: "room_search", input: '{"query":"giza"}', output: "Freya: Giza", isError: false };
  addRoomMessage({ roomId: "main", kind: "bot", botId: null, authorName: "Thorin", text: "Found the Giza note", calls: [call] });
  const [withCalls] = searchRoomMessages("main", ["Found the Giza"], 1);
  assert.deepEqual(withCalls.calls, [call]);
  say("You", "no calls here", "user");
  assert.deepEqual(searchRoomMessages("main", ["no calls"], 1)[0].calls, []);

  console.log("room search tests passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}
