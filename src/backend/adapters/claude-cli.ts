import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { AsyncQueue } from "./async-queue.js";
import { SignInSession } from "./sign-in-session.js";
import type {
  AgentEvent,
  AgentProvider,
  AuthState,
  ModelOption,
  RunOptions,
  SignInMethod,
  SignInProgress,
  SignInTarget,
  ThinkingLevel,
} from "./contract.js";

const TARGET_ID = "claude-subscription";
// Auth status changes rarely, and the dashboard polls often, so cache it briefly.
const STATUS_TTL_MS = 5_000;
// The model list changes rarely, and reading it starts the CLI, so cache it for longer.
const CATALOG_TTL_MS = 10 * 60_000;
const CATALOG_TIMEOUT_MS = 20_000;

// One model as the CLI lists it.
interface CliModel {
  value: string;
  displayName: string;
  supportsEffort?: boolean;
  supportedEffortLevels?: ThinkingLevel[];
}

// One reply on the CLI's control channel. A success carries the answer in `response`.
interface ControlReply {
  subtype: string;
  request_id: string;
  error?: string;
  response?: { models?: CliModel[] };
}

// The CLI's "default" entry is what it uses when no --model is given, so it maps to an empty id.
function toModelOption(model: CliModel): ModelOption {
  return {
    id: model.value === "default" ? "" : model.value,
    name: model.displayName,
    thinkingLevels: model.supportsEffort ? (model.supportedEffortLevels ?? []) : [],
  };
}

interface ClaudeAuthStatus {
  loggedIn: boolean;
  authMethod?: string;
  email?: string;
}

// Drops API keys so the CLI uses the subscription login.
// configDir (when set) becomes the CLI's config folder, so its chats and login are kept there.
function cliEnv(configDir?: string): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  if (configDir) env.CLAUDE_CONFIG_DIR = configDir;
  return env;
}

function toText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((block) => block?.type === "text")
      .map((block) => String(block.text))
      .join("\n");
  }
  return JSON.stringify(content);
}

// Maps one line of `claude -p --output-format stream-json` to app events.
// Non-JSON lines and events the app doesn't use return nothing.
function parseStreamLine(line: string): AgentEvent[] {
  let data: any;
  try {
    data = JSON.parse(line);
  } catch {
    return [];
  }

  switch (data.type) {
    case "stream_event": {
      const delta = data.event?.delta;
      if (data.event?.type === "content_block_delta" && delta?.type === "text_delta") {
        return [{ type: "text", text: String(delta.text) }];
      }
      return [];
    }
    case "assistant":
      return (data.message?.content ?? [])
        .filter((block: any) => block.type === "tool_use")
        .map((block: any) => ({ type: "tool_call", id: block.id, name: block.name, input: block.input }));
    case "user":
      return (data.message?.content ?? [])
        .filter((block: any) => block.type === "tool_result")
        .map((block: any) => ({
          type: "tool_result",
          id: block.tool_use_id,
          output: toText(block.content),
          isError: Boolean(block.is_error),
        }));
    case "result":
      return data.is_error
        ? [{ type: "error", message: String(data.result ?? "Claude CLI reported an error") }]
        : [{ type: "done", sessionId: data.session_id }];
    default:
      return [];
  }
}

// The MCP config that points the CLI at the app's tool endpoint. The server name "mip" makes tools "mcp__mip__<name>".
function mcpConfig(mcp: { url: string; token: string }): string {
  return JSON.stringify({ mcpServers: { mip: { type: "http", url: mcp.url, headers: { Authorization: `Bearer ${mcp.token}` } } } });
}

export interface ClaudeCliOptions {
  // Path or name of the claude binary. Defaults to CLAUDE_BIN or "claude" on PATH.
  bin?: string;
  // Folder for the CLI's config, chats, and login. Unset uses the CLI default (~/.claude).
  configDir?: string;
  defaultTimeoutMs?: number;
}

