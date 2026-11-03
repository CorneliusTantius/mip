import { randomUUID } from "node:crypto";
import type { ToolSpec } from "../../adapters/contract.js";
import { getBot } from "../../storage/bots.js";
import { listAgents, type Agent } from "../../storage/agents.js";
import { addRoomMessage } from "../../storage/room.js";
import { getRoom } from "../../storage/rooms.js";
import { mcpTools } from "../mcp/manager.js";
import { askUserTool } from "./ask.js";
import { bashTool } from "./bash.js";
import { editTool, readTool, writeTool } from "./files.js";
import { memoryEditTool, memoryReadTool, memorySearchTool } from "./memory.js";
import { roomSearchTool } from "./room.js";
import { toolCallTool, toolSearchTool } from "./search.js";
import { skillFileTool, skillReadTool, skillSearchTool } from "./skills.js";
import { SOCIAL_TOOLS } from "./social.js";
import { spendingListTool, spendingUpsertTool } from "./financial.js";
import { errorMessage } from "../errors.js";
import { activeRunId, startRun } from "../runs.js";
import { fail, ok } from "./result.js";

// A tool that throws reports the error as a failed result, the same as any other failure.
const guarded = (tool: ToolSpec): ToolSpec => ({
  ...tool,
  async run(input, context) {
    try {
      return await tool.run(input, context);
    } catch (err) {
      return { text: err instanceof Error ? err.message : String(err), isError: true };
    }
  },
});

// The skill tools are wrapped once. Agents get skill_search and skill_read basic and skill_file deferred. Bots are offered all three directly.
const skillSearch = guarded(skillSearchTool);
const skillRead = guarded(skillReadTool);
const skillFile = guarded(skillFileTool);
// Basic tools are offered to every run, so the model always has them. Only agents ask the user questions, since a bot speaks in a room.
const askUser = guarded(askUserTool);
export const BASIC_TOOLS: ToolSpec[] = [bashTool, readTool, editTool, writeTool].map(guarded).concat(skillSearch, skillRead, askUser);
// The memory tools are wrapped once. Agents defer them, and bots are offered them directly.
const memorySearch = guarded(memorySearchTool);
const memoryRead = guarded(memoryReadTool);
const memoryEdit = guarded(memoryEditTool);
// Deferred tools are not offered. The model finds one with tool_search, and runs it with tool_call.
export const DEFERRED_TOOLS: ToolSpec[] = [memorySearch, memoryRead, memoryEdit, skillFile];
// The two tools that find and run deferred tools.
const SEARCH_TOOLS: ToolSpec[] = [toolSearchTool, toolCallTool].map(guarded);
// The bots' agent tools. They are defined here, not in their own file, because starting a run lives in runs.ts, which reads this
// registry. A tool that imported runs.ts from its own file would make a cycle that breaks when that file loads first.
// The agents the user has opened to bots.
function openAgents(): Agent[] {
  return listAgents().filter((agent) => agent.openToBots);
}

// The rooms that have a task out to an agent. A room sends one task at a time, so a bot cannot pile them up.
const delegating = new Set<string>();

// Lists the agents a bot may send tasks to, and whether each one is busy.
const agentsListTool: ToolSpec = {
  name: "agents_list",
  guide: "Lists the agents that are open to bots, with the ones that are busy. Use it to find the agent to send a task to with agent_ask.",
  description: "List the agents open to bots. Shows each one's name, and marks the ones that are busy.",
  inputSchema: { type: "object", properties: {} },
  async run() {
    const open = openAgents();
    if (open.length === 0) return ok("No agent is open to bots. The user opens one in its settings.");
    return ok(open.map((agent) => `${agent.title}${activeRunId(agent.id) ? " (busy)" : ""}`).join("\n"));
  },
};

// Sends a task to an agent that is open to bots. The agent does it in its own chat, with its own tools. Its reply is posted to the room when
// it finishes, so this returns at once and the bot does not wait for it.
const agentAskTool: ToolSpec = {
  name: "agent_ask",
  guide: "Sends a task to an agent from agents_list. The agent does it in its own chat, with its own tools, and posts its reply to this room when it is done. Use it when the task needs what that agent can do, such as work in its repositories. Do not send a task you can answer yourself. You will not see the reply in this turn; it is in the room's messages afterwards.",
  description: "Send a task to an agent that is open to bots. Its reply is posted to this room when it finishes.",
  inputSchema: {
    type: "object",
    properties: {
      agent: { type: "string", description: "The agent's name, as agents_list shows it" },
      task: { type: "string", description: "What the agent should do. Write it so the agent can act without more context" },
    },
    required: ["agent", "task"],
  },
  async run({ agent, task }, context) {
    if (!context.botId || !context.roomId) return fail("Only a bot in a room can send a task to an agent.");
    const name = String(agent ?? "").trim().toLowerCase();
    const target = openAgents().find((candidate) => candidate.title.toLowerCase() === name);
    if (!target) return fail(`No agent called "${agent}" is open to bots. Use agents_list to see the agents that are.`);
    const text = String(task ?? "").trim();
    if (!text) return fail("task is required");

    const room = getRoom(context.roomId);
    const bot = getBot(context.botId);
    if (!room || !bot) return fail("The room or the bot no longer exists.");
    if (delegating.has(room.id)) return fail("A task from this room is still running. Wait for its reply first.");

    delegating.add(room.id);
    try {
      // The agent's chat shows the task as a message from the bot, so the user can see what was asked.
      startRun({
        agentId: target.id,
        prompt: `${bot.name} in ${room.name} asks: ${text}`,
        onFinish: ({ text: reply, error }) => {
          delegating.delete(room.id);
          const body = error ? `${reply}\n\nError: ${error}`.trim() : reply.trim();
          addRoomMessage({ roomId: room.id, kind: "agent", botId: null, authorName: target.title, text: body || "(no reply)" });
        },
      });
    } catch (err) {
      delegating.delete(room.id);
      return fail(errorMessage(err));
    }
    return ok(`Sent to ${target.title}. Its reply will appear in this room when it is done.`);
  },
};

