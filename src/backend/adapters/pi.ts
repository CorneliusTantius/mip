import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import {
  type AgentSessionEvent,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRuntime,
  SessionManager,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { AsyncQueue } from "./async-queue.js";
import { SignInSession } from "./sign-in-session.js";
import type {
  AgentEvent,
  AgentProvider,
  ModelOption,
  RunOptions,
  SignInMethod,
  SignInProgress,
  SignInPrompt,
  SignInTarget,
  ThinkingLevel,
  ToolSpec,
} from "./contract.js";

// Anthropic is hidden in Pi. Its only sign-in here is an API key, which bills separately from the Claude subscription.
const HIDDEN_PROVIDERS = new Set(["anthropic"]);

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

// Wraps an app tool for Pi. Pi shows the call and the result; the app's function does the work.
function toPiTool(tool: ToolSpec, workspace: string): ToolDefinition {
  return {
    name: tool.name,
    label: tool.name,
    description: tool.description,
    parameters: Type.Unsafe(tool.inputSchema),
    async execute(_id, params, signal) {
      const result = await tool.run(params, { workspace, signal });
      if (result.isError) throw new Error(result.text);
      return { content: [{ type: "text", text: result.text }], details: undefined };
    },
  };
}

export interface PiProviderOptions {
  // Where Pi's session files go.
  sessionDir: string;
}

export class PiProvider implements AgentProvider {
  readonly id = "pi";
  readonly name = "Pi";
  // Pi has its own tools, but none are enabled yet, so tools and mcp stay off until the tool registry exists.
  readonly capabilities = { streaming: true, tools: false, mcp: false, sessions: true, signIn: true };

  private readonly sessionDir: string;
  private runtimePromise?: Promise<Runtime>;
  private signIns = new Map<string, { session: SignInSession; controller: AbortController }>();

  constructor(options: PiProviderOptions) {
    this.sessionDir = options.sessionDir;
  }

  // Every model of the providers that are signed in. The first one is the default, the same one run falls back to.
  async models(): Promise<ModelOption[]> {
    const runtime = await this.runtime();
    const available = await runtime.getAvailable();
    const options = available.map((model) => ({
      id: `${model.provider}/${model.id}`,
      name: `${model.name} (${model.provider})`,
      thinkingLevels: getSupportedThinkingLevels(model),
    }));
    const [first] = options;
    return first ? [{ ...first, id: "", name: `Default (${first.name})` }, ...options] : [];
  }

  async targets(): Promise<SignInTarget[]> {
    const runtime = await this.runtime();
    const targets: SignInTarget[] = [];

    for (const provider of runtime.getProviders()) {
      if (HIDDEN_PROVIDERS.has(provider.id)) continue;
      const methods: SignInMethod[] = [];
      if (provider.auth.oauth) methods.push("subscription");
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
    if (HIDDEN_PROVIDERS.has(targetId)) {
      throw new Error(`${targetId} is not offered in mip`);
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

      // Replaces Pi's default prompt. Project context files are off, so every run sees the same prompt.
      const resourceLoader = new DefaultResourceLoader({
        cwd,
        agentDir: getAgentDir(),
        noContextFiles: true,
        systemPrompt: options.systemPrompt,
      });
      await resourceLoader.reload();
      const { session } = await createAgentSession({
        cwd,
        modelRuntime: runtime,
        model,
        thinkingLevel: options.thinking,
        sessionManager,
        resourceLoader,
        // Pi's own copies of these tools are off. The app's copies are on.
        noTools: "builtin",
        customTools: (options.tools ?? []).map((tool) => toPiTool(tool, options.workspace ?? process.cwd())),
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
