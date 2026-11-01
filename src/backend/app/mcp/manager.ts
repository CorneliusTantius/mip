import {
  type CallToolResult,
  McpClient,
  type McpTransport,
  StdioTransport,
  StreamableHttpTransport,
  type Tool,
  toLlmContent,
} from "@earendil-works/pi-mcp";
import {
  adaptOAuthProvider,
  authorizeMcp,
  McpOAuthAuthorizationRequiredError,
  McpOAuthProvider,
  type McpOAuthState,
} from "@earendil-works/pi-mcp/oauth";
import type { ToolResult, ToolSpec } from "../../adapters/contract.js";
import { HOST, PORT } from "../config.js";
import { MCP_CONFIG_FILE } from "../../storage/paths.js";
import { AppError, errorMessage } from "../errors.js";
import { type McpConfigProblem, type McpServerConfig, editMcpFile, readMcpConfig } from "./config.js";

// Where a sign-in comes back to: this app, on the path that finishes it (see http/mcp-oauth.ts).
export const OAUTH_CALLBACK_PATH = "/api/mcp/oauth/callback";
const OAUTH_REDIRECT_URL = `http://${HOST}:${PORT}${OAUTH_CALLBACK_PATH}`;

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
  // Whether the app offers the tool to agents and bots. The server's allowedTools list decides, so a tool left out is listed but not offered.
  enabled: boolean;
}

export interface McpServerStatus {
  name: string;
  transport: "stdio" | "http";
  // "sign-in": the server signs in with OAuth and is waiting for the user to do so, through signInUrl.
  status: "connecting" | "connected" | "error" | "sign-in";
  error: string | null;
  // Whether the server signs in with OAuth. The link to sign in is signInUrl, while the server waits for it.
  oauth: boolean;
  signInUrl: string | null;
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
  // The OAuth provider of an OAuth server, made on the first connect and kept for its later connects.
  oauth?: McpOAuthProvider;
  // The sign-in link the server gave, and the state it carries, while the server waits for the user.
  signIn: { url: string; state: string } | null;
}

const state: { connections: Connection[]; problems: McpConfigProblem[] } = { connections: [], problems: [] };

