import {
  type CallToolResult,
  McpClient,
  type McpTransport,
  StdioTransport,
  StreamableHttpTransport,
  type Tool,
  toLlmContent,
} from "@earendil-works/pi-mcp";
import type { ToolResult, ToolSpec } from "../../adapters/contract.js";
import { MCP_CONFIG_FILE } from "../../storage/paths.js";
import { errorMessage } from "../errors.js";
import { type McpConfigProblem, type McpServerConfig, readMcpConfig } from "./config.js";

// The MCP servers mip is connected to. Each server's tools become ToolSpecs, and the agents find them with tool_search, the same way as
// any deferred tool. Servers connect on their own, so one that is down does not hold up the others.

// How long a server has to start and list its tools, and how long one call may take.
const CONNECT_TIMEOUT_MS = 30_000;
const CALL_TIMEOUT_MS = 120_000;
// Providers take at most 64 characters of letters, digits, dashes, and underscores in a tool name.
const MAX_TOOL_NAME = 64;

export interface McpToolInfo {
  // The name the model calls the tool by.
  name: string;
  // The name the server gives it.
  remoteName: string;
  description: string;
}

export interface McpServerStatus {
  name: string;
  transport: "stdio" | "http";
  status: "connecting" | "connected" | "error";
  error: string | null;
  tools: McpToolInfo[];
}

interface Connection {
  config: McpServerConfig;
  status: McpServerStatus["status"];
  error: string | null;
  client?: McpClient;
  tools: { info: McpToolInfo; spec: ToolSpec }[];
  // Set when a newer start or a close replaces this connection, so a late connect is closed instead of kept.
  removed: boolean;
}

const state: { connections: Connection[]; problems: McpConfigProblem[] } = { connections: [], problems: [] };

// Connects to every server in the config file. Problems with the file itself, and with tool names, are kept for the status.
export async function startMcpServers(): Promise<void> {
  await closeMcpServers();
  const { servers, problems } = readMcpConfig();
  const connections: Connection[] = servers.map((config) => ({ config, status: "connecting", error: null, tools: [], removed: false }));
  state.connections = connections;
  state.problems = problems;
  await Promise.all(connections.map(connect));
}

// Closes every connection. A server that is still starting is closed when it finishes.
export async function closeMcpServers(): Promise<void> {
  const old = state.connections;
  state.connections = [];
  state.problems = [];
  for (const connection of old) connection.removed = true;
  await Promise.all(old.map((connection) => connection.client?.close().catch(() => undefined)));
}

// The tools of the servers that are connected, ready to run. Each one is a ToolSpec with its own name.
export function mcpTools(): ToolSpec[] {
  return state.connections.flatMap((connection) => (connection.status === "connected" ? connection.tools.map((tool) => tool.spec) : []));
}

// What the status API shows: each server's state and tools, and any problems. Tokens and environment values are never included.
export function mcpStatus(): { configFile: string; servers: McpServerStatus[]; problems: McpConfigProblem[] } {
  return {
    configFile: MCP_CONFIG_FILE,
    servers: state.connections.map((connection) => ({
      name: connection.config.name,
      transport: connection.config.transport,
      status: connection.status,
      error: connection.error,
      tools: connection.tools.map((tool) => tool.info),
    })),
    problems: state.problems,
  };
}

// The name a server's tool has in mip: "mcp_<server>_<tool>", with characters providers do not take replaced, and cut to 64 characters.
export function mcpToolName(server: string, tool: string): string {
  return `mcp_${server}_${tool}`.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, MAX_TOOL_NAME);
}

async function connect(connection: Connection): Promise<void> {
  const client = new McpClient({ name: "mip", version: "0.1.0", requestTimeoutMs: CALL_TIMEOUT_MS });
  connection.client = client;
  try {
    await withTimeout(client.connect(openTransport(connection.config)), CONNECT_TIMEOUT_MS, "start");
    const listed = await withTimeout(client.listTools(), CONNECT_TIMEOUT_MS, "list its tools");
    if (connection.removed) {
      await client.close().catch(() => undefined);
      return;
    }
    connection.tools = toolsOf(connection, client, listed);
    connection.status = "connected";
    connection.error = null;
    client.onClose(() => {
      if (connection.client !== client || connection.removed) return;
      connection.status = "error";
      connection.error = "the connection closed";
      connection.tools = [];
    });
  } catch (err) {
    if (connection.removed) return;
    connection.status = "error";
    connection.error = failureText(err);
    await client.close().catch(() => undefined);
  }
}

// The message of a failed start or call. A network error says only "fetch failed" on its own, so its cause is kept too.
function failureText(err: unknown): string {
  const message = errorMessage(err);
  const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : undefined;
  return cause && !message.includes(cause) ? `${message}: ${cause}` : message;
}

// The tools of one server. A tool whose name another server's tool already has is skipped and reported, so no name is ambiguous.
function toolsOf(connection: Connection, client: McpClient, listed: Tool[]): Connection["tools"] {
  const taken = new Set(
    state.connections.filter((other) => other !== connection && !other.removed).flatMap((other) => other.tools.map((tool) => tool.spec.name)),
  );
  const tools: Connection["tools"] = [];
  for (const tool of listed) {
    const name = mcpToolName(connection.config.name, tool.name);
    if (taken.has(name)) {
      state.problems.push({ server: connection.config.name, error: `tool "${tool.name}" would be named ${name}, which another tool already uses. It is skipped.` });
      continue;
    }
    taken.add(name);
    tools.push({ info: { name, remoteName: tool.name, description: describe(tool) }, spec: toolSpec(connection.config.name, client, tool, name) });
  }
  return tools;
}

function toolSpec(server: string, client: McpClient, tool: Tool, name: string): ToolSpec {
  const schema = tool.inputSchema;
  return {
    name,
    description: `${describe(tool)} (MCP server ${server}, tool ${tool.name})`,
    guide: describe(tool),
    // Providers require an object schema, and some reject one without "properties".
    inputSchema: { ...schema, type: "object", properties: schema.properties ?? {} },
    async run(input, context): Promise<ToolResult> {
      try {
        const result = await client.callTool(tool.name, input ?? {}, { signal: context.signal, timeoutMs: CALL_TIMEOUT_MS });
        return { text: resultText(result), isError: result.isError === true };
      } catch (err) {
        return { text: failureText(err), isError: true };
      }
    },
  };
}

function describe(tool: Tool): string {
  return tool.description?.trim() || tool.title || tool.name;
}

// The text a model reads from a call: text parts as they are, and a short note for anything else.
function resultText(result: CallToolResult): string {
  const text = toLlmContent(result)
    .map((part) => (part.type === "text" ? part.text : `[${part.mimeType} image]`))
    .join("\n");
  return text || "(no output)";
}

function openTransport(config: McpServerConfig): McpTransport {
  return config.transport === "stdio"
    ? new StdioTransport({ command: config.command, args: config.args, env: config.env })
    : new StreamableHttpTransport({ url: config.url, headers: config.headers });
}

function withTimeout<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms / 1000} s while trying to ${what}`)), ms);
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}
