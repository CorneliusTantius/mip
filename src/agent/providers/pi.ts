import { join } from "node:path";
import {
  type AgentSessionEvent,
  createAgentSession,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { AsyncQueue } from "../async-queue.js";
import { SignInSession } from "../sign-in-session.js";
import type {
  AgentEvent,
  AgentProvider,
  RunOptions,
  SignInMethod,
  SignInProgress,
  SignInPrompt,
  SignInTarget,
} from "../types.js";

// Anthropic's subscription OAuth is a Claude Pro/Max token used inside a third-party tool.
// Reported terms restrict that, so Pi's Anthropic sign-in offers an API key only.
const SUBSCRIPTION_BLOCKED = new Set(["anthropic"]);

type Runtime = Awaited<ReturnType<typeof ModelRuntime.create>>;

// Loose shape of Pi's login prompts, so this file doesn't depend on pi-ai's exact types.
interface PiPrompt {
  type: string;
  message: string;
  placeholder?: string;
  options?: readonly { id: string; label: string }[];
}

interface PiNotice {
  type: string;
  message?: string;
  url?: string;
  instructions?: string;
  userCode?: string;
  verificationUri?: string;
}

function toSignInPrompt(prompt: PiPrompt): SignInPrompt {
  if (prompt.type === "select") {
    const choices = (prompt.options ?? []).map((option) => `${option.id}: ${option.label}`).join(", ");
    return { type: "text", message: `${prompt.message} (${choices})` };
  }
  const type = prompt.type === "secret" || prompt.type === "manual_code" ? prompt.type : "text";
  return { type, message: prompt.message, placeholder: prompt.placeholder };
}

function describeNotice(notice: PiNotice): string {
  switch (notice.type) {
    case "auth_url":
      return `Open this link to sign in: ${notice.url}${notice.instructions ? ` (${notice.instructions})` : ""}`;
    case "device_code":
      return `Enter code ${notice.userCode} at ${notice.verificationUri}`;
    default:
      return notice.message ?? "";
  }
}

function textOf(result: unknown): string {
  const content = (result as { content?: unknown })?.content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block?.type === "text")
    .map((block) => String(block.text))
    .join("\n");
}

// Maps Pi's session events to the app's events. Other events aren't shown yet.
function toAppEvent(event: AgentSessionEvent): AgentEvent | undefined {
  switch (event.type) {
    case "message_update":
      return event.assistantMessageEvent.type === "text_delta"
        ? { type: "text", text: event.assistantMessageEvent.delta }
        : undefined;
    case "tool_execution_start":
      return { type: "tool_call", id: event.toolCallId, name: event.toolName, input: event.args };
    case "tool_execution_end":
      return { type: "tool_result", id: event.toolCallId, output: textOf(event.result), isError: event.isError };
    default:
      return undefined;
  }
}

export interface PiProviderOptions {
  // Where Pi's session files go. Defaults to ./.mip/pi-sessions.
  sessionDir?: string;
}

export class PiProvider implements AgentProvider {
  readonly id = "pi";
  readonly name = "Pi";
  // Pi has its own tools, but none are enabled yet, so tools and mcp stay off until the tool registry exists.
  readonly capabilities = { streaming: true, tools: false, mcp: false, sessions: true, signIn: true };

  private readonly sessionDir: string;
  private runtimePromise?: Promise<Runtime>;
  private signIns = new Map<string, { session: SignInSession; controller: AbortController }>();

  constructor(options: PiProviderOptions = {}) {
    const dataDir = process.env.MIP_DATA_DIR ?? join(process.cwd(), ".mip");
    this.sessionDir = options.sessionDir ?? join(dataDir, "pi-sessions");
  }

  async targets(): Promise<SignInTarget[]> {
    const runtime = await this.runtime();
    const targets: SignInTarget[] = [];

    for (const provider of runtime.getProviders()) {
      const methods: SignInMethod[] = [];
      if (provider.auth.oauth && !SUBSCRIPTION_BLOCKED.has(provider.id)) methods.push("subscription");
      if (provider.auth.apiKey?.login) methods.push("api_key");
      if (methods.length === 0) continue;

      const check = await runtime.checkAuth(provider.id);
      targets.push({
        id: provider.id,
        name: provider.name,
        methods,
        auth: check
          ? { loggedIn: true, method: check.type === "oauth" ? "Subscription" : "API key" }
          : { loggedIn: false },
      });
    }
    return targets;
  }

