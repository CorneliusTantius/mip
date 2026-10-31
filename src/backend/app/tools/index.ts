import { randomUUID } from "node:crypto";
import type { ToolSpec } from "../../adapters/contract.js";
import { bashTool } from "./bash.js";
import { editTool, readTool, writeTool } from "./files.js";
import { memoryEditTool, memoryReadTool, memorySearchTool } from "./memory.js";
import { skillFileTool, skillReadTool } from "./skills.js";

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

// The one registry of tool definitions. Each kind of run takes its list from here, so a definition exists in one place.
export const TOOLS: ToolSpec[] = [
  readTool,
  bashTool,
  editTool,
  writeTool,
  memorySearchTool,
  memoryReadTool,
  memoryEditTool,
  skillReadTool,
  skillFileTool,
].map(guarded);

// Chats get every tool. Bots get none for now, which is what room turns have always used.
export const CHAT_TOOLS: ToolSpec[] = TOOLS;
export const BOT_TOOLS: ToolSpec[] = [];

// What one run may do: the folder its tools work in, the chat it belongs to, and the tools it is offered.
export interface RunContext {
  workspace: string;
  chatId: string;
  tools: ToolSpec[];
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
