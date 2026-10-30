// Provider-neutral contract. The dashboard, the CLI and the agent loop talk only to these types.

// What the app renders or acts on, whatever the provider's own output looks like.
export type AgentEvent =
  | { type: "text"; text: string }
  | { type: "tool_call"; id: string; name: string; input: unknown }
  | { type: "tool_result"; id: string; output: string; isError: boolean }
  | { type: "error"; message: string }
  | { type: "done"; sessionId?: string };

export interface RunOptions {
  prompt: string;
  systemPrompt?: string;
  // Provider-specific model id. Pi uses "provider/model"; omit to use the provider's default.
  model?: string;
  // Session id returned by an earlier run. Each adapter maps it to its own resume mechanism.
  sessionId?: string;
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

  targets(): Promise<SignInTarget[]>;
  // Sign-in is optional per provider. Only providers with `capabilities.signIn` implement these.
  startSignIn?(targetId: string, method: SignInMethod): void;
  signInProgress?(targetId: string): SignInProgress;
  answerSignIn?(targetId: string, answer: string): void;
  signOut?(targetId: string): Promise<void>;

  run(options: RunOptions): AsyncIterable<AgentEvent>;
}
