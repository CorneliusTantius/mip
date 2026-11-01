// The JSON shapes the server sends. They mirror the server's types in src/backend. Keep them in step with it.

export interface ModelOption {
  // An empty id is the provider's default model.
  id: string;
  name: string;
  thinkingLevels: string[];
}

export interface SignInPrompt {
  message: string;
  type?: string;
  placeholder?: string;
}

// The sign-in attempt for one target: its output, and any question it is waiting on.
export interface SignInProgress {
  running: boolean;
  output: string[];
  error?: string;
  prompt?: SignInPrompt;
}

export interface SignInTarget {
  id: string;
  name: string;
  methods: string[];
  auth: { loggedIn: boolean; method?: string };
  progress: SignInProgress;
}

export interface ProviderInfo {
  id: string;
  name: string;
  capabilities: Record<string, boolean>;
  models: ModelOption[];
  targets: SignInTarget[];
  error?: string;
}

export interface Persona {
  id: string;
  name: string;
  systemPrompt: string;
  isDefault: boolean;
}

// An agent. Its model and thinking level apply to the next message.
export interface Agent {
  id: string;
  providerId: string;
  providerSessionId: string | null;
  personaId: string;
  model: string | null;
  thinking: string | null;
  title: string;
  // Whether bots may send tasks to this agent.
  openToBots: boolean;
  updatedAt: number;
}

// A question an agent asked. Its controls show under the reply it ends. The question is the reply's question, and the answer is the next message.
export type Ask = { question: string } & (
  | { kind: "choice" | "multi"; options: string[] }
  | { kind: "text"; placeholder: string }
  | { kind: "slider"; min: number; max: number; step: number; value: number }
);

// A tool in the registry, and which kinds of run may use it.
export interface ToolInfo {
  name: string;
  description: string;
  // How and when to use the tool.
  guide: string;
  inputSchema: { properties?: Record<string, { type?: string; description?: string }>; required?: string[] };
  // basic: always offered. deferred: found with tool_search. search: the two tools that find and run deferred tools.
  load: "basic" | "deferred" | "search";
  agent: boolean;
  bot: boolean;
}

// One tool an MCP server offers. The name is what the model calls it by, and the remote name is what the server calls it.
export interface McpTool {
  name: string;
  remoteName: string;
  description: string;
}

// One MCP server from mcp.json. An error says why it is not connected.
export interface McpServer {
  name: string;
  transport: "stdio" | "http";
  status: "connecting" | "connected" | "error";
  error: string | null;
  tools: McpTool[];
}

// The MCP servers as the backend sees them, with entries in mcp.json that could not be read.
export interface McpStatus {
  configFile: string;
  servers: McpServer[];
  problems: { server: string; error: string }[];
}

// One tool call in a reply. The id is only known while the reply streams. The input is JSON text.
export interface ToolCall {
  id?: string;
  name: string;
  input: string;
  output: string | null;
  isError: boolean;
}

export interface AgentMessage {
  role: "user" | "assistant";
  text: string;
  tools: string[];
  calls: ToolCall[];
  error?: string | null;
  // The question the reply ends with, if the agent asked one.
  ask?: Ask | null;
}

export interface AgentDetail {
  agent: Agent;
  messages: AgentMessage[];
  // The run still going in this agent, if there is one.
  activeRunId?: string;
}

// One event of a run, as the server saves it. The agent reads the kinds it shows and ignores the rest.
export interface RunEvent {
  type: string;
  text?: string;
  name?: string;
  message?: string;
  id?: string;
  input?: unknown;
  output?: string;
  isError?: boolean;
}

// A bot's color: one of the Nord accents. The same names are the glow colors and the bot-* classes in styles.css.
export type BotColor = "frost" | "teal" | "blue" | "violet" | "red" | "orange" | "yellow" | "green";

export interface Bot {
  id: string;
  name: string;
  persona: string;
  providerId: string;
  model: string | null;
  thinking: string | null;
  color: BotColor;
}

// A room of bots. Its messages are its own, and its members are the bots that answer in it.
export interface Room {
  id: string;
  name: string;
  botIds: string[];
}

export interface RoomMessage {
  id: number;
  // An "agent" message is the reply of an agent a bot sent a task to.
  kind: "user" | "bot" | "agent" | "system";
  // The bot that wrote the message, if a bot did.
  botId: string | null;
  authorName: string;
  text: string;
  // The tool calls a bot's reply made. Empty for people's messages and for replies saved before calls were recorded.
  calls: ToolCall[];
}

export interface RepoCopy {
  agentId: string;
  title: string;
}

export interface Repo {
  id: string;
  name: string;
  url: string;
  status: "cloning" | "ready" | "error";
  error: string | null;
  // The checked-out branch. Null while cloning, after a failed clone, or when the branch is unknown.
  branch: string | null;
  copies: RepoCopy[];
}

export interface PullResult {
  id: string;
  name: string;
  ok: boolean;
  message: string;
}

// A row in the memory list. Search results also carry a snippet.
export interface NoteItem {
  id: string;
  title: string;
  snippet?: string;
}

// One note with what it links to, what links to it, and its tags.
export interface NoteDetail {
  title: string;
  body: string;
  links: string[];
  backlinks: string[];
  tags: string[];
}

// One sync run: what it pulled and pushed, and the notes for records that both sides changed.
export interface SyncRun {
  at: number;
  ok: boolean;
  message: string;
  pulled: number;
  pushed: number;
  notes: string[];
}

// The GitHub sync: the accounts the GitHub CLI is signed in to, the one sync uses (null when there is none), its repo, and the last run.
export interface SyncStatus {
  accounts: string[];
  login: string | null;
  repo: string | null;
  running: boolean;
  error: string | null;
  lastSync: SyncRun | null;
}

// An installed skill. Its files are the text files it holds besides SKILL.md.
export interface SkillSummary {
  name: string;
  description: string;
  files: string[];
}

// One skill with its instructions (the SKILL.md body).
export interface SkillDetail extends SkillSummary {
  body: string;
}

// A skill folder in the registry that could not be read.
export interface SkillProblem {
  folder: string;
  error: string;
}

// An import waiting for confirmation. Nothing is installed until it is confirmed.
export interface SkillImport {
  id: string;
  name: string;
  description: string;
  files: string[];
  source: string;
  skillMd: string;
  // The SKILL.md this import would replace, when a skill with the same name is installed.
  replaces: string | null;
}
