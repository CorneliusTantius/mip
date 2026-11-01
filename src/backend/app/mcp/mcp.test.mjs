// Checks the MCP servers: the config file's rules, each server's connection state, the tools that run through a server, how agents
// find them, and the reload. A small fake stdio server stands in for a real one.
// Run after a build: node src/backend/app/mcp/mcp.test.mjs
// It sets MIP_HOME to a temporary folder before the modules load, so no real config or server is touched.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIST = pathToFileURL(fileURLToPath(new URL("../../../../dist/backend/", import.meta.url))).href;
const root = mkdtempSync(join(tmpdir(), "mip-mcp-"));
process.env.MIP_HOME = join(root, "mip-home");

// Two tools: "echo" returns its text, and "fail" returns a failed result.
const FAKE_SERVER = `
import { createInterface } from "node:readline";
const send = (message) => process.stdout.write(JSON.stringify(message) + "\\n");
createInterface({ input: process.stdin }).on("line", (line) => {
  const message = JSON.parse(line);
  if (message.id === undefined) return;
  switch (message.method) {
    case "initialize":
      return send({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "fake", version: "1.0.0" } } });
    case "tools/list":
      return send({ jsonrpc: "2.0", id: message.id, result: { tools: [
        { name: "echo", description: "Echo the text back.", inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } },
        { name: "fail", description: "Always reports a failed result.", inputSchema: { type: "object" } },
      ] } });
    case "tools/call":
      if (message.params.name === "echo") return send({ jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: message.params.arguments.text }] } });
      return send({ jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: "it broke" }], isError: true } });
    default:
      return send({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "method not found" } });
  }
});
`;