  startSignIn(targetId: string, method: SignInMethod): void {
    if (method !== "subscription" && method !== "api_key") {
      throw new Error(`${this.id} does not support the "${method}" sign-in method`);
    }
    if (method === "subscription" && SUBSCRIPTION_BLOCKED.has(targetId)) {
      throw new Error(`${targetId} sign-in with a subscription is not offered here; use an API key`);
    }
    const running = this.signIns.get(targetId)?.session.progress().running;
    if (running) return;

    const session = new SignInSession();
    const controller = new AbortController();
    this.signIns.set(targetId, { session, controller });

    const loginType = method === "subscription" ? "oauth" : "api_key";
    this.runtime()
      .then((runtime) =>
        runtime.login(targetId, loginType, {
          signal: controller.signal,
          prompt: (prompt: PiPrompt) => session.ask(toSignInPrompt(prompt)),
          notify: (notice: PiNotice) => session.log(describeNotice(notice)),
        }),
      )
      .then(() => session.finish())
      .catch((err: unknown) => session.finish(err instanceof Error ? err.message : String(err)));
  }

  signInProgress(targetId: string): SignInProgress {
    return this.signIns.get(targetId)?.session.progress() ?? { running: false, output: [] };
  }

  answerSignIn(targetId: string, answer: string): void {
    this.signIns.get(targetId)?.session.answer(answer);
  }

  async signOut(targetId: string): Promise<void> {
    const runtime = await this.runtime();
    await runtime.logout(targetId);
  }

  async *run(options: RunOptions): AsyncGenerator<AgentEvent> {
    const queue = new AsyncQueue<AgentEvent>();
    const onAbort = () => queue.close();
    options.signal?.addEventListener("abort", onAbort);

    try {
      const runtime = await this.runtime();
      const model = await this.resolveModel(runtime, options.model);
      const cwd = process.cwd();
      const sessionManager = options.sessionId
        ? this.openSession(cwd, options.sessionId)
        : SessionManager.create(cwd, this.sessionDir);

      // Pi takes no system prompt option here, so options.systemPrompt is not applied yet.
      const { session } = await createAgentSession({
        cwd,
        modelRuntime: runtime,
        model,
        sessionManager,
        noTools: "all",
      });

      const unsubscribe = session.subscribe((event) => {
        const mapped = toAppEvent(event);
        if (mapped) queue.push(mapped);
      });
      const abortSession = () => void session.abort();
      options.signal?.addEventListener("abort", abortSession);

      session
        .prompt(options.prompt)
        .then(() => queue.push({ type: "done", sessionId: session.sessionId }))
        .catch((err: unknown) => queue.push({ type: "error", message: err instanceof Error ? err.message : String(err) }))
        .finally(() => {
          unsubscribe();
          options.signal?.removeEventListener("abort", abortSession);
          session.dispose();
          queue.close();
        });

      yield* queue;
    } catch (err) {
      yield { type: "error", message: err instanceof Error ? err.message : String(err) };
    } finally {
      options.signal?.removeEventListener("abort", onAbort);
      queue.close();
    }
  }

  private runtime(): Promise<Runtime> {
    this.runtimePromise ??= ModelRuntime.create({ allowModelNetwork: false });
    return this.runtimePromise;
  }

  private async resolveModel(runtime: Runtime, requested?: string) {
    if (requested) {
      const [providerId, ...rest] = requested.split("/");
      const model = runtime.getModel(providerId, rest.join("/"));
      if (!model) throw new Error(`unknown Pi model "${requested}" (use provider/model)`);
      return model;
    }
    const [first] = await runtime.getAvailable();
    if (!first) throw new Error("no Pi provider is signed in; sign in under Settings first");
    return first;
  }

  private openSession(cwd: string, sessionId: string) {
    const path = SessionManager.findById(cwd, sessionId, this.sessionDir);
    if (!path) throw new Error(`no Pi session with id ${sessionId}`);
    return SessionManager.open(path, this.sessionDir, cwd);
  }
}
