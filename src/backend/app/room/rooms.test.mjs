// Checks rooms: making and renaming them, their names and bots, a deleted bot leaving its rooms, messages staying in their room,
// and the last room being kept. Run after a build: node src/backend/app/room/rooms.test.mjs
// It sets MIP_HOME to a temporary folder before the modules load.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIST = pathToFileURL(fileURLToPath(new URL("../../../../dist/backend/", import.meta.url))).href;
const root = mkdtempSync(join(tmpdir(), "mip-rooms-"));
process.env.MIP_HOME = join(root, "mip-home");

// The error a call throws, or undefined when it does not throw.
function thrown(call) {
  try {
    call();
  } catch (err) {
    return err;
  }
  return undefined;
}

try {
  const rooms = await import(`${DIST}app/room/rooms.js`);
  const room = await import(`${DIST}app/room/room.js`);
  const bots = await import(`${DIST}storage/bots.js`);
  const { removeBot } = await import(`${DIST}app/bots.js`);

  bots.insertBot({ id: "b-freya", name: "Freya", persona: "A keen reviewer.", providerId: "claude-cli", model: null, thinking: null, color: "teal" });
  bots.insertBot({ id: "b-thorin", name: "Thorin", persona: "Plain speaker.", providerId: "claude-cli", model: null, thinking: null, color: "orange" });

  // The database starts with Main, which has no bots, since these bots were made after it.
  assert.deepEqual(rooms.allRooms().map((r) => [r.id, r.name, r.botIds]), [["main", "Main", []]]);

  // 1. A room is made with a name and bots. The name is trimmed, and a bot listed twice is one member.
  const lounge = rooms.createRoom({ name: "  Lounge ", botIds: ["b-freya", "b-freya", "b-thorin"] });
  assert.equal(lounge.name, "Lounge");
  assert.deepEqual(lounge.botIds.sort(), ["b-freya", "b-thorin"]);
  // Names ignore case, so a second room cannot take a name in another case.
  assert.equal(thrown(() => rooms.createRoom({ name: "lounge" })).status, 409);

  // 2. A name is needed and short enough, the bots list must be a list, and every bot in it must exist.
  assert.equal(thrown(() => rooms.createRoom({ name: "   " })).status, 400);
  assert.equal(thrown(() => rooms.createRoom({ name: "x".repeat(41) })).status, 400);
  assert.equal(thrown(() => rooms.createRoom({ name: "Ghosts", botIds: "b-freya" })).status, 400);
  assert.equal(thrown(() => rooms.createRoom({ name: "Ghosts", botIds: ["b-nobody"] })).status, 400);

  // 3. Renaming keeps the bots when none are given. Giving bots replaces them. Renaming to a taken name is refused.
  const renamed = rooms.editRoom(lounge.id, { name: "Den" });
  assert.deepEqual([renamed.name, renamed.botIds.sort()], ["Den", ["b-freya", "b-thorin"]]);
  assert.deepEqual(rooms.editRoom(lounge.id, { botIds: ["b-thorin"] }).botIds, ["b-thorin"]);
  assert.equal(thrown(() => rooms.editRoom(lounge.id, { name: "main" })).status, 409);
  assert.equal(thrown(() => rooms.editRoom("no-such-room", {})).status, 404);

  // 4. A deleted bot leaves every room it was in.
  removeBot("b-thorin");
  assert.deepEqual(rooms.allRooms().find((r) => r.id === lounge.id).botIds, []);

  // 5. A message in a room with no bots is saved, and the room says so. No turn runs, so the room is not busy.
  room.postToRoom({ room: lounge.id, text: "anyone here?" });
  assert.deepEqual(
    room.roomMessages(lounge.id, 0).map((m) => [m.kind, m.text]),
    [
      ["user", "anyone here?"],
      ["system", "No bots in this room yet. Add some with Members."],
    ],
  );
  assert.deepEqual(room.roomStatus(lounge.id), { busy: false, speaking: null });

  // 6. Messages stay in their room. Main has none.
  assert.deepEqual(room.roomMessages("main", 0), []);

  // 7. A room that does not exist is refused, for reading and for posting.
  assert.equal(thrown(() => room.roomMessages("no-such-room", 0)).status, 404);
  assert.equal(thrown(() => room.postToRoom({ room: "no-such-room", text: "hi" })).status, 404);

  // 8. Deleting a room deletes its messages. The last room is kept.
  rooms.removeRoom(lounge.id);
  assert.equal(thrown(() => room.roomMessages(lounge.id, 0)).status, 404);
  assert.equal(thrown(() => rooms.removeRoom("main")).status, 409);
  assert.deepEqual(rooms.allRooms().map((r) => r.id), ["main"]);

  console.log("room tests passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}