// Connects to every server in the config file. Problems with the file itself, and with tool names, are kept for the status.
export async function startMcpServers(): Promise<void> {
  await closeMcpServers();
  const { servers, problems } = readMcpConfig();
  const connections: Connection[] = servers.map((config) => ({ config, status: "connecting", error: null, tools: [], removed: false, signIn: null }));
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

// The offered tools of the servers that are connected, ready to run. Each one is a ToolSpec with its own name.
export function mcpTools(): ToolSpec[] {
  return state.connections.flatMap((connection) =>
    connection.status === "connected" ? connection.tools.filter((tool) => tool.info.enabled).map((tool) => tool.spec) : [],
  );
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
      oauth: connection.config.transport === "http" && connection.config.oauth !== undefined,
      signInUrl: connection.signIn?.url ?? null,
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
  connection.signIn = null;
  try {
    await withTimeout(client.connect(openTransport(connection)), CONNECT_TIMEOUT_MS, "start");
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
    // A server that needs the user to sign in is not broken. The link is kept, and the card shows it.
    if (err instanceof McpOAuthAuthorizationRequiredError) {
      connection.status = "sign-in";
      connection.error = null;
    } else {
      connection.status = "error";
      connection.error = failureText(err);
    }
    await client.close().catch(() => undefined);
  }
}

// Starts the sign-in of an OAuth server again, for a new link. The server connects once the user has signed in.
export async function signInServer(name: string): Promise<void> {
  const connection = state.connections.find((candidate) => candidate.config.name === name);
  if (!connection) throw new AppError(404, `no MCP server called "${name}"`);
  if (connection.config.transport !== "http" || !connection.config.oauth) throw new AppError(400, `"${name}" does not sign in with OAuth`);
  await connection.client?.close().catch(() => undefined);
  connection.status = "connecting";
  connection.error = null;
  await connect(connection);
}

// Finishes a sign-in. The authorization server sent the user back with a code for the state of a server waiting for sign-in. The code
// becomes tokens, which are saved, and the server connects again. Returns the server's name.
export async function completeSignIn(callbackState: string, code: string, iss?: string): Promise<string> {
  const connection = state.connections.find((candidate) => candidate.status === "sign-in" && candidate.signIn?.state === callbackState);
  if (!connection?.oauth || connection.config.transport !== "http") {
    throw new AppError(400, "This sign-in is no longer waiting. Start it again from the MCP card.");
  }
  const { name, url } = connection.config;
  try {
    await authorizeMcp(connection.oauth, { serverUrl: url, authorizationCode: code, iss });
  } catch (err) {
    connection.status = "error";
    connection.error = failureText(err);
    connection.signIn = null;
    throw new AppError(502, `The sign-in did not finish: ${failureText(err)}`);
  }
  connection.status = "connecting";
  connection.error = null;
  void connect(connection);
  return name;
}

// The OAuth provider of an http server with OAuth. Its sign-in state is saved in mcp.json, so tokens survive a restart and reach the
// other machine through sync. The link the server gives back is kept on the connection, for the card to show. The client the config gives
// is used as it is. Without one, the server is asked to register mip.
function oauthOf(connection: Connection, config: Extract<McpServerConfig, { transport: "http" }>): McpOAuthProvider {
  if (connection.oauth) return connection.oauth;
  let saved: McpOAuthState | undefined = config.oauth;
  connection.oauth = new McpOAuthProvider({
    serverUrl: config.url,
    redirectUrl: OAUTH_REDIRECT_URL,
    clientMetadata: { client_name: "mip" },
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    store: {
      load: () => saved,
      save: (next) => {
        saved = next;
        saveSignIn(config.name, next);
      },
    },
    onRedirect: (url) => {
      connection.signIn = { url: url.toString(), state: url.searchParams.get("state") ?? "" };
    },
  });
  return connection.oauth;
}

// Writes an OAuth server's sign-in state into its entry in mcp.json. The entry is left alone when it was removed meanwhile.
function saveSignIn(name: string, oauth: McpOAuthState): void {
  editMcpFile((servers) => {
    const entry = servers[name];
    if (typeof entry === "object" && entry !== null) servers[name] = { ...entry, oauth };
  });
}

// The message of a failed start or call. A network error says only "fetch failed" on its own, so its cause is kept too.
function failureText(err: unknown): string {
  const message = errorMessage(err);
  const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : undefined;
  return cause && !message.includes(cause) ? `${message}: ${cause}` : message;
}

// The tools of one server. A tool the server's allowedTools list leaves out is listed as not enabled, and no run is offered it. A tool that
// is enabled, and whose name an enabled tool of another server already has, is skipped and reported, so no name is ambiguous.
function toolsOf(connection: Connection, client: McpClient, listed: Tool[]): Connection["tools"] {
  const allowed = connection.config.allowedTools;
  const taken = new Set(
    state.connections
      .filter((other) => other !== connection && !other.removed)
      .flatMap((other) => other.tools.filter((tool) => tool.info.enabled).map((tool) => tool.spec.name)),
  );
  const tools: Connection["tools"] = [];
  for (const tool of listed) {
    const name = mcpToolName(connection.config.name, tool.name);
    const enabled = allowed === undefined || allowed.includes(tool.name);
    if (enabled) {
      if (taken.has(name)) {
        state.problems.push({ server: connection.config.name, error: `tool "${tool.name}" would be named ${name}, which another tool already uses. It is skipped.` });
        continue;
      }
      taken.add(name);
    }
    tools.push({ info: { name, remoteName: tool.name, description: describe(tool), enabled }, spec: toolSpec(connection.config.name, client, tool, name) });
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

function openTransport(connection: Connection): McpTransport {
  const { config } = connection;
  if (config.transport === "stdio") return new StdioTransport({ command: config.command, args: config.args, env: config.env });
  if (!config.oauth) return new StreamableHttpTransport({ url: config.url, headers: config.headers });
  return new StreamableHttpTransport({
    url: config.url,
    headers: config.headers,
    authProvider: adaptOAuthProvider(oauthOf(connection, config)),
  });
}

function withTimeout<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms / 1000} s while trying to ${what}`)), ms);
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}