const roomSearch = guarded(roomSearchTool);
const agentsList = guarded(agentsListTool);
const agentAsk = guarded(agentAskTool);
// The bots' tools for mail and Slack, reads and the sends and deletes that act as the user. Bots defer them, so they are found with tool_search and run with tool_call.
const SOCIAL_DEFERRED = SOCIAL_TOOLS.map(guarded);
// The spending entries, read-only. Bots defer it, so they find it with tool_search.
const FINANCIAL_DEFERRED = [spendingListTool].map(guarded);
// Agents defer the one tool that writes a spending entry, so they find it with tool_search.
const AGENT_FINANCIAL = [spendingUpsertTool].map(guarded);

// The one registry of tool definitions. Each kind of run takes its lists from here, so a definition exists in one place.
export const TOOLS: ToolSpec[] = [...BASIC_TOOLS, ...DEFERRED_TOOLS, ...SEARCH_TOOLS, roomSearch, agentsList, agentAsk, ...SOCIAL_DEFERRED, ...FINANCIAL_DEFERRED, ...AGENT_FINANCIAL];

// Agents (the agents) are offered the basic tools and the two search tools. They run the deferred tools through tool_call.
export const AGENT_TOOLS: ToolSpec[] = [...BASIC_TOOLS, ...SEARCH_TOOLS];
export const AGENT_DEFERRED: ToolSpec[] = [...DEFERRED_TOOLS, ...AGENT_FINANCIAL];
// The deferred tools of one agent run: mip's own, and the tools of the MCP servers that are connected right now.
// A run takes this list when it starts, so tools that connect later are seen by the next run.
export function agentDeferredTools(): ToolSpec[] {
  return [...AGENT_DEFERRED, ...mcpTools()];
}
// Bots are offered the memory tools, the skill tools, the room search, and the two search tools directly. Their deferred tools are the
// MCP tools, which the search tools find. The mip tools a bot has are few, so they are all offered directly.
export const BOT_TOOLS: ToolSpec[] = [
  memorySearch,
  memoryRead,
  memoryEdit,
  skillSearch,
  skillRead,
  skillFile,
  roomSearch,
  agentsList,
  agentAsk,
  ...SEARCH_TOOLS,
];
// The deferred tools of one bot turn: the MCP tools that are connected right now. Like an agent run, a turn takes this list when it starts.
export function botDeferredTools(): ToolSpec[] {
  return [...SOCIAL_DEFERRED, ...FINANCIAL_DEFERRED, ...mcpTools()];
}

// What one run may do: the folder its tools work in, the agent it belongs to, the room it is in, the tools it is offered, and the
// deferred tools it may run. A bot's run has no folder and no agent, since none of its tools use them. It has the room it speaks in.
export interface RunContext {
  workspace?: string;
  agentId?: string;
  botId?: string;
  roomId?: string;
  tools: ToolSpec[];
  deferred?: ToolSpec[];
}

// Each run gets its own token for the tool endpoint. The token opens only that run's context, and only its tools are callable.
// The token is released when the run ends, so it stops working after that.
const runs = new Map<string, RunContext>();

export function registerRun(context: RunContext): string {
  const token = randomUUID();
  runs.set(token, context);
  return token;
}

export function releaseRun(token: string): void {
  runs.delete(token);
}

export function runContextForToken(token: string | undefined): RunContext | undefined {
  return token ? runs.get(token) : undefined;
}

// What the registry offers, for the dashboard: each tool with its description and input, how an agent is offered it, and which kinds of run may use it.
export function describeTools() {
  // The MCP tools are listed with mip's own. They are deferred for agents and for bots alike.
  const external = mcpTools();
  return [...TOOLS, ...external].map((tool) => ({
    name: tool.name,
    description: tool.description,
    guide: tool.guide,
    inputSchema: tool.inputSchema,
    load:
      DEFERRED_TOOLS.includes(tool) || external.includes(tool) || SOCIAL_DEFERRED.includes(tool) || FINANCIAL_DEFERRED.includes(tool) || AGENT_FINANCIAL.includes(tool)
        ? "deferred"
        : SEARCH_TOOLS.includes(tool)
          ? "search"
          : "basic",
    agent: AGENT_TOOLS.includes(tool) || AGENT_DEFERRED.includes(tool) || external.includes(tool),
    bot: BOT_TOOLS.includes(tool) || external.includes(tool) || SOCIAL_DEFERRED.includes(tool) || FINANCIAL_DEFERRED.includes(tool),
  }));
}

// The guides of the tools a run is offered, for its system prompt. Each guide says when and how to use its tool.
export function toolGuidesPrompt(tools: ToolSpec[]): string {
  if (tools.length === 0) return "";
  return ["Tool guides. Use each tool as its guide says.", ...tools.map((tool) => `- ${tool.name}: ${tool.guide}`)].join("\n");
}
