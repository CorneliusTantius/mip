// Checks the read tools for bots over mail and Slack: they are deferred for bots (found with tool_search), not offered to agents, and they refuse
// an account that is not connected before any call reaches a server. Run after a build: node src/backend/app/tools/social.test.mjs
// It sets MIP_HOME to a temporary folder before the modules load, so no real config is touched.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIST = pathToFileURL(fileURLToPath(new URL("../../../../dist/backend/", import.meta.url))).href;
const root = mkdtempSync(join(tmpdir(), "mip-social-tools-"));
process.env.MIP_HOME = join(root, "mip-home");

try {
  const paths = await import(`${DIST}storage/paths.js`);
  const registry = await import(`${DIST}app/tools/index.js`);
  const social = await import(`${DIST}app/tools/social.js`);
  paths.ensureMipDirs();
  const names = ["mail_list", "mail_read", "slack_search", "slack_read"];

  // 1. Bots find the read tools through tool_search. Agents do not get them.
  const bot = registry.botDeferredTools().map((tool) => tool.name);
  for (const name of names) assert.ok(bot.includes(name), `${name} is deferred for bots`);
  const agent = registry.agentDeferredTools().map((tool) => tool.name);
  for (const name of names) assert.ok(!agent.includes(name), `${name} is not given to agents`);
  assert.ok(registry.describeTools().find((tool) => tool.name === "slack_read").bot, "the Tools card shows them for bots");

  // 2. Each one has a description and a guide, and none of them sends or changes anything.
  for (const tool of social.SOCIAL_TOOLS) {
    assert.ok(tool.description.length > 0 && tool.guide.length > 0, `${tool.name} is described`);
    assert.ok(!/send|post|delete|mark/i.test(tool.name), `${tool.name} is read-only by name`);
  }

  // 3. With no account connected, a tool that needs one refuses before it calls anything.
  // The registry's copies report a failure as an error result, the way a run sees it.
  const tool = (name) => registry.botDeferredTools().find((candidate) => candidate.name === name);
  const noMail = await tool("mail_list").run({}, {});
  assert.equal(noMail.isError, true);
  assert.match(noMail.text, /Name the mail account/);
  const noSlack = await tool("slack_read").run({ channel: "general" }, {});
  assert.equal(noSlack.isError, true);
  assert.match(noSlack.text, /Name the Slack account/);

  console.log("social read tool tests passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}
