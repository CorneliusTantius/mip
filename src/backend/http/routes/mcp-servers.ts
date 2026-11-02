import { mcpStatus, signInServer, startMcpServers } from "../../app/mcp/manager.js";
import { addMcpServer, removeMcpServer } from "../../app/mcp/servers.js";
import { created, ok, readJson } from "../respond.js";
import { del, get, post, type Route } from "../router.js";

// MCP servers: each server's connection state and tools, a reload after mcp.json changes, and adding, removing, and signing in to one.
// The reload waits until every server has connected or failed, so the reply shows the new state. The POST routes need JSON, so a page on
// another site cannot make them: a request that is not JSON is sent only after a preflight, which this server does not answer.
export const mcpServerRoutes: Route[] = [
  get("/api/mcp", () => ok(mcpStatus())),
  post("/api/mcp", async ({ req }) => {
    return created(await addMcpServer(await readJson(req)));
  }),
  post("/api/mcp/reload", async () => {
    await startMcpServers();
    return ok(mcpStatus());
  }),
  del("/api/mcp/:name", async ({ params }) => ok(await removeMcpServer(params.name))),
  post("/api/mcp/:name/sign-in", async ({ req, params }) => {
    await signInServer(params.name);
    return ok(mcpStatus());
  }),
];
