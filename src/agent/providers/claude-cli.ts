import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { AsyncQueue } from "../async-queue.js";
import { SignInSession } from "../sign-in-session.js";
import type {
  AgentEvent,
  AgentProvider,
  AuthState,
  RunOptions,
  SignInMethod,
  SignInProgress,
  SignInTarget,
} from "../types.js";

const TARGET_ID = "claude-subscription";
// Auth status changes rarely, and the dashboard polls often, so cache it briefly.
const STATUS_TTL_MS = 5_000;

interface ClaudeAuthStatus {
  loggedIn: boolean;
  authMethod?: string;
  email?: string;
}

// Drops API keys so the CLI uses the subscription login.
function cliEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
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
export function parseStreamLine(line: string): AgentEvent[] {
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

export interface ClaudeCliOptions {
  // Path or name of the claude binary. Defaults to CLAUDE_BIN or "claude" on PATH.
  bin?: string;
  defaultTimeoutMs?: number;
}

export class ClaudeCliProvider implements AgentProvider {
  readonly id = "claude-cli";
  readonly name = "Claude (official CLI)";
  readonly capabilities = { streaming: true, tools: true, mcp: true, sessions: true, signIn: true };

  private readonly bin: string;
  private readonly defaultTimeoutMs: number;
  private statusCache?: { at: number; value: ClaudeAuthStatus };
  private signInState?: { session: SignInSession; child: ChildProcessWithoutNullStreams };

  constructor(options: ClaudeCliOptions = {}) {
    this.bin = options.bin ?? process.env.CLAUDE_BIN ?? "claude";
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 300_000;
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
    const child = spawn(this.bin, ["auth", "login", "--claudeai"], { env: cliEnv(), stdio: ["pipe", "pipe", "pipe"] });
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
    if (options.model) args.push("--model", options.model);
    if (options.systemPrompt) args.push("--append-system-prompt", options.systemPrompt);
    args.push(options.sessionId ? "--resume" : "--session-id", sessionId);

    const queue = new AsyncQueue<AgentEvent>();
    const child = spawn(this.bin, args, { env: cliEnv(), stdio: ["ignore", "pipe", "pipe"] });
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
      const child = spawn(this.bin, args, { env: cliEnv(), stdio: ["ignore", "pipe", "pipe"] });
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
