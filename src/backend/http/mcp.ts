import type { IncomingMessage, ServerResponse } from "node:http";
import { runContextForToken } from "../app/tools/index.js";
import { sendJson } from "./respond.js";

// Tool calls from the Claude CLI. It speaks the Model Context Protocol, which is JSON-RPC 2.0 over HTTP.
// The bearer token picks the run. The run's folder, agent, and tool list come from that token, so a run can only call its own tools.
export async function handleMcp(req: IncomingMessage, res: ServerResponse, message: any): Promise<void> {
  const token = req.headers.authorization?.replace(/^Bearer /, "");
  const run = runContextForToken(token);
  if (!run) return sendJson(res, 401, { error: "unauthorized" });

  const { id, method, params } = message;
  // Notifications have no id, and get no reply body.
  if (id === undefined) return void res.writeHead(202).end();

  switch (method) {
    case "initialize":
      return reply(res, id, {
        protocolVersion: params?.protocolVersion ?? "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "mip", version: "0.1.0" },
      });
    case "tools/list":
      return reply(res, id, { tools: run.tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case "tools/call": {
      const tool = run.tools.find((candidate) => candidate.name === params?.name);
      if (!tool) return replyError(res, id, -32602, `unknown tool: ${params?.name}`);
      // A bot's run has no folder. None of its tools read one, so the empty path is never used.
      const result = await tool.run(params.arguments ?? {}, { workspace: run.workspace ?? "", agentId: run.agentId, botId: run.botId, roomId: run.roomId, deferred: run.deferred });
      return reply(res, id, { content: [{ type: "text", text: result.text }], isError: result.isError });
    }
    default:
      return replyError(res, id, -32601, `method not found: ${method}`);
  }
}

// JSON-RPC replies always use HTTP 200. Failures are reported inside the body.
function reply(res: ServerResponse, id: unknown, result: unknown): void {
  sendJson(res, 200, { jsonrpc: "2.0", id, result });
}

function replyError(res: ServerResponse, id: unknown, code: number, message: string): void {
  sendJson(res, 200, { jsonrpc: "2.0", id, error: { code, message } });
}
