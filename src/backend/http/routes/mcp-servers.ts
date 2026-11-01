import { mcpStatus, startMcpServers } from "../../app/mcp/manager.js";
import { ok } from "../respond.js";
import { get, post, type Route } from "../router.js";

// MCP servers: each server's connection state and tools, and a reload after mcp.json changes. The reload waits until every server has
// connected or failed, so the reply shows the new state.
export const mcpServerRoutes: Route[] = [
  get("/api/mcp", () => ok(mcpStatus())),
  post("/api/mcp/reload", async () => {
    await startMcpServers();
    return ok(mcpStatus());
  }),
];
