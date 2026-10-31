// Checks tool search: which tools are offered and which are deferred, how tool_search finds them, and how tool_call runs them.
// Run after a build: node src/backend/app/tools/tool-search.test.mjs. It sets MIP_HOME to a temporary folder before the modules load.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIST = pathToFileURL(fileURLToPath(new URL("../../../../dist/backend/", import.meta.url))).href;
const root = mkdtempSync(join(tmpdir(), "mip-search-"));
process.env.MIP_HOME = join(root, "mip-home");

try {
  const { BOT_TOOLS, AGENT_DEFERRED, AGENT_TOOLS, DEFERRED_TOOLS, describeTools } = await import(`${DIST}app/tools/index.js`);
  const { searchTools, toolCallTool, toolSearchTool } = await import(`${DIST}app/tools/search.js`);

  const names = (list) => list.map((tool) => tool.name);

  // An agent run is offered the basic tools and the two search tools. Memory and skill_file are deferred, found with tool_search.
  assert.deepEqual(names(AGENT_TOOLS), ["bash", "read", "edit", "write", "skill_read", "tool_search", "tool_call"]);
  assert.deepEqual(names(AGENT_DEFERRED), ["memory_search", "memory_read", "memory_edit", "skill_file"]);
  assert.deepEqual(BOT_TOOLS, []);

  // Search finds tools by the words of their names and descriptions. A query nothing matches finds nothing.
  assert.ok(names(searchTools(DEFERRED_TOOLS, "memory")).includes("memory_search"));
  assert.ok(names(searchTools(DEFERRED_TOOLS, "skill")).includes("skill_file"));
  assert.deepEqual(searchTools(DEFERRED_TOOLS, "spaceship"), []);

  // tool_search lists the matches with their inputs. With no match, it says so.
  const context = { workspace: root, chatId: "chat-a", deferred: AGENT_DEFERRED };
  const found = await toolSearchTool.run({ query: "search notes" }, context);
  assert.equal(found.isError, false);
  assert.match(found.text, /memory_search: /);
  assert.match(found.text, /query \(string, required\)/);
  const none = await toolSearchTool.run({ query: "spaceship" }, context);
  assert.match(none.text, /No tool matches/);

  // tool_call runs a deferred tool with the inputs it is given.
  const called = await toolCallTool.run({ name: "memory_search", input: { query: "anything" } }, context);
  assert.equal(called.isError, false);

  // tool_call refuses a basic tool, since that is offered directly, and any tool the run was not given.
  const basic = await toolCallTool.run({ name: "bash", input: { command: "echo hi" } }, context);
  assert.equal(basic.isError, true);
  assert.match(basic.text, /no deferred tool named bash/);
  const forBot = await toolCallTool.run({ name: "memory_search", input: { query: "x" } }, { workspace: root, deferred: BOT_TOOLS });
  assert.equal(forBot.isError, true);

  // With no deferred tools in the run, tool_search says so.
  const noneHere = await toolSearchTool.run({ query: "memory" }, { workspace: root, deferred: [] });
  assert.match(noneHere.text, /No other tools/);

  // The registry says how each tool is offered: basic, deferred, or the search tools. Agents can use every tool.
  const described = Object.fromEntries(describeTools().map((tool) => [tool.name, tool]));
  assert.equal(described.bash.load, "basic");
  assert.equal(described.memory_search.load, "deferred");
  assert.equal(described.tool_call.load, "search");
  assert.ok(describeTools().every((tool) => tool.agent === true && tool.bot === false));

  console.log("tool search tests passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}
