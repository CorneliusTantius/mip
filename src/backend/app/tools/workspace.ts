import { mkdirSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { MIP_HOME } from "../../storage/paths.js";

// Each agent (chat) gets its own folder, named after its chat id. Created on first use.
export function workspaceFor(sessionId: string): string {
  const dir = join(MIP_HOME, "workspaces", sessionId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// Turns a path from the model into an absolute path inside the workspace. Anything outside is refused.
export function inWorkspace(workspace: string, path: string): string {
  const full = resolve(workspace, path);
  const rel = relative(workspace, full);
  if (isAbsolute(rel) || rel.split(sep)[0] === "..") throw new Error(`path is outside the workspace: ${path}`);
  return full;
}
