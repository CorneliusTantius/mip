import { AppError } from "../errors.js";
import { editMcpFile, parseMcpConfig } from "./config.js";
import { mcpStatus, startMcpServers } from "./manager.js";

// Adding and removing MCP servers from the MCP card. Each change edits mcp.json, checks the new entry with the same rules the file is
// read by, and then connects again. A stdio server runs a command on this machine, so the card asks for it only when the user adds one.

// Builds the mcp.json entry for a new server, from the card's form. "oauth" is a web server that signs in with OAuth, so the user gives
// only its address; "http" takes headers; "stdio" runs a command.
function entryOf(input: unknown): { name: string; entry: Record<string, unknown> } {
  const body = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const name = String(body.name ?? "").trim();
  if (!name) throw new AppError(400, "A name is required.");
  const url = String(body.url ?? "").trim();
  switch (body.transport) {
    case "oauth":
      return { name, entry: { type: "http", url, headers: {}, oauth: { serverUrl: url } } };
    case "http":
      return { name, entry: { type: "http", url, headers: body.headers ?? {} } };
    case "stdio":
      return { name, entry: { type: "stdio", command: String(body.command ?? "").trim(), args: body.args ?? [], env: body.env ?? {} } };
    default:
      throw new AppError(400, 'The transport must be "oauth", "http", or "stdio".');
  }
}

// Adds a server to mcp.json and connects. A name already listed is refused, and so is an entry the file would not load.
export async function addMcpServer(input: unknown) {
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
export async function removeMcpServer(name: string) {
  editMcpFile((servers) => {
    if (!Object.prototype.hasOwnProperty.call(servers, name)) throw new AppError(404, `No MCP server called "${name}".`);
    delete servers[name];
  });
  await startMcpServers();
  return mcpStatus();
}