try {
  const paths = await import(`${DIST}storage/paths.js`);
  const config = await import(`${DIST}app/mcp/config.js`);
  const manager = await import(`${DIST}app/mcp/manager.js`);
  const tools = await import(`${DIST}app/tools/index.js`);
  const search = await import(`${DIST}app/tools/search.js`);
  paths.ensureMipDirs();
  const serverPath = join(root, "fake-server.mjs");
  writeFileSync(serverPath, FAKE_SERVER);

  // 1. The config file: good entries load, and each bad one is reported by name without stopping the others.
  const parsed = config.parseMcpConfig(
    JSON.stringify({
      mcpServers: {
        fake: { command: "node", args: ["x.mjs"], env: { A: "1" } },
        remote: { type: "http", url: "https://example.test/mcp", headers: { Authorization: "Bearer t" } },
        bare: { url: "http://example.test/mcp" },
        "bad name!": { command: "node" },
        nocommand: { type: "stdio" },
        sse: { type: "sse", url: "http://example.test/sse" },
        weird: { url: "ftp://example.test/x" },
        list: { command: "node", args: "not-a-list" },
      },
    }),
  );
  assert.deepEqual(parsed.servers.map((server) => [server.name, server.transport]), [["fake", "stdio"], ["remote", "http"], ["bare", "http"]]);
  assert.deepEqual(parsed.servers[0].env, { A: "1" });
  assert.deepEqual(parsed.problems.map((problem) => problem.server), ["bad name!", "nocommand", "sse", "weird", "list"]);
  assert.match(parsed.problems.find((problem) => problem.server === "sse").error, /not supported/);
  assert.deepEqual(config.parseMcpConfig("{not json").problems.map((problem) => problem.server), ["mcp.json"]);
  assert.match(config.parseMcpConfig("[]").problems[0].error, /mcpServers/);
  assert.equal(manager.mcpToolName("fake", "echo"), "mcp_fake_echo");
  const long = manager.mcpToolName("server", "a tool name with spaces and dots.and.more".repeat(3));
  assert.ok(long.length <= 64 && /^[A-Za-z0-9_-]+$/.test(long), "tool names fit the provider limit");

  // 2. Start with a real config: one server that works, one that cannot start, and one that refuses connections.
  writeFileSync(
    paths.MCP_CONFIG_FILE,
    JSON.stringify({
      mcpServers: {
        fake: { command: process.execPath, args: [serverPath], env: { SECRET_TOKEN: "hunter2" } },
        missing: { command: join(root, "no-such-command") },
        closed: { type: "http", url: "http://127.0.0.1:47891/mcp" },
      },
    }),
  );
  await manager.startMcpServers();
  const status = manager.mcpStatus();
  const byName = Object.fromEntries(status.servers.map((server) => [server.name, server]));
  assert.equal(byName.fake.status, "connected");
  assert.deepEqual(byName.fake.tools.map((tool) => [tool.name, tool.remoteName]), [["mcp_fake_echo", "echo"], ["mcp_fake_fail", "fail"]]);
  assert.equal(byName.missing.status, "error");
  assert.equal(byName.closed.status, "error");
  assert.match(byName.closed.error, /fetch failed: connect ECONNREFUSED 127.0.0.1:47891/, "a network failure keeps its cause");
  assert.equal(status.configFile, paths.MCP_CONFIG_FILE);
  assert.ok(!JSON.stringify(status).includes("hunter2"), "the status never shows environment values");

  // 3. A tool runs through its server. A failed result comes back as a failed result.
  const deferred = tools.agentDeferredTools();
  assert.ok(deferred.some((tool) => tool.name === "mcp_fake_echo"), "agents get the server's tools as deferred tools");
  const echo = deferred.find((tool) => tool.name === "mcp_fake_echo");
  assert.deepEqual(await echo.run({ text: "hello" }, { workspace: root }), { text: "hello", isError: false });
  const broke = deferred.find((tool) => tool.name === "mcp_fake_fail");
  assert.deepEqual(await broke.run({}, { workspace: root }), { text: "it broke", isError: true });

  // 4. Agents find the tools with tool_search and run them with tool_call, as they do for their own deferred tools.
  const found = await search.toolSearchTool.run({ query: "echo text" }, { workspace: root, deferred });
  assert.match(found.text, /mcp_fake_echo: Echo the text back\./);
  const called = await search.toolCallTool.run({ name: "mcp_fake_echo", input: { text: "via tool_call" } }, { workspace: root, deferred });
  assert.equal(called.text, "via tool_call");

  // 5. A bot turn gets the same tools as deferred tools, and finds and runs them the same way, with its own run context.
  const botDeferred = tools.botDeferredTools();
  assert.ok(botDeferred.some((tool) => tool.name === "mcp_fake_echo"), "bots get the server's tools as deferred tools");
  const botFound = await search.toolSearchTool.run({ query: "echo text" }, { workspace: root, botId: "bot-a", roomId: "room-a", deferred: botDeferred });
  assert.match(botFound.text, /mcp_fake_echo/);
  const botCalled = await search.toolCallTool.run({ name: "mcp_fake_echo", input: { text: "from a bot" } }, { botId: "bot-a", roomId: "room-a", deferred: botDeferred });
  assert.equal(botCalled.text, "from a bot");

  // 6. The registry lists them as deferred, for agents and for bots.
  const listed = tools.describeTools().find((tool) => tool.name === "mcp_fake_echo");
  assert.deepEqual([listed.load, listed.agent, listed.bot], ["deferred", true, true]);

  // 7. A reload follows the file: a server removed from it goes away, and its tools stop being offered to agents and bots.
  writeFileSync(paths.MCP_CONFIG_FILE, JSON.stringify({ mcpServers: { fake: { command: process.execPath, args: [serverPath] } } }));
  await manager.startMcpServers();
  assert.deepEqual(manager.mcpStatus().servers.map((server) => server.name), ["fake"]);
  assert.ok(tools.agentDeferredTools().some((tool) => tool.name === "mcp_fake_echo"));
  assert.ok(tools.botDeferredTools().some((tool) => tool.name === "mcp_fake_echo"));
  writeFileSync(paths.MCP_CONFIG_FILE, JSON.stringify({ mcpServers: {} }));
  await manager.startMcpServers();
  assert.deepEqual(manager.mcpTools(), []);
  assert.ok(!tools.agentDeferredTools().some((tool) => tool.name.startsWith("mcp_")));
  assert.deepEqual(tools.botDeferredTools(), []);

  // 8. Closing a live server leaves nothing connected.
  writeFileSync(paths.MCP_CONFIG_FILE, JSON.stringify({ mcpServers: { fake: { command: process.execPath, args: [serverPath] } } }));
  await manager.startMcpServers();
  assert.equal(manager.mcpTools().length, 2);
  await manager.closeMcpServers();
  assert.deepEqual(manager.mcpTools(), []);

  console.log("mcp tests passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}
