import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Everything mip stores lives under one folder. Set MIP_HOME to move it.
export const MIP_HOME = process.env.MIP_HOME ?? join(homedir(), ".mip");
export const DATA_DIR = join(MIP_HOME, "data");
export const SESSIONS_DIR = join(MIP_HOME, "sessions");
// Master clones of repositories. Each chat gets its own copy in its workspace.
export const REPOS_DIR = join(MIP_HOME, "repos");

export function ensureMipDirs(): void {
  for (const dir of [DATA_DIR, REPOS_DIR, join(SESSIONS_DIR, "claude"), join(SESSIONS_DIR, "pi")]) {
    mkdirSync(dir, { recursive: true });
  }
}
