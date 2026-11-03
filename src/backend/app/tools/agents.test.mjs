// Checks the bots' agent tools: agents_list shows only the agents open to bots, and agent_ask refuses what it must. A task that cannot
// start frees its room again, so the room can send another. Run after a build: node src/backend/app/tools/agents.test.mjs
// It sets HOME to a temporary folder before the modules load.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIST = pathToFileURL(fileURLToPath(new URL("../../../../dist/backend/", import.meta.url))).href;
const root = mkdtempSync(join(tmpdir(), "mip-agent-tools-"));
process.env.HOME = join(root, "home");

try {
  const { insertAgent, setAgentOpenToBots } = await import(`${DIST}storage/agents.js`);
  const { insertBot } = await import(`${DIST}storage/bots.js`);
  const { insertRoom } = await import(`${DIST}storage/rooms.js`);
  const { BOT_TOOLS } = await import(`${DIST}app/tools/index.js`);
  const agentsListTool = BOT_TOOLS.find((tool) => tool.name === "agents_list");
  const agentAskTool = BOT_TOOLS.find((tool) => tool.name === "agent_ask");

  // Two agents: Freya is closed to bots, Thorin is open. Thorin's provider does not exist, so a task sent to it cannot start.
  const freya = insertAgent("claude-cli", "default", "Freya");
  // New agents are open to bots, so this one is closed on purpose to test the closed case.
  setAgentOpenToBots(freya.id, false);
  const thorin = insertAgent("no-such-provider", "default", "Thorin");
  setAgentOpenToBots(thorin.id, true);

  const bot = { id: randomUUID(), name: "Odin", persona: "default", providerId: "claude-cli", model: null, thinking: null, color: "frost" };
  insertBot(bot);
  const now = Date.now();
  const room = { id: "room-work", name: "Work", botIds: [bot.id], createdAt: now, updatedAt: now };
  insertRoom(room);
  const inRoom = { workspace: root, botId: bot.id, roomId: room.id };

  // 1. agents_list shows only the agents open to bots, and marks none busy here.
  const listed = await agentsListTool.run({}, inRoom);
  assert.equal(listed.isError, false);
  assert.equal(listed.text, "Thorin");
  assert.ok(!listed.text.includes(freya.title), "a closed agent is not listed");

  // 2. A run that is not a bot in a room cannot send a task.
  const notBot = await agentAskTool.run({ agent: "Thorin", task: "Check the build" }, { workspace: root });
  assert.equal(notBot.isError, true);
  assert.match(notBot.text, /Only a bot in a room/);

  // 3. Only an agent open to bots can be sent a task. The name is matched without case, and a closed agent is refused.
  const closed = await agentAskTool.run({ agent: "freya", task: "Check the build" }, inRoom);
  assert.equal(closed.isError, true);
  assert.match(closed.text, /No agent called "freya" is open to bots/);
  const unknown = await agentAskTool.run({ agent: "Loki", task: "Check the build" }, inRoom);
  assert.match(unknown.text, /No agent called "Loki" is open to bots/);

  // 4. A task needs text.
  const empty = await agentAskTool.run({ agent: "thorin", task: "   " }, inRoom);
  assert.equal(empty.isError, true);
  assert.equal(empty.text, "task is required");

  // 5. A room that no longer exists is refused.
  const gone = await agentAskTool.run({ agent: "Thorin", task: "Check the build" }, { workspace: root, botId: bot.id, roomId: "gone" });
  assert.equal(gone.isError, true);
  assert.match(gone.text, /no longer exists/);

  // 6. A task that cannot start (the agent's provider is missing) fails at once, and the room is free to send again. The second try
  // reaches the same failure, not "still running".
  const first = await agentAskTool.run({ agent: "Thorin", task: "Check the build" }, inRoom);
  assert.equal(first.isError, true);
  assert.match(first.text, /unknown provider/);
  const second = await agentAskTool.run({ agent: "Thorin", task: "Check the build" }, inRoom);
  assert.equal(second.isError, true);
  assert.doesNotMatch(second.text, /still running/);

  console.log("agent tool tests passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}
