import { spawn } from "node:child_process";

// Runs git with the user's own config and credentials. Prompts are off, so a clone that needs a password fails
// with a message instead of waiting for input. Resolves with git's output. Rejects with the error git reports.
export function runGit(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", (err) => reject(new Error(`failed to start git: ${err.message}`)));
    child.on("close", (code) => {
      if (code === 0) return resolve(stdout.trim());
      // git often ends with a generic hint, so the "fatal:" or "error:" line says what went wrong.
      const lines = stderr.trim().split("\n");
      const reason = lines.find((line) => /^(fatal|error):/.test(line)) ?? lines.find((line) => line.trim());
      reject(new Error(reason ?? `git exited with code ${code}`));
    });
  });
}
