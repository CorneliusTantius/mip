import { AppError } from "../errors.js";
import { editMcpFile, parseMcpConfig } from "./config.js";
import { mcpStatus, startMcpServers } from "./manager.js";

// Adding, removing, and choosing the tools of MCP servers from the MCP card. Each change edits mcp.json, checks the new entry with the same
// rules the file is read by, and then connects again. A stdio server runs a command on this machine, so the card asks for it only when the
// user adds one.

// Changes to mcp.json and the connections run one at a time. Two changes sent at once would otherwise interleave their edits and reconnects,
// so the state the page shows could differ from the state saved.
let queue: Promise<unknown> = Promise.resolve();
function inOrder<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work);
  queue = run.catch(() => undefined);
  return run;
}

// Connects every server again, from the file. It runs in the same order as the changes.
export function reloadMcp() {
  return inOrder(async () => {
    await startMcpServers();
    return mcpStatus();
  });
}

// Builds the mcp.json entry for a new server, from the card's form. "oauth" is a web server that signs in with OAuth, so the user gives its
// address, and a client only when the server needs one. "http" takes headers, and "stdio" runs a command. A new server offers no tools
// until the user allows some, so a tool the user has not looked at cannot run.
function entryOf(input: unknown): { name: string; entry: Record<string, unknown> } {
  const body = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const name = String(body.name ?? "").trim();
  if (!name) throw new AppError(400, "A name is required.");
  const url = String(body.url ?? "").trim();
  switch (body.transport) {
    case "oauth": {
      const clientId = String(body.clientId ?? "").trim();
      const clientSecret = String(body.clientSecret ?? "").trim();
      if (clientSecret && !clientId) throw new AppError(400, "A client secret needs a client ID.");
      return {
        name,
        entry: {
          type: "http",
          url,
          headers: {},
          oauth: { serverUrl: url },
          allowedTools: [],
          clientId: clientId || undefined,
          clientSecret: clientSecret || undefined,
        },
      };
    }
    case "http":
      return { name, entry: { type: "http", url, headers: body.headers ?? {}, allowedTools: [] } };
    case "stdio":
      return { name, entry: { type: "stdio", command: String(body.command ?? "").trim(), args: body.args ?? [], env: body.env ?? {}, allowedTools: [] } };
    default:
      throw new AppError(400, 'The transport must be "oauth", "http", or "stdio".');
  }
}

// Adds a server to mcp.json and connects. A name already listed is refused, and so is an entry the file would not load.
export function addMcpServer(input: unknown) {
  return inOrder(() => addServer(input));
}

async function addServer(input: unknown) {
  const { name, entry } = entryOf(input);
  const { problems } = parseMcpConfig(JSON.stringify({ mcpServers: { [name]: entry } }));
  if (problems.length > 0) throw new AppError(400, problems[0].error);
  editMcpFile((servers) => {
    if (Object.prototype.hasOwnProperty.call(servers, name)) throw new AppError(409, `A server called "${name}" is already listed.`);
    servers[name] = entry;
  });
  await startMcpServers();
  return mcpStatus();
}

// Removes a server from mcp.json, and disconnects it with the others.
export function removeMcpServer(name: string) {
  return inOrder(() => removeServer(name));
}

async function removeServer(name: string) {
  editMcpFile((servers) => {
    if (!Object.prototype.hasOwnProperty.call(servers, name)) throw new AppError(404, `No MCP server called "${name}".`);
    delete servers[name];
  });
  await startMcpServers();
  return mcpStatus();
}

// Sets which of a server's tools the app offers, by their names on the server. Null offers every tool again, as a server with no list does.
// The servers connect again afterwards, as they do for any change to mcp.json.
export function setAllowedTools(name: string, input: unknown) {
  return inOrder(() => setServerTools(name, input));
}

async function setServerTools(name: string, input: unknown) {
  const body = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const allowed = body.allowedTools;
  if (allowed !== null && (!Array.isArray(allowed) || !allowed.every((tool) => typeof tool === "string"))) {
    throw new AppError(400, '"allowedTools" must be a list of tool names, or null for every tool.');
  }
  const list = allowed as string[] | null;
  editMcpFile((servers) => {
    const entry = Object.prototype.hasOwnProperty.call(servers, name) ? servers[name] : undefined;
    if (typeof entry !== "object" || entry === null) throw new AppError(404, `No MCP server called "${name}".`);
    const record = entry as Record<string, unknown>;
    if (list === null) delete record.allowedTools;
    else record.allowedTools = [...new Set(list)];
  });
  await startMcpServers();
  return mcpStatus();
}
