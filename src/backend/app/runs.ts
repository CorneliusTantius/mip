import { randomUUID } from "node:crypto";
import type { AgentEvent, AgentProvider, ThinkingLevel } from "../adapters/contract.js";
import { activeRunForSession, addMessage, appendRunEvent, createRun, finishRun, getRun, getSession, listRunEvents, type Session, setRunStatus } from "../storage/store.js";
import { HOST, PORT } from "./config.js";
import { AppError } from "./errors.js";
import { recallFor } from "./memory.js";
import { personaPrompt } from "./personas.js";
import { findProvider } from "./providers.js";
import { registerRun, releaseRun, TOOLS } from "./tools/index.js";
import { workspaceFor } from "./tools/workspace.js";

// Starts a turn and returns its run id. The run is not tied to the browser: it keeps going if the page closes,
// and each event is saved as it arrives, so the chat can pick it up again later. The chat's model and thinking level apply.
export function startRun(input: { sessionId: string; prompt: string }): string {
  const session = getSession(input.sessionId);
  if (!session) throw new AppError(404, "no such session");
  const prompt = input.prompt.trim();
  if (!prompt) throw new AppError(400, "prompt is required");
  if (activeRunForSession(session.id)) throw new AppError(409, "this chat is still running");

  const provider = findProvider(session.providerId);
  const runId = randomUUID();
  createRun(runId, session.id);
  addMessage(session.id, { role: "user", text: prompt, tools: [], error: null });

  const workspace = workspaceFor(session.id);
  const token = registerRun(workspace);
  execute({ runId, session, provider, prompt, workspace, token }).catch((err: unknown) => {
    console.error(`run ${runId} failed to save:`, err);
  });
  return runId;
}

// The events of a run after a sequence number, and whether the run is still going.
export function readRun(runId: string, after: number) {
  const run = getRun(runId);
  if (!run) throw new AppError(404, "no such run");
  return { status: run.status, events: listRunEvents(runId, after) };
}

export function activeRunId(sessionId: string): string | undefined {
  return activeRunForSession(sessionId)?.id;
}

interface RunJob {
  runId: string;
  session: Session;
  provider: AgentProvider;
  prompt: string;
  workspace: string;
  token: string;
}

async function execute(job: RunJob): Promise<void> {
  let seq = 0;
  let text = "";
  const tools: string[] = [];
  let error: string | null = null;
  let providerSessionId: string | undefined;

  const record = (event: AgentEvent) => appendRunEvent(job.runId, ++seq, event);
  try {
    for await (const event of job.provider.run({
      prompt: job.prompt,
      // The persona's prompt, plus any shared notes that match this message.
      systemPrompt: [personaPrompt(job.session.personaId), recallFor(job.prompt)].filter(Boolean).join("\n\n"),
      tools: TOOLS,
      workspace: job.workspace,
      toolServer: { url: `http://${HOST}:${PORT}/mcp`, token: job.token },
      model: job.session.model ?? undefined,
      thinking: (job.session.thinking as ThinkingLevel | null) ?? undefined,
      sessionId: job.session.providerSessionId ?? undefined,
    })) {
      if (event.type === "text") text += event.text;
      if (event.type === "tool_call") tools.push(event.name);
      if (event.type === "error") error = event.message;
      if (event.type === "done") providerSessionId = event.sessionId;
      record(event);
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    record({ type: "error", message: error });
  } finally {
    releaseRun(job.token);
  }

  addMessage(job.session.id, { role: "assistant", text, tools, error });
  finishRun(job.session.id, providerSessionId);
  setRunStatus(job.runId, error ? "error" : "done");
}
