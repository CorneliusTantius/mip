import { spawn } from "node:child_process";
import type { ToolResult, ToolSpec } from "../../adapters/contract.js";

const MAX_BYTES = 50_000;

// Runs a shell command in the agent's workspace. Output keeps the last 50 KB. Nothing is sandboxed, so the command has your user's access.
export const bashTool: ToolSpec = {
  name: "bash",
  guide: "Runs a shell command with the workspace folder as its working directory. Use it for programs, tests, and git. Output keeps only the last 50 KB, and a command stops after 120 seconds unless you set a timeout. Nothing is sandboxed, so the command has your user's access.",
  description: "Run a shell command in the workspace folder. Returns the exit code and the output.",
  inputSchema: {
    type: "object",
    properties: {
      command: { type: "string", description: "Shell command to run" },
      timeout: { type: "number", description: "Seconds before the command is stopped. Default 120." },
    },
    required: ["command"],
  },
  run({ command, timeout = 120 }, { workspace, signal }): Promise<ToolResult> {
    return new Promise((resolve) => {
      const child = spawn("bash", ["-c", command], { cwd: workspace });
      let output = "";
      const collect = (chunk: Buffer) => {
        output = (output + chunk.toString()).slice(-MAX_BYTES);
      };
      child.stdout.on("data", collect);
      child.stderr.on("data", collect);

      const stop = () => child.kill("SIGTERM");
      const timer = setTimeout(stop, timeout * 1000);
      signal?.addEventListener("abort", stop);

      child.on("error", (err) => resolve({ text: err.message, isError: true }));
      child.on("close", (code) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", stop);
        const status = code === null ? "stopped (timeout or cancelled)" : `exit code ${code}`;
        resolve({ text: `${status}\n${output}`.trimEnd(), isError: code !== 0 });
      });
    });
  },
};
