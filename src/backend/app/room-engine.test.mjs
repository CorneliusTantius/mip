// Checks the room's turn-taking with fake bots. Run after a build: node src/backend/app/room-engine.test.mjs
// The tests import the compiled module from dist, so they need `npm run build:backend` first.
import assert from "node:assert/strict";
import { converseRoom, isSilent, mentionedBots } from "../../../dist/backend/app/room-engine.js";

const alice = { id: "a", name: "Alice" };
const bob = { id: "b", name: "Bob" };
const bots = [alice, bob];

// A fake room: replies come from a script, and everything said is recorded.
function fakeRoom({ replies, maxTurns = 8, queue = bots, fail = false }) {
  const said = [];
  const spoke = [];
  let call = 0;
  return {
    said,
    spoke,
    run: converseRoom({
      bots,
      queue,
      maxTurns,
      runTurn: async (bot) => {
        if (fail) throw new Error("provider is not signed in");
        const script = replies[bot.name] ?? [];
        return script[call++ % Math.max(script.length, 1)] ?? "PASS";
      },
      say: (event) => said.push(event),
      speaking: (name) => spoke.push(name),
    }),
  };
}

// 1. Mentions are found by name, ignoring case, and unknown names are ignored.
assert.deepEqual(
  mentionedBots("hey @alice and @BOB, also @Carol", bots).map((b) => b.name),
  ["Alice", "Bob"],
);
assert.deepEqual(mentionedBots("no mentions here", bots), []);

// 2. PASS and empty replies are silent.
assert.equal(isSilent("PASS"), true);
assert.equal(isSilent("  pass "), true);
assert.equal(isSilent(""), true);
assert.equal(isSilent("Sounds good"), false);

// 3. A bot that mentions another hands over, and the other bot passes.
{
  const room = fakeRoom({ replies: { Alice: ["Over to you, @Bob"], Bob: ["PASS"] }, queue: [alice] });
  await room.run;
  assert.deepEqual(room.said.map((e) => (e.kind === "bot" ? `${e.bot.name}: ${e.text}` : e.text)), ["Alice: Over to you, @Bob"]);
  assert.deepEqual(room.spoke, ["Alice", "Bob", null]);
}

// 4. Two bots that keep mentioning each other stop at the turn limit, with a message.
{
  const room = fakeRoom({ replies: { Alice: ["@Bob ping"], Bob: ["@Alice pong"] }, queue: [alice], maxTurns: 4 });
  await room.run;
  const bots_said = room.said.filter((e) => e.kind === "bot").length;
  assert.equal(bots_said, 4);
  assert.equal(room.said.at(-1).kind, "system");
  assert.match(room.said.at(-1).text, /Paused after 4 turns/);
}

// 5. A failing provider stops the conversation and says which bot failed.
{
  const room = fakeRoom({ replies: {}, queue: [alice, bob], fail: true });
  await room.run;
  assert.equal(room.said.length, 1);
  assert.match(room.said[0].text, /Alice couldn't reply: provider is not signed in/);
  assert.deepEqual(room.spoke, ["Alice", null]);
}

// 6. Nothing queued means nothing happens, and the room is marked idle.
{
  const room = fakeRoom({ replies: {}, queue: [] });
  await room.run;
  assert.equal(room.said.length, 0);
  assert.deepEqual(room.spoke, [null]);
}

console.log("room-engine: all checks passed");