export class ClaudeCliProvider implements AgentProvider {
  readonly id = "claude-cli";
  readonly name = "Claude (official CLI)";
  readonly capabilities = { streaming: true, tools: true, mcp: true, sessions: true, signIn: true };

  private readonly bin: string;
  private readonly configDir?: string;
  private readonly defaultTimeoutMs: number;
  private statusCache?: { at: number; value: ClaudeAuthStatus };
  private catalogCache?: { at: number; models: ModelOption[] };
  private signInState?: { session: SignInSession; child: ChildProcessWithoutNullStreams };

  constructor(options: ClaudeCliOptions = {}) {
    this.bin = options.bin ?? process.env.CLAUDE_BIN ?? "claude";
    this.configDir = options.configDir;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 300_000;
  }

  async models(): Promise<ModelOption[]> {
    if (!this.catalogCache || Date.now() - this.catalogCache.at > CATALOG_TTL_MS) {
      this.catalogCache = { at: Date.now(), models: await this.listModels() };
    }
    return this.catalogCache.models;
  }

  // Asks the CLI for its model list over its stream-json control channel, the same channel the Agent SDK uses.
  // No prompt is sent, so no model is called.
  private async listModels(): Promise<ModelOption[]> {
    const child = spawn(this.bin, ["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose"], {
      env: cliEnv(this.configDir),
      stdio: ["pipe", "pipe", "pipe"],
    });
    // The child may exit while we write to it. The failure below reports that, so the write error is ignored.
    child.stdin.on("error", () => {});

    const replies = new Map<string, (reply: ControlReply) => void>();
    createInterface({ input: child.stdout }).on("line", (line) => {
      let message: any;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }
      if (message.type === "control_response") replies.get(message.response?.request_id)?.(message.response);
    });

