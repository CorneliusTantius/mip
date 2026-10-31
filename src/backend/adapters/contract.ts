// The contract every adapter implements. The app talks to providers only through these types.

// What the app renders or acts on, whatever the provider's own output looks like.
export type AgentEvent =
  | { type: "text"; text: string }
  | { type: "tool_call"; id: string; name: string; input: unknown }
  | { type: "tool_result"; id: string; output: string; isError: boolean }
  | { type: "error"; message: string }
  | { type: "done"; sessionId?: string };

// The result of running a tool. The text goes back to the model.
export interface ToolResult {
  text: string;
  isError: boolean;
}

// What a tool may use while it runs: the agent's workspace folder, and a signal that fires when the run is stopped.
export interface ToolContext {
  workspace: string;
  // The chat the run belongs to. Skill tools use it to check which skills the chat has enabled.
  chatId?: string;
  signal?: AbortSignal;
}

// A tool the app offers. Each adapter exposes it in its own way.
export interface ToolSpec {
  name: string;
  description: string;
  // JSON Schema for the input.
  inputSchema: Record<string, unknown>;
  run(input: any, context: ToolContext): Promise<ToolResult>;
}

// How hard the model thinks before it answers. Each provider lists the levels it accepts.
export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

// A model the provider lists. The id is what the provider takes: Pi uses "provider/model".
export interface ModelOption {
  // Empty id means the provider's default model, which the provider names in `name`.
  id: string;
  name: string;
  // The thinking levels this model accepts, as the provider reports them. Empty when it takes none.
  thinkingLevels: ThinkingLevel[];
}

export interface RunOptions {
  prompt: string;
  // Replaces the provider's default system prompt. Omit to keep the provider's own.
  systemPrompt?: string;
  // Provider-specific model id. Omit to use the provider's default.
  model?: string;
  // Omit to use the provider's default thinking level.
  thinking?: ThinkingLevel;
  // Session id returned by an earlier run. Each adapter maps it to its own resume mechanism.
  sessionId?: string;
  // Tools this run may use.
  tools?: ToolSpec[];
  // The folder the tools work in.
  workspace?: string;
  // The chat the run belongs to. Passed on to the tools.
  chatId?: string;
  // Where the CLI reaches the app's tools, and the token that opens this run's workspace there.
  toolServer?: { url: string; token: string };
  signal?: AbortSignal;
}

// Lets the UI and router check support instead of assuming it.
export interface ProviderCapabilities {
  streaming: boolean;
  tools: boolean;
  mcp: boolean;
  sessions: boolean;
  signIn: boolean;
}

export interface AuthState {
  loggedIn: boolean;
  // Human-readable, e.g. "Subscription", "API key".
  method?: string;
}

// How a user signs in to a target. "subscription" uses a plan login, "api_key" uses a key, "cli" runs the provider's own CLI login.
export type SignInMethod = "subscription" | "api_key" | "cli";

// One thing the user can sign in to. A provider with several accounts (such as Pi) lists one target per account.
export interface SignInTarget {
  id: string;
  name: string;
  methods: SignInMethod[];
  auth: AuthState;
}

// Input the running sign-in is waiting for, such as a pasted code or an API key.
export interface SignInPrompt {
  message: string;
  // "secret" values are masked in the UI.
  type: "text" | "secret" | "manual_code";
  placeholder?: string;
}

export interface SignInProgress {
  running: boolean;
  output: string[];
  prompt?: SignInPrompt;
  error?: string;
}

export interface AgentProvider {
  readonly id: string;
  readonly name: string;
  readonly capabilities: ProviderCapabilities;

  // The models the provider lists right now, each with its own thinking levels. Empty when nothing is available.
  models(): Promise<ModelOption[]>;
  targets(): Promise<SignInTarget[]>;
  // Sign-in is optional per provider. Only providers with `capabilities.signIn` implement these.
  startSignIn?(targetId: string, method: SignInMethod): void;
  signInProgress?(targetId: string): SignInProgress;
  answerSignIn?(targetId: string, answer: string): void;
  signOut?(targetId: string): Promise<void>;

  run(options: RunOptions): AsyncIterable<AgentEvent>;
}
