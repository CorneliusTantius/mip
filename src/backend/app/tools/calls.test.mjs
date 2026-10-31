// Checks tool-call recording: each call keeps its input and result, a result is matched by id, and long text is cut.
// Run after a build: node src/backend/app/tools/calls.test.mjs. It sets MIP_HOME to a temporary folder before the modules load.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIST = pathToFileURL(fileURLToPath(new URL("../../../../dist/backend/", import.meta.url))).href;
const root = mkdtempSync(join(tmpdir(), "mip-calls-"));
process.env.MIP_HOME = join(root, "mip-home");

try {
  const { MAX_TEXT, ToolCallLog } = await import(`${DIST}app/tools/calls.js`);
  const sessions = await import(`${DIST}storage/sessions.js`);

  // A log keeps each call's input, and attaches its result by the call's id. An unknown id is ignored.
  const log = new ToolCallLog();
  log.start("c1", "mcp__mip__bash", { command: "echo hi" });
  log.start("c2", "mcp__mip__skill_read", { name: "codeword" });
  log.finish("c2", "# codeword", false);
  log.finish("c1", "hi", false);
  log.finish("nope", "ignored", true);
  assert.equal(log.calls.length, 2);
  assert.deepEqual(log.calls[0], { name: "mcp__mip__bash", input: '{"command":"echo hi"}', output: "hi", isError: false });
  assert.equal(log.calls[1].output, "# codeword");

  // A call with no result yet has output null. An error result is marked.
  const pending = new ToolCallLog();
  pending.start("p1", "bash", {});
  assert.equal(pending.calls[0].output, null);
  pending.finish("p1", "boom", true);
  assert.equal(pending.calls[0].isError, true);

  // Long input and output are cut, and the cut is marked with how much was left out.
  const long = new ToolCallLog();
  long.start("l1", "bash", { command: "x".repeat(MAX_TEXT + 500) });
  long.finish("l1", "y".repeat(MAX_TEXT + 10), false);
  assert.match(long.calls[0].input, /… \(\d+ more characters\)$/);
  assert.ok(long.calls[0].input.length < MAX_TEXT + 60);
  assert.match(long.calls[0].output, /… \(10 more characters\)$/);

  // Messages keep their calls. A message saved without calls has none.
  const chat = sessions.createSession("claude-cli", "default", "Test chat");
  sessions.addMessage(chat.id, { role: "user", text: "hi", tools: [], error: null });
  sessions.addMessage(chat.id, { role: "assistant", text: "done", tools: ["bash", "skill_read"], calls: log.calls, error: null });
  const messages = sessions.listMessages(chat.id);
  assert.deepEqual(messages[0].calls, []);
  assert.equal(messages[1].calls.length, 2);
  assert.equal(messages[1].calls[0].name, "mcp__mip__bash");
  assert.deepEqual(messages[1].tools, ["bash", "skill_read"]);

  console.log("tool-call tests passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}