    const ask = (subtype: string) =>
      new Promise<ControlReply>((resolve) => {
        const requestId = randomUUID();
        replies.set(requestId, resolve);
        child.stdin.write(JSON.stringify({ type: "control_request", request_id: requestId, request: { subtype } }) + "\n");
      });
    const failed = new Promise<never>((_, reject) => {
      child.on("error", (err) => reject(new Error(`failed to start "${this.bin}": ${err.message}`)));
      child.on("close", (code) => reject(new Error(`claude CLI exited with code ${code} before listing its models`)));
    });
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("claude CLI did not list its models in time")), CATALOG_TIMEOUT_MS);
    });

    try {
      await Promise.race([ask("initialize"), failed, timeout]);
      const list = await Promise.race([ask("list_models"), failed, timeout]);
      if (list.subtype !== "success") throw new Error(list.error ?? "claude CLI could not list its models");
      return (list.response?.models ?? []).map(toModelOption);
    } finally {
      clearTimeout(timer);
      child.kill("SIGTERM");
    }
  }

  async targets(): Promise<SignInTarget[]> {
    const status = await this.authStatus();
    const auth: AuthState = { loggedIn: status.loggedIn };
    if (status.loggedIn) auth.method = status.email ? `Subscription (${status.email})` : "Subscription";
    return [{ id: TARGET_ID, name: "Claude subscription", methods: ["cli"], auth }];
  }

  startSignIn(targetId: string, method: SignInMethod): void {
    this.assertTarget(targetId, method);
    if (this.signInState?.session.progress().running) return;

    const session = new SignInSession();
    const child = spawn(this.bin, ["auth", "login", "--claudeai"], { env: cliEnv(this.configDir), stdio: ["pipe", "pipe", "pipe"] });
    this.signInState = { session, child };

    const readOutput = (chunk: Buffer) => chunk.toString().split("\n").forEach((line) => session.log(line));
    let stderr = "";
    child.stdout.on("data", readOutput);
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      readOutput(chunk);
    });
    child.on("error", (err) => {
      session.finish(`failed to start "${this.bin}": ${err.message}`);
    });
    child.on("close", (code) => {
      this.statusCache = undefined;
      session.finish(code === 0 ? undefined : stderr.trim() || `claude auth login exited with code ${code}`);
    });
  }

  signInProgress(targetId: string): SignInProgress {
    this.assertTarget(targetId);
    return this.signInState?.session.progress() ?? { running: false, output: [] };
  }

  answerSignIn(targetId: string, answer: string): void {
    this.assertTarget(targetId);
    if (!this.signInState) return;
    // The CLI reads a pasted code from stdin when it asks for one.
    this.signInState.child.stdin.write(`${answer}\n`);
  }

  async signOut(targetId: string): Promise<void> {
    this.assertTarget(targetId);
    await this.runCli(["auth", "logout"]);
    this.statusCache = undefined;
  }

  async *run(options: RunOptions): AsyncGenerator<AgentEvent> {
    // A new run gets a known session id, so the caller can resume it later.
    const sessionId = options.sessionId ?? randomUUID();
    const args = ["-p", options.prompt, "--output-format", "stream-json", "--verbose", "--include-partial-messages"];
    // The app's tools replace Claude Code's built-in ones for this run. Only the app's tools are allowed.
    if (options.toolServer && options.tools?.length) {
      args.push(
        "--mcp-config",
        mcpConfig(options.toolServer),
        "--strict-mcp-config",
        "--tools",
        "",
        "--allowedTools",
        ...options.tools.map((tool) => `mcp__mip__${tool.name}`),
      );
    }
    if (options.model) args.push("--model", options.model);
    if (options.thinking) args.push("--effort", options.thinking);
    // Replaces Claude Code's default prompt. Snapshot off re-renders it on every run, so resumed chats pick up changes.
    if (options.systemPrompt) args.push("--system-prompt", options.systemPrompt, "--system-prompt-snapshot", "off");
    args.push(options.sessionId ? "--resume" : "--session-id", sessionId);

    const queue = new AsyncQueue<AgentEvent>();
    const child = spawn(this.bin, args, { env: cliEnv(this.configDir), stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => child.kill("SIGTERM"), this.defaultTimeoutMs);
    const onAbort = () => child.kill("SIGTERM");
    options.signal?.addEventListener("abort", onAbort);

    let sawTerminal = false;
    let stderr = "";
    createInterface({ input: child.stdout }).on("line", (line) => {
      for (const event of parseStreamLine(line)) {
        if (event.type === "done" || event.type === "error") sawTerminal = true;
        queue.push(event);
      }
    });
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", (err) => {
      queue.push({ type: "error", message: `failed to start "${this.bin}": ${err.message}` });
      queue.close();
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      if (!sawTerminal) {
        queue.push({ type: "error", message: stderr.trim() || `claude CLI exited with code ${code}` });
      }
      queue.close();
    });

    try {
      for await (const event of queue) {
        yield event;
      }
    } finally {
      // Stops the child if the caller stops reading early.
      child.kill("SIGTERM");
    }
  }

  private async authStatus(): Promise<ClaudeAuthStatus> {
    if (this.statusCache && Date.now() - this.statusCache.at < STATUS_TTL_MS) {
      return this.statusCache.value;
    }
    const { stdout } = await this.runCli(["auth", "status", "--json"]);
    const value = JSON.parse(stdout) as ClaudeAuthStatus;
    this.statusCache = { at: Date.now(), value };
    return value;
  }

  private runCli(args: string[]): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.bin, args, { env: cliEnv(this.configDir), stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
      child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
      child.on("error", (err) => reject(new Error(`failed to start "${this.bin}": ${err.message}`)));
      child.on("close", (code) => {
        if (code === 0 || stdout.trim()) resolve({ stdout, stderr });
        else reject(new Error(stderr.trim() || `claude CLI exited with code ${code}`));
      });
    });
  }

  private assertTarget(targetId: string, method?: SignInMethod): void {
    if (targetId !== TARGET_ID) throw new Error(`unknown sign-in target "${targetId}" for ${this.id}`);
    if (method && method !== "cli") throw new Error(`${this.id} only supports the "cli" sign-in method`);
  }
}
