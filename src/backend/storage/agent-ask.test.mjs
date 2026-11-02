// Checks what a question and an agent's bot switch keep: a reply stores its question, the switch is saved, and GitHub sync reads and writes
// both, with an older record that has neither read as no question and a closed agent. Run after a build:
// node src/backend/storage/agent-ask.test.mjs. It sets MIP_HOME to a temporary folder before the modules load.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIST = pathToFileURL(fileURLToPath(new URL("../../../dist/backend/", import.meta.url))).href;
const root = mkdtempSync(join(tmpdir(), "mip-agent-ask-"));
process.env.MIP_HOME = join(root, "mip-home");

try {
  const { insertAgent, addMessage, listMessages, getAgent, setAgentOpenToBots } = await import(`${DIST}storage/agents.js`);
  const { readAgentRows, writeAgentRow, readMessageRows, insertMessageRow } = await import(`${DIST}storage/sync.js`);

  // 1. A reply keeps its question, and a message without one has none.
  const agent = insertAgent("claude-cli", "default", "Freya");
  assert.equal(agent.openToBots, true, "a new agent is open to bots");
  const ask = { question: "Which colour?", kind: "choice", options: ["Red", "Blue"] };
  addMessage(agent.id, { role: "assistant", text: "Two are left.", tools: ["ask_user"], error: null, ask });
  addMessage(agent.id, { role: "user", text: "Blue", tools: [], error: null });
  addMessage(agent.id, { role: "assistant", text: "Blue it is.", tools: [], error: null });
  assert.deepEqual(
    listMessages(agent.id).map((message) => message.ask),
    [ask, null, null],
  );

  // 2. Every kind of question comes back as it was saved.
  const kinds = [
    { question: "Name?", kind: "text", placeholder: "e.g. Freya" },
    { question: "Which?", kind: "multi", options: ["One", "Two"] },
    { question: "How many?", kind: "slider", min: 0, max: 10, step: 2, value: 4 },
  ];
  for (const each of kinds) addMessage(agent.id, { role: "assistant", text: "", tools: [], error: null, ask: each });
  assert.deepEqual(listMessages(agent.id).slice(3).map((message) => message.ask), kinds);

  // 3. The bot switch is saved and can be turned off again.
  setAgentOpenToBots(agent.id, true);
  assert.equal(getAgent(agent.id).openToBots, true);
  setAgentOpenToBots(agent.id, false);
  assert.equal(getAgent(agent.id).openToBots, false);

  // 4. Sync reads the switch and the question, and writes them back for another machine.
  setAgentOpenToBots(agent.id, true);
  const [synced] = readAgentRows().filter((row) => row.id === agent.id);
  assert.equal(synced.openToBots, true);
  const syncedMessages = readMessageRows(agent.id);
  assert.deepEqual(syncedMessages[0].ask, ask);
  assert.equal(syncedMessages[1].ask, null);

  // 5. A record from GitHub that was written before questions and bot switches: the agent is closed, and its message has no question.
  writeAgentRow({ id: "remote-1", title: "Thorin", providerId: "claude-cli", personaId: "default", model: null, thinking: null, updatedAt: 1, openToBots: true });
  assert.equal(getAgent("remote-1").openToBots, true);
  writeAgentRow({ id: "remote-1", title: "Thorin", providerId: "claude-cli", personaId: "default", model: null, thinking: null, updatedAt: 2, openToBots: false });
  assert.equal(getAgent("remote-1").openToBots, false, "an update can close the agent again");
  insertMessageRow("remote-1", { createdAt: 5, role: "assistant", text: "an old reply", tools: [], error: null });
  assert.equal(readMessageRows("remote-1")[0].ask, null);

  // 6. A question from GitHub is stored and comes back with its kind.
  insertMessageRow("remote-1", { createdAt: 6, role: "assistant", text: "", tools: [], error: null, ask: kinds[2] });
  assert.deepEqual(readMessageRows("remote-1")[1].ask, kinds[2]);

  console.log("agent question and bot switch storage tests passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}
