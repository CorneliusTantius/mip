import { mcpStatus, signInServer } from "../../app/mcp/manager.js";
import { addMcpServer, reloadMcp, removeMcpServer, setAllowedTools } from "../../app/mcp/servers.js";
import { created, ok, readJson, requireJson } from "../respond.js";
import { del, get, patch, post, type Route } from "../router.js";

// MCP servers: each server's connection state and tools, a reload after mcp.json changes, adding, removing, and signing in to one, and
// choosing which tools a server offers. The reload waits until every server has connected or failed, so the reply shows the new state.
// The POST and PATCH routes need JSON, so a page on another site cannot make them: a request that is not JSON is sent only after a
// preflight, which this server does not answer.
export const mcpServerRoutes: Route[] = [
  get("/api/mcp", () => ok(mcpStatus())),
  post("/api/mcp", async ({ req }) => {
    requireJson(req);
    return created(await addMcpServer(await readJson(req)));
  }),
  post("/api/mcp/reload", async () => ok(await reloadMcp())),
  del("/api/mcp/:name", async ({ params }) => ok(await removeMcpServer(params.name))),
  patch("/api/mcp/:name", async ({ req, params }) => {
    requireJson(req);
    return ok(await setAllowedTools(params.name, await readJson(req)));
  }),
  post("/api/mcp/:name/sign-in", async ({ req, params }) => {
    requireJson(req);
    await signInServer(params.name);
    return ok(mcpStatus());
  }),
];
