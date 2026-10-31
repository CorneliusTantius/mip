import { mkdirSync, rmSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { MIP_HOME } from "../../storage/paths.js";

// Where an agent's folder is. Doesn't create it.
export function workspacePath(agentId: string): string {
  return join(MIP_HOME, "workspaces", agentId);
}

// Each agent (agent) gets its own folder, named after its agent id. Created on first use.
export function workspaceFor(agentId: string): string {
  const dir = workspacePath(agentId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// Deletes an agent's folder with everything in it, including its repository copies.
export function removeWorkspace(agentId: string): void {
  rmSync(workspacePath(agentId), { recursive: true, force: true });
}

// Turns a path from the model into an absolute path inside the workspace. Anything outside is refused.
export function inWorkspace(workspace: string, path: string): string {
  const full = resolve(workspace, path);
  const rel = relative(workspace, full);
  if (isAbsolute(rel) || rel.split(sep)[0] === "..") throw new Error(`path is outside the workspace: ${path}`);
  return full;
}
