import { randomUUID } from "node:crypto";
import type { ToolSpec } from "../../adapters/contract.js";
import { bashTool } from "./bash.js";
import { editTool, readTool, writeTool } from "./files.js";
import { memoryEditTool, memoryReadTool, memorySearchTool } from "./memory.js";

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

// The default tools: the four Pi ships with, plus the shared memory. Every provider gets these through its own adapter.
// Memory tools can search, read, and edit notes. Creating and deleting notes is left to the user in the memory screen.
export const TOOLS: ToolSpec[] = [readTool, bashTool, editTool, writeTool, memorySearchTool, memoryReadTool, memoryEditTool].map(guarded);

export function findTool(name: string): ToolSpec | undefined {
  return TOOLS.find((tool) => tool.name === name);
}

// Each run gets its own token for the tool endpoint, and the token opens only that run's workspace.
// The token is released when the run ends, so it stops working after that.
const runWorkspaces = new Map<string, string>();

export function registerRun(workspace: string): string {
  const token = randomUUID();
  runWorkspaces.set(token, workspace);
  return token;
}

export function releaseRun(token: string): void {
  runWorkspaces.delete(token);
}

export function workspaceForToken(token: string | undefined): string | undefined {
  return token ? runWorkspaces.get(token) : undefined;
}
