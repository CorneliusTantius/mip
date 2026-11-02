import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Everything mip stores lives under one folder. Set MIP_HOME to move it.
export const MIP_HOME = process.env.MIP_HOME ?? join(homedir(), ".mip");
export const DATA_DIR = join(MIP_HOME, "data");
// This installation's device ID, for providers that identify each install. It stays on this machine.
export const DEVICE_ID_FILE = join(DATA_DIR, "device-id");
// The MCP servers mip connects to. It can hold tokens, so it stays on this machine and is never synced.
export const MCP_CONFIG_FILE = join(DATA_DIR, "mcp.json");
// The mail accounts mip reads over IMAP. They hold app passwords, and sync carries them to the private dotmip repo.
export const MAIL_CONFIG_FILE = join(DATA_DIR, "mail.json");
// The newest message headers of each mail account, so a reload fetches only what is new. Sync does not carry it.
export const MAIL_CACHE_FILE = join(DATA_DIR, "mail-cache.json");
// The Slack app's client ID and secret, and the connected Slack users with their user tokens. Sync carries them to the private dotmip repo.
export const SLACK_CONFIG_FILE = join(DATA_DIR, "slack.json");
// Conversations, messages, and names read from Slack, kept so a reload does not call Slack again. Sync does not carry it.
export const SLACK_CACHE_FILE = join(DATA_DIR, "slack-cache.json");
export const SESSIONS_DIR = join(MIP_HOME, "sessions");
// Master clones of repositories. Each agent gets its own copy in its workspace.
export const REPOS_DIR = join(MIP_HOME, "repos");
// GitHub sync: the sign-in token, the merge base, and a local copy of the dotmip repo.
export const SYNC_DIR = join(MIP_HOME, "sync");
// Installed skills. Each one is a folder with a SKILL.md. Only the app reads this folder, never another tool's skills.
export const SKILLS_DIR = join(MIP_HOME, "skills");
// Pi's own config folder. It is set as Pi's agent folder, so Pi's settings and custom models live here, and its credentials and model
// catalogs live in the database.
export const PI_AGENT_DIR = join(DATA_DIR, "pi");

export function ensureMipDirs(): void {
  for (const dir of [DATA_DIR, REPOS_DIR, PI_AGENT_DIR, join(SESSIONS_DIR, "claude"), join(SESSIONS_DIR, "pi")]) {
    mkdirSync(dir, { recursive: true });
  }
}
