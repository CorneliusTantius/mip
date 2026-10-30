import { spawn } from "node:child_process";

// Runs git with the user's own config and credentials. Prompts are off, so a clone that needs a password fails
// with a message instead of waiting for input. Resolves on success. Rejects with git's last error line.
export function runGit(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", (err) => reject(new Error(`failed to start git: ${err.message}`)));
    child.on("close", (code) => {
      if (code === 0) return resolve();
      // git ends with a generic hint, so the first "fatal:" or "error:" line says what went wrong.
      const lines = stderr.trim().split("\n");
      reject(new Error(lines.find((line) => /^(fatal|error):/.test(line)) ?? lines[lines.length - 1] ?? `git exited with code ${code}`));
    });
  });
}
