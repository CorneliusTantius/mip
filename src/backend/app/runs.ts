import { randomUUID } from "node:crypto";
import type { AgentEvent, AgentProvider, ThinkingLevel, ToolSpec } from "../adapters/contract.js";
import { activeRunForAgent, appendRunEvent, createRun, getRun, listRunEvents, setRunStatus } from "../storage/runs.js";
import { addMessage, getAgent, saveProviderSession, type Agent } from "../storage/agents.js";
import { HOST, PORT } from "./config.js";
import { AppError } from "./errors.js";
import { recallFor } from "./memory.js";
import { personaPrompt } from "./personas.js";
import { findProvider } from "./providers.js";
import { repoNote } from "./repos.js";
import { AGENT_TOOLS, agentDeferredTools, registerRun, releaseRun, toolGuidesPrompt } from "./tools/index.js";
import { takePendingAsk } from "./tools/ask.js";
import { withSkillCommand } from "./skills/registry.js";
import { ToolCallLog } from "./tools/calls.js";
import { workspaceFor } from "./tools/workspace.js";

// How a run ended: the text it wrote, and the error it stopped with, if any.
export interface RunReply {
  text: string;
  error: string | null;
}

// Starts a turn and returns its run id. The run is not tied to the browser: it keeps going if the page closes,
// and each event is saved as it arrives, so the agent can pick it up again later. The agent's model and thinking level apply.
// onFinish runs once the reply is saved. A bot's task uses it to post the reply to its room.
export function startRun(input: { agentId: string; prompt: string; onFinish?: (reply: RunReply) => void }): string {
  const agent = getAgent(input.agentId);
  if (!agent) throw new AppError(404, "no such agent");
  const prompt = input.prompt.trim();
  if (!prompt) throw new AppError(400, "prompt is required");
  if (activeRunForAgent(agent.id)) throw new AppError(409, "this agent is still running");

  const provider = findProvider(agent.providerId);
  const runId = randomUUID();
  createRun(runId, agent.id);
  addMessage(agent.id, { role: "user", text: prompt, tools: [], error: null });

  const workspace = workspaceFor(agent.id);
  const deferred = agentDeferredTools();
  const token = registerRun({ workspace, agentId: agent.id, tools: AGENT_TOOLS, deferred });
  execute({ runId, agent, provider, prompt, workspace, token, deferred, onFinish: input.onFinish }).catch((err: unknown) => {
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

export function activeRunId(agentId: string): string | undefined {
  return activeRunForAgent(agentId)?.id;
}

interface RunJob {
  runId: string;
  agent: Agent;
  provider: AgentProvider;
  prompt: string;
  workspace: string;
  token: string;
  // The deferred tools the run may find with tool_search and run with tool_call.
  deferred: ToolSpec[];
  onFinish?: (reply: RunReply) => void;
}

async function execute(job: RunJob): Promise<void> {
  let seq = 0;
  let text = "";
  const tools: string[] = [];
  const calls = new ToolCallLog();
  let error: string | null = null;
  let providerSessionId: string | undefined;

  const record = (event: AgentEvent) => appendRunEvent(job.runId, ++seq, event);
  try {
    for await (const event of job.provider.run({
      // A leading /skill-name is expanded here, so the model gets the skill's instructions. The message is saved as it was typed.
      prompt: withSkillCommand(job.prompt),
      // The persona's prompt, the repositories in the workspace, the guides of the tools offered, and any shared notes that match this message.
      systemPrompt: [personaPrompt(job.agent.personaId), repoNote(job.workspace), toolGuidesPrompt(AGENT_TOOLS), recallFor(job.prompt)]
        .filter(Boolean)
        .join("\n\n"),
      tools: AGENT_TOOLS,
      deferredTools: job.deferred,
      workspace: job.workspace,
      agentId: job.agent.id,
      toolServer: { url: `http://${HOST}:${PORT}/mcp`, token: job.token },
      model: job.agent.model ?? undefined,
      thinking: (job.agent.thinking as ThinkingLevel | null) ?? undefined,
      sessionId: job.agent.providerSessionId ?? undefined,
    })) {
      if (event.type === "text") text += event.text;
      if (event.type === "tool_call") {
        tools.push(event.name);
        calls.start(event.id, event.name, event.input);
      }
      if (event.type === "tool_result") calls.finish(event.id, event.output, event.isError);
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

  try {
    // A question the run asked is saved on its reply, so the controls for the answer show under the reply's text.
    addMessage(job.agent.id, { role: "assistant", text, tools, calls: calls.calls, error, ask: takePendingAsk(job.agent.id) });
    saveProviderSession(job.agent.id, providerSessionId);
    setRunStatus(job.runId, error ? "error" : "done");
  } finally {
    // Runs even if saving failed, so a bot waiting on this reply is not left waiting.
    job.onFinish?.({ text, error });
  }
}
