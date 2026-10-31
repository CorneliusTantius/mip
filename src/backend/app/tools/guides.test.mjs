// Checks tool guides: every tool has its own guide, offered guides go into the system prompt, deferred guides come back with
// tool_search, and the built-in persona no longer carries tool guidance. Run after a build: node src/backend/app/tools/guides.test.mjs
// It sets MIP_HOME to a temporary folder before the modules load.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIST = pathToFileURL(fileURLToPath(new URL("../../../../dist/backend/", import.meta.url))).href;
const root = mkdtempSync(join(tmpdir(), "mip-guides-"));
process.env.MIP_HOME = join(root, "mip-home");

try {
  const { AGENT_DEFERRED, AGENT_TOOLS, TOOLS, describeTools, toolGuidesPrompt } = await import(`${DIST}app/tools/index.js`);
  const { toolSearchTool } = await import(`${DIST}app/tools/search.js`);
  const { defaultPersona } = await import(`${DIST}app/personas.js`);

  // Every tool has its own guide: one paragraph, never empty.
  for (const tool of TOOLS) {
    assert.ok(tool.guide.trim().length > 0, `${tool.name} has no guide`);
    assert.doesNotMatch(tool.guide, /\n/, `${tool.name}'s guide is more than one paragraph`);
  }

  // The guides of the offered tools go into the system prompt. A deferred tool's guide stays out until tool_search returns it.
  const offered = toolGuidesPrompt(AGENT_TOOLS);
  assert.match(offered, /- bash: /);
  assert.match(offered, /- tool_search: /);
  assert.doesNotMatch(offered, /- memory_search: /);
  assert.match(toolGuidesPrompt(AGENT_DEFERRED), /- memory_search: /);
  assert.equal(toolGuidesPrompt([]), "");

  // tool_search returns each match with its guide, so the guide reaches the model when the tool is found.
  const found = await toolSearchTool.run({ query: "memory notes" }, { workspace: root, deferred: AGENT_DEFERRED });
  assert.equal(found.isError, false);
  assert.match(found.text, /guide: Searches the notes shared by all agents/);

  // The persona keeps who the assistant is and how it answers. Tool guidance is not in it any more.
  const prompt = defaultPersona().systemPrompt;
  assert.match(prompt, /Working style:/);
  assert.match(prompt, /Answers:/);
  assert.doesNotMatch(prompt, /\nTools:\n/);
  assert.doesNotMatch(prompt, /memory_(search|read|edit)/);

  // The registry lists every tool with its guide.
  assert.ok(describeTools().every((tool) => typeof tool.guide === "string" && tool.guide.length > 0));

  console.log("tool guide tests passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}
