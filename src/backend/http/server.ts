import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { HOST, PORT } from "../app/config.js";
import { errorMessage, AppError } from "../app/errors.js";
import { handleMcp } from "./mcp.js";
import { notFound, readJson, sendJson } from "./respond.js";
import { matchRoute } from "./router.js";
import { routes } from "./routes/index.js";
import { serveStatic } from "./static.js";

// Every request goes through here, in this order: the web build, the tool endpoint, then the API routes.
async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${HOST}`);

  if (req.method === "GET" && !url.pathname.startsWith("/api/") && (await serveStatic(url.pathname, res))) return;

  // The tool endpoint for the Claude CLI. Each run's bearer token decides what it may reach.
  if (req.method === "POST" && url.pathname === "/mcp") {
    return handleMcp(req, res, await readJson(req));
  }

  const match = matchRoute(routes, req.method ?? "", url.pathname);
  const reply = match ? await match.route.handle({ req, url, params: match.params }) : notFound();
  sendJson(res, reply.status, reply.body);
}

createServer((req, res) => {
  handle(req, res).catch((err: unknown) => {
    if (res.headersSent) return res.end();
    // An AppError carries the status it wants. Anything else is a server fault.
    const status = err instanceof AppError ? err.status : 500;
    sendJson(res, status, { error: errorMessage(err) });
  });
}).listen(PORT, HOST, () => {
  console.log(`mip dashboard: http://${HOST}:${PORT}`);
});
