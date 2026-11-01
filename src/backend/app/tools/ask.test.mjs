// Checks ask_user: it refuses bad input, keeps one question per reply, hands the question to the reply once, and needs an agent.
// Run after a build: node src/backend/app/tools/ask.test.mjs
// It sets MIP_HOME to a temporary folder before the modules load.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIST = pathToFileURL(fileURLToPath(new URL("../../../../dist/backend/", import.meta.url))).href;
const root = mkdtempSync(join(tmpdir(), "mip-ask-"));
process.env.MIP_HOME = join(root, "mip-home");

try {
  const { askUserTool, takePendingAsk } = await import(`${DIST}app/tools/ask.js`);
  const agent = { workspace: root, agentId: "agent-1" };

  // 1. A question is needed, and the kind must be one of the four.
  assert.equal((await askUserTool.run({ kind: "text" }, agent)).isError, true);
  const badKind = await askUserTool.run({ question: "Pick", kind: "dropdown" }, agent);
  assert.equal(badKind.isError, true);
  assert.match(badKind.text, /kind must be one of choice, multi, text, slider/);

  // 2. A choice needs from 2 to 8 options, each with text.
  assert.match((await askUserTool.run({ question: "Pick", kind: "choice", options: ["Only one"] }, agent)).text, /from 2 to 8 options/);
  assert.match((await askUserTool.run({ question: "Pick", kind: "multi", options: ["A", " "] }, agent)).text, /every option needs text/);
  assert.equal(takePendingAsk("agent-1"), null, "a refused question is not kept");

  // 3. A slider needs max above min, a step above 0, and a value inside the range.
  assert.match((await askUserTool.run({ question: "Size", kind: "slider", min: 5, max: 5 }, agent)).text, /max above min/);
  assert.match((await askUserTool.run({ question: "Size", kind: "slider", min: 0, max: 10, step: 0 }, agent)).text, /step must be above 0/);
  assert.match((await askUserTool.run({ question: "Size", kind: "slider", min: 0, max: 10, value: 11 }, agent)).text, /between min and max/);

  // 4. A valid choice is kept for the reply, with the question trimmed. The result tells the run to end.
  const pick = await askUserTool.run({ question: "  Which colour?  ", kind: "choice", options: ["Red", "Blue"] }, agent);
  assert.equal(pick.isError, false);
  assert.match(pick.text, /End your turn now/);
  // A second question in the same run is refused until the reply takes the first.
  const second = await askUserTool.run({ question: "And size?", kind: "text" }, agent);
  assert.equal(second.isError, true);
  assert.match(second.text, /Ask one at a time/);
  assert.deepEqual(takePendingAsk("agent-1"), { question: "Which colour?", kind: "choice", options: ["Red", "Blue"] });
  // The reply has taken it, so the next run may ask again, and nothing is left over.
  assert.equal(takePendingAsk("agent-1"), null);

  // 5. A text question keeps its placeholder, and a slider takes its defaults: step 1 and the value at min.
  await askUserTool.run({ question: "Name?", kind: "text", placeholder: "  e.g. Freya  " }, agent);
  assert.deepEqual(takePendingAsk("agent-1"), { question: "Name?", kind: "text", placeholder: "e.g. Freya" });
  await askUserTool.run({ question: "Rating?", kind: "slider", min: 1, max: 5 }, agent);
  assert.deepEqual(takePendingAsk("agent-1"), { question: "Rating?", kind: "slider", min: 1, max: 5, step: 1, value: 1 });

  // 6. A multi question keeps its options in the order they were given.
  await askUserTool.run({ question: "Which?", kind: "multi", options: ["One", "Two", "Three"] }, agent);
  assert.deepEqual(takePendingAsk("agent-1"), { question: "Which?", kind: "multi", options: ["One", "Two", "Three"] });

  // 7. Only an agent's run can ask. A bot's run has no agent, so it is refused.
  const bot = await askUserTool.run({ question: "Pick", kind: "text" }, { workspace: root, roomId: "main" });
  assert.equal(bot.isError, true);
  assert.match(bot.text, /Only an agent/);

  console.log("ask user tests passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}
