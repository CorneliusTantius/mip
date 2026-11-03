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
  const names = ["mail_list", "mail_read", "slack_search", "slack_read", "slack_unread"];

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

  // 4. slack_unread lists the unread messages of the connected account, newest first, without the user's own, and asks Slack only to read.
  // Slack is faked: fetch answers the methods the tool uses, and every call is recorded.
  const slack = await import(`${DIST}app/slack/config.js`);
  slack.saveSlackAccount({ id: "T1.U1", teamId: "T1", teamName: "Acme", userId: "U1", userName: "Me", token: "xoxp-test" });
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const method = String(url).split("/").pop();
    const params = Object.fromEntries(new URLSearchParams(String(init.body)));
    calls.push({ method, params });
    const replies = {
      "users.list": { ok: true, members: [{ id: "U2", profile: { display_name: "Dana" } }, { id: "U1", real_name: "Me" }] },
      "users.conversations": { ok: true, channels: [{ id: "C1", name: "general" }, { id: "C2", name: "ops", is_group: true }, { id: "D1", is_im: true, user: "U2" }] },
      "conversations.info": { ok: true, channel: { last_read: { C1: "1700000100.000000", C2: "0", D1: "1700000500.000000" }[params.channel] } },
      "conversations.history": {
        ok: true,
        messages: {
          C1: [{ ts: "1700000300.000200", user: "U2", text: "deploy done, thanks <@U1>" }, { ts: "1700000200.000100", user: "U1", text: "my own message" }],
          C2: [{ ts: "1700000400.000300", user: "U3", text: "outage in prod" }],
          D1: [],
        }[params.channel],
      },
    };
    return new Response(JSON.stringify(replies[method]), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const unread = tool("slack_unread");
    const all = await unread.run({}, {});
    assert.equal(all.isError, false);
    assert.match(all.text, /^2 unread message\(s\) in 2 conversation\(s\)\./);
    assert.ok(all.text.indexOf("outage in prod") < all.text.indexOf("deploy done, thanks @Me"), "the newest unread message comes first");
    assert.match(all.text, /#ops \(C2\) U3: outage in prod/);
    assert.match(all.text, /#general \(C1\) Dana: deploy done, thanks @Me/);
    assert.ok(!all.text.includes("my own message"), "the user's own messages are not unread");
    assert.equal(calls.find((call) => call.method === "conversations.history" && call.params.channel === "C1").params.oldest, "1700000100.000000");

    const words = await unread.run({ query: "OUTAGE" }, {});
    assert.ok(words.text.includes("outage in prod") && !words.text.includes("deploy"), "query keeps the messages with its words");
    const none = await unread.run({ query: "nothing here" }, {});
    assert.equal(none.text, 'No unread message contains "nothing here".');
    const one = await unread.run({ count: 1 }, {});
    assert.match(one.text, /Showing the newest 1\./);
    assert.ok(!one.text.includes("deploy"));

    assert.ok(calls.every((call) => ["users.list", "users.conversations", "conversations.info", "conversations.history"].includes(call.method)), "only reads reach Slack");
  } finally {
    globalThis.fetch = realFetch;
  }

  console.log("social read tool tests passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}
