import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MIP_HOME } from "../storage/paths.js";
import { runGit } from "./git.js";

// The folder that holds this checkout. Built, this file is dist/backend/app/system.js, so the root is three folders up.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
// Output of the install and build that a restart runs. Kept so a failed build can be read.
const RESTART_LOG = join(MIP_HOME, "restart.log");

// Brings this checkout up to the latest commit on its branch. Fast-forward only, as in Pull all. Returns git's output.
// The new code runs after a restart, which restartMip does.
export function pullLatest(): Promise<string> {
  return runGit(["-C", ROOT, "pull", "--ff-only"]);
}

// Restarts the server. This process stops, then a detached shell installs dependencies, builds, and starts the server again.
// The shell waits for this process to exit first. It starts the server even when the install or build fails, so the dashboard comes back.
export function restartMip(): void {
  const npm = join(dirname(process.execPath), "npm");
  const script = [
    `while kill -0 ${process.pid} 2>/dev/null; do sleep 0.2; done`,
    `cd "${ROOT}"`,
    `{ "${npm}" install && "${npm}" run build; } >> "${RESTART_LOG}" 2>&1`,
    `exec "${process.execPath}" dist/backend/http/server.js >> "${RESTART_LOG}" 2>&1`,
  ].join("\n");
  spawn("sh", ["-c", script], { detached: true, stdio: "ignore" }).unref();
  // Stop after the reply is sent, so the dashboard gets its answer first.
  setTimeout(() => process.exit(0), 300);
}
