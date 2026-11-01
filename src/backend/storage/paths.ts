import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Everything mip stores lives under one folder. Set MIP_HOME to move it.
export const MIP_HOME = process.env.MIP_HOME ?? join(homedir(), ".mip");
export const DATA_DIR = join(MIP_HOME, "data");
// This installation's device ID, for providers that identify each install. It stays on this machine.
export const DEVICE_ID_FILE = join(DATA_DIR, "device-id");
export const SESSIONS_DIR = join(MIP_HOME, "sessions");
// Master clones of repositories. Each agent gets its own copy in its workspace.
export const REPOS_DIR = join(MIP_HOME, "repos");
// GitHub sync: the sign-in token, the merge base, and a local copy of the dotmip repo.
export const SYNC_DIR = join(MIP_HOME, "sync");
// Installed skills. Each one is a folder with a SKILL.md. Only the app reads this folder, never another tool's skills.
export const SKILLS_DIR = join(MIP_HOME, "skills");

export function ensureMipDirs(): void {
  for (const dir of [DATA_DIR, REPOS_DIR, join(SESSIONS_DIR, "claude"), join(SESSIONS_DIR, "pi")]) {
    mkdirSync(dir, { recursive: true });
  }
}
