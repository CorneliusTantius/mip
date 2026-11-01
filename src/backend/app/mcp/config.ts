import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { MCP_CONFIG_FILE } from "../../storage/paths.js";
import { errorMessage } from "../errors.js";

// The MCP servers mip connects to, read from MIP_HOME/data/mcp.json. The file has the shape Claude Code and Pi use: a "mcpServers"
// map from a server name to a stdio command or a Streamable HTTP link. A bad entry is reported and skipped, and the others still load.

export type McpServerConfig =
  | { name: string; transport: "stdio"; command: string; args: string[]; env: Record<string, string> }
  | { name: string; transport: "http"; url: string; headers: Record<string, string> };

export interface McpConfigProblem {
  server: string;
  error: string;
}

// One server as the file and the sync record hold it. A field its transport does not use is absent. Environment values and headers
// are included, since the file holds them, and the sync repo is private.
export interface McpServerEntry {
  name: string;
  transport: "stdio" | "http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

// A server name: a letter or digit, then letters, digits, dashes or underscores, up to 32 characters. It becomes part of each tool's name.
const NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;

export function parseMcpConfig(text: string): { servers: McpServerConfig[]; problems: McpConfigProblem[] } {
  const servers: McpServerConfig[] = [];
  const problems: McpConfigProblem[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { servers, problems: [{ server: "mcp.json", error: `not valid JSON: ${errorMessage(err)}` }] };
  }
  const map = isRecord(parsed) && isRecord(parsed.mcpServers) ? parsed.mcpServers : undefined;
  if (!map) return { servers, problems: [{ server: "mcp.json", error: 'expected an object with an "mcpServers" map' }] };

  for (const [name, entry] of Object.entries(map)) {
    try {
      servers.push(parseServer(name, entry));
    } catch (err) {
      problems.push({ server: name, error: errorMessage(err) });
    }
  }
  return { servers, problems };
}

// The servers in the config file. A missing file means no servers.
export function readMcpConfig(): { servers: McpServerConfig[]; problems: McpConfigProblem[] } {
  if (!existsSync(MCP_CONFIG_FILE)) return { servers: [], problems: [] };
  return parseMcpConfig(readFileSync(MCP_CONFIG_FILE, "utf8"));
}

// The text of a config file that holds these servers, in the shape parseMcpConfig reads. Servers are written in name order.
export function mcpConfigText(servers: McpServerEntry[]): string {
  const entries = [...servers]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((server) => [
      server.name,
      server.transport === "stdio"
        ? { type: "stdio", command: server.command, args: server.args ?? [], env: server.env ?? {} }
        : { type: "http", url: server.url, headers: server.headers ?? {} },
    ]);
  return `${JSON.stringify({ mcpServers: Object.fromEntries(entries) }, null, 2)}\n`;
}

// Writes the config file readable only by this user, since it holds tokens.
export function writeMcpConfigText(text: string): void {
  writeFileSync(MCP_CONFIG_FILE, text, { mode: 0o600 });
  chmodSync(MCP_CONFIG_FILE, 0o600);
}

function parseServer(name: string, entry: unknown): McpServerConfig {
  if (!NAME.test(name)) throw new Error("the name must start with a letter or digit, then letters, digits, - or _, up to 32 characters");
  if (!isRecord(entry)) throw new Error("the entry must be an object");
  // Without a type, an entry with a url is a web server, and anything else is a command.
  const type = entry.type ?? (typeof entry.url === "string" ? "http" : "stdio");

  if (type === "stdio") {
    if (typeof entry.command !== "string" || !entry.command.trim()) throw new Error('a stdio server needs a "command"');
    return { name, transport: "stdio", command: entry.command, args: stringList(entry.args, "args"), env: stringMap(entry.env, "env") };
  }
  if (type === "http") {
    if (typeof entry.url !== "string") throw new Error('an http server needs a "url"');
    let link: URL;
    try {
      link = new URL(entry.url);
    } catch {
      throw new Error('"url" is not a valid link');
    }
    if (link.protocol !== "http:" && link.protocol !== "https:") throw new Error('"url" must start with http:// or https://');
    return { name, transport: "http", url: entry.url, headers: stringMap(entry.headers, "headers") };
  }
  throw new Error(`type "${String(type)}" is not supported; use "stdio" or "http"`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringList(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) throw new Error(`"${field}" must be a list of strings`);
  return value as string[];
}

function stringMap(value: unknown, field: string): Record<string, string> {
  if (value === undefined) return {};
  if (!isRecord(value) || !Object.values(value).every((item) => typeof item === "string")) throw new Error(`"${field}" must map names to strings`);
  return value as Record<string, string>;
}
