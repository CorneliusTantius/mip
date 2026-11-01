import { randomUUID } from "node:crypto";
import type { ToolSpec } from "../../adapters/contract.js";
import { bashTool } from "./bash.js";
import { editTool, readTool, writeTool } from "./files.js";
import { memoryEditTool, memoryReadTool, memorySearchTool } from "./memory.js";
import { roomSearchTool } from "./room.js";
import { toolCallTool, toolSearchTool } from "./search.js";
import { skillFileTool, skillReadTool, skillSearchTool } from "./skills.js";

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
// Basic tools are offered to every run, so the model always has them.
export const BASIC_TOOLS: ToolSpec[] = [bashTool, readTool, editTool, writeTool].map(guarded).concat(skillSearch, skillRead);
// The memory tools are wrapped once. Agents defer them, and bots are offered them directly.
const memorySearch = guarded(memorySearchTool);
const memoryRead = guarded(memoryReadTool);
const memoryEdit = guarded(memoryEditTool);
// Deferred tools are not offered. The model finds one with tool_search, and runs it with tool_call.
export const DEFERRED_TOOLS: ToolSpec[] = [memorySearch, memoryRead, memoryEdit, skillFile];
// The two tools that find and run deferred tools.
const SEARCH_TOOLS: ToolSpec[] = [toolSearchTool, toolCallTool].map(guarded);
// Only bots are offered the room search.
const roomSearch = guarded(roomSearchTool);

// The one registry of tool definitions. Each kind of run takes its lists from here, so a definition exists in one place.
export const TOOLS: ToolSpec[] = [...BASIC_TOOLS, ...DEFERRED_TOOLS, ...SEARCH_TOOLS, roomSearch];

// Agents (the agents) are offered the basic tools and the two search tools. They run the deferred tools through tool_call.
export const AGENT_TOOLS: ToolSpec[] = [...BASIC_TOOLS, ...SEARCH_TOOLS];
export const AGENT_DEFERRED: ToolSpec[] = DEFERRED_TOOLS;
// Bots are offered the memory tools, the skill tools, and the room search directly, and no deferred tools. A bot's turn has few tools, so none need finding.
export const BOT_TOOLS: ToolSpec[] = [memorySearch, memoryRead, memoryEdit, skillSearch, skillRead, skillFile, roomSearch];
export const BOT_DEFERRED: ToolSpec[] = [];

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
  return TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    guide: tool.guide,
    inputSchema: tool.inputSchema,
    load: DEFERRED_TOOLS.includes(tool) ? "deferred" : SEARCH_TOOLS.includes(tool) ? "search" : "basic",
    agent: AGENT_TOOLS.includes(tool) || AGENT_DEFERRED.includes(tool),
    bot: BOT_TOOLS.includes(tool) || BOT_DEFERRED.includes(tool),
  }));
}

// The guides of the tools a run is offered, for its system prompt. Each guide says when and how to use its tool.
export function toolGuidesPrompt(tools: ToolSpec[]): string {
  if (tools.length === 0) return "";
  return ["Tool guides. Use each tool as its guide says.", ...tools.map((tool) => `- ${tool.name}: ${tool.guide}`)].join("\n");
}
