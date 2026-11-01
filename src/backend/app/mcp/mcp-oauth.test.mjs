// Checks the MCP servers that sign in with OAuth, and adding and removing servers. A server waiting for sign-in shows its link. The callback
// finishes the sign-in, the tokens are kept in mcp.json, the server connects and runs its tool, and a reload uses the saved tokens. A fake
// OAuth server stands in for a real one. Run after a build: node src/backend/app/mcp/mcp-oauth.test.mjs
// It sets MIP_HOME to a temporary folder before the modules load, so no real config or server is touched.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIST = pathToFileURL(fileURLToPath(new URL("../../../../dist/backend/", import.meta.url))).href;
const root = mkdtempSync(join(tmpdir(), "mip-mcp-oauth-"));
process.env.MIP_HOME = join(root, "mip-home");

const readBody = async (req) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
};
const json = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

// A fake OAuth server. Its page takes the code "good-code" and gives the access token "tok-1". /mcp wants that token, and answers 401 with
// the address of its metadata otherwise, as an OAuth server does.
let authPort = 0;
// How many times a client asked the server to register it. A server with its own client never asks.
let registrations = 0;
const base = () => `http://127.0.0.1:${authPort}`;
const authServer = createServer(async (req, res) => {
  const url = new URL(req.url, base());
  const body = await readBody(req);
  if (url.pathname === "/.well-known/oauth-protected-resource") {
    return json(res, 200, { resource: `${base()}/mcp`, authorization_servers: [base()] });
  }
  if (url.pathname === "/.well-known/oauth-authorization-server") {
    return json(res, 200, {
      issuer: base(),
      authorization_endpoint: `${base()}/authorize`,
      token_endpoint: `${base()}/token`,
      registration_endpoint: `${base()}/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    });
  }
  if (url.pathname === "/register") {
    registrations += 1;
    return json(res, 201, { ...JSON.parse(body), client_id: "client-1" });
  }
  if (url.pathname === "/token") {
    const form = new URLSearchParams(body);
    const granted = form.get("grant_type") === "authorization_code" && form.get("code") === "good-code" && form.get("code_verifier");
    if (!granted) return json(res, 400, { error: "invalid_grant" });
    return json(res, 200, { access_token: "tok-1", token_type: "Bearer", expires_in: 3600, refresh_token: "ref-1" });
  }
  if (url.pathname === "/mcp") {
    if (req.headers.authorization !== "Bearer tok-1") {
      res.writeHead(401, { "WWW-Authenticate": `Bearer resource_metadata="${base()}/.well-known/oauth-protected-resource"` });
      return res.end();
    }
    if (req.method === "GET") return res.writeHead(405).end();
    const message = JSON.parse(body);
    if (message.id === undefined) return res.writeHead(202).end();
    if (message.method === "initialize") {
      return json(res, 200, {
        jsonrpc: "2.0",
        id: message.id,
        result: { protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "fake-oauth", version: "1.0.0" } },
      });
    }
    if (message.method === "tools/list") {
      const tool = { name: "echo", description: "Echo the text back.", inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } };
      return json(res, 200, { jsonrpc: "2.0", id: message.id, result: { tools: [tool] } });
    }
    if (message.method === "tools/call") {
      return json(res, 200, { jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: message.params.arguments.text }] } });
    }
  }
  res.writeHead(404).end();
});

// The browser's address of the callback. The test calls it the way the router would.
const callbackServer = createServer(async (req, res) => {
  const { handleOAuthCallback } = await import(`${DIST}http/mcp-oauth.js`);
  return handleOAuthCallback(new URL(req.url, "http://127.0.0.1"), res);
});

const waitFor = async (check, ms) => {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("timed out waiting");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
};

await new Promise((resolve) => authServer.listen(0, "127.0.0.1", resolve));
authPort = authServer.address().port;
await new Promise((resolve) => callbackServer.listen(0, "127.0.0.1", resolve));
const callbackUrl = `http://127.0.0.1:${callbackServer.address().port}/api/mcp/oauth/callback`;

try {
  const paths = await import(`${DIST}storage/paths.js`);
  const manager = await import(`${DIST}app/mcp/manager.js`);
  const servers = await import(`${DIST}app/mcp/servers.js`);
  const { AppError } = await import(`${DIST}app/errors.js`);
  paths.ensureMipDirs();
  const readConfig = () => JSON.parse(readFileSync(paths.MCP_CONFIG_FILE, "utf8"));
  const statusOf = (name) => manager.mcpStatus().servers.find((server) => server.name === name);

  // 1. Adding an OAuth server connects it at once, so it waits at its sign-in link. The link asks for a code, with the server's client id
  // and this app's callback address, and its state is saved in mcp.json, so a later callback can be matched to this server.
  const added = await servers.addMcpServer({ name: "docs", transport: "oauth", url: `${base()}/mcp` });
  const docs = added.servers.find((server) => server.name === "docs");
  assert.equal(docs.status, "sign-in");
  assert.equal(docs.oauth, true);
  const link = new URL(docs.signInUrl);
  assert.equal(`${link.origin}${link.pathname}`, `${base()}/authorize`, "the link goes to the server's authorization page");
  assert.equal(link.searchParams.get("client_id"), "client-1");
  assert.equal(link.searchParams.get("code_challenge_method"), "S256");
  assert.match(link.searchParams.get("redirect_uri"), /\/api\/mcp\/oauth\/callback$/);
  const state = link.searchParams.get("state");
  assert.ok(state, "the link carries a state");
  assert.equal(readConfig().mcpServers.docs.oauth.oauthState, state, "the state is kept in mcp.json");
  assert.equal(typeof readConfig().mcpServers.docs.oauth.codeVerifier, "string");
  assert.equal((statSync(paths.MCP_CONFIG_FILE).mode & 0o777).toString(8), "600", "mcp.json is readable only by this user");
  assert.deepEqual(readConfig().mcpServers.docs.allowedTools, [], "a server added in the card offers no tools until they are allowed");

  // 2. A callback with a state nobody is waiting for is refused, and says so on the page.
  const stale = await fetch(`${callbackUrl}?code=good-code&state=not-a-state`);
  assert.equal(stale.status, 400);
  assert.match(await stale.text(), /no longer waiting/);

  // 3. A refusal from the server is shown, and leaves the server waiting.
  const refused = await fetch(`${callbackUrl}?error=access_denied&error_description=The+user+said+no&state=${state}`);
  assert.equal(refused.status, 400);
  assert.match(await refused.text(), /did not allow the sign-in: The user said no/);
  assert.equal(statusOf("docs").status, "sign-in");

  // 4. The callback with the code finishes the sign-in. The server connects with the new token, and its tool runs.
  const done = await fetch(`${callbackUrl}?code=good-code&state=${state}`);
  assert.equal(done.status, 200);
  assert.match(await done.text(), /docs is signed in/);
  await waitFor(() => statusOf("docs").status === "connected", 15000);
  // The tool is listed, but no run is offered it until it is allowed.
  assert.equal(statusOf("docs").tools.find((tool) => tool.remoteName === "echo").enabled, false);
  assert.equal(manager.mcpTools().some((tool) => tool.name === "mcp_docs_echo"), false);
  await assert.rejects(servers.setAllowedTools("docs", { allowedTools: "echo" }), (err) => err.status === 400);
  await servers.setAllowedTools("docs", { allowedTools: ["echo"] });
  assert.deepEqual(readConfig().mcpServers.docs.allowedTools, ["echo"]);
  const echo = manager.mcpTools().find((tool) => tool.name === "mcp_docs_echo");
  assert.ok(echo, "the allowed tool is offered as mcp_docs_echo");
  assert.deepEqual(await echo.run({ text: "hello" }, { workspace: root }), { text: "hello", isError: false });

  // 5. The tokens are kept in mcp.json, so the server does not need another sign-in.
  assert.equal(readConfig().mcpServers.docs.oauth.tokens.access_token, "tok-1");
  await manager.startMcpServers();
  assert.equal(statusOf("docs").status, "connected", "a reload connects with the saved tokens");
  assert.ok(manager.mcpTools().some((tool) => tool.name === "mcp_docs_echo"), "the allowed tool stays allowed after a reload");

  // 6. A bad entry is refused with the reason, and nothing is written.
  const before = readFileSync(paths.MCP_CONFIG_FILE, "utf8");
  await assert.rejects(servers.addMcpServer({ name: "docs", transport: "oauth", url: `${base()}/mcp` }), (err) => err instanceof AppError && err.status === 409);
  await assert.rejects(servers.addMcpServer({ name: "ws", transport: "ws", url: "http://example.test" }), (err) => err.status === 400);
  await assert.rejects(servers.addMcpServer({ name: "bad name!", transport: "oauth", url: "http://example.test/mcp" }), (err) => err.status === 400 && /letter or digit/.test(err.message));
  await assert.rejects(servers.addMcpServer({ name: "ftp", transport: "http", url: "ftp://example.test/mcp" }), (err) => err.status === 400 && /http:\/\/ or https:\/\//.test(err.message));
  await assert.rejects(servers.addMcpServer({ transport: "http", url: "http://example.test/mcp" }), (err) => err.status === 400 && /A name is required/.test(err.message));
  assert.equal(readFileSync(paths.MCP_CONFIG_FILE, "utf8"), before, "a refused add writes nothing");

  // 7. An entry the app cannot load, written by hand, is kept when the app adds or removes another server.
  const file = readConfig();
  file.mcpServers.broken = { command: 5 };
  writeFileSync(paths.MCP_CONFIG_FILE, JSON.stringify(file, null, 2));
  await servers.addMcpServer({ name: "local", transport: "stdio", command: "node", args: ["-e", "process.exit(0)"], env: {} });
  const afterAdd = readConfig();
  assert.ok(afterAdd.mcpServers.broken, "an entry the app does not load is kept");
  assert.ok(afterAdd.mcpServers.local, "the new server is written");
  assert.equal(afterAdd.mcpServers.docs.oauth.tokens.access_token, "tok-1", "the other servers keep their tokens");
  await servers.removeMcpServer("local");
  assert.ok(readConfig().mcpServers.broken, "a removal keeps the entry the app does not load");
  assert.equal(readConfig().mcpServers.local, undefined);
  await assert.rejects(servers.removeMcpServer("local"), (err) => err.status === 404);

  // 8. Signing in again reconnects an OAuth server. A server without OAuth cannot sign in.
  await manager.signInServer("docs");
  assert.equal(statusOf("docs").status, "connected");
  await servers.addMcpServer({ name: "plain", transport: "http", url: `${base()}/plain`, headers: {} });
  await assert.rejects(manager.signInServer("plain"), (err) => err.status === 400 && /does not sign in with OAuth/.test(err.message));
  await assert.rejects(manager.signInServer("nobody"), (err) => err.status === 404);
  await assert.rejects(servers.setAllowedTools("docs", {}), (err) => err.status === 400);
  await assert.rejects(servers.setAllowedTools("nobody", { allowedTools: null }), (err) => err.status === 404);

  // 9. A server with its own OAuth client signs in with that client, and mip does not ask the server to register one. A client secret
  // needs a client ID.
  const registered = registrations;
  const preset = await servers.addMcpServer({ name: "preset", transport: "oauth", url: `${base()}/mcp`, clientId: "preset-client", clientSecret: "shh" });
  const presetLink = new URL(preset.servers.find((server) => server.name === "preset").signInUrl);
  assert.equal(presetLink.searchParams.get("client_id"), "preset-client", "the link uses the server's own client");
  assert.equal(registrations, registered, "no registration is asked for");
  assert.equal(readConfig().mcpServers.preset.clientId, "preset-client");
  assert.equal(readConfig().mcpServers.preset.clientSecret, "shh", "the secret is kept in mcp.json");
  await assert.rejects(servers.addMcpServer({ name: "lonely", transport: "oauth", url: `${base()}/mcp`, clientSecret: "shh" }), (err) => err.status === 400 && /client ID/.test(err.message));
  await servers.removeMcpServer("preset");

  console.log("MCP OAuth tests passed");
} finally {
  const manager = await import(`${DIST}app/mcp/manager.js`);
  await manager.closeMcpServers();
  await new Promise((resolve) => authServer.close(resolve));
  await new Promise((resolve) => callbackServer.close(resolve));
  rmSync(root, { recursive: true, force: true });
}
