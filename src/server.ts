import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createProviders, findProvider } from "./agent/registry.js";
import type { AgentProvider, SignInMethod } from "./agent/types.js";
import { DASHBOARD_HTML } from "./dashboard.js";

const PORT = Number(process.env.MIP_PORT ?? 3000);
// Only bind to loopback so the dashboard isn't reachable from the network.
const HOST = "127.0.0.1";

const providers = createProviders();

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}

async function readJson(req: IncomingMessage): Promise<any> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : {};
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Settings data: each provider, its sign-in targets, and any sign-in in progress.
async function listProviders() {
  return Promise.all(
    providers.map(async (provider) => {
      try {
        const targets = await provider.targets();
        return {
          id: provider.id,
          name: provider.name,
          capabilities: provider.capabilities,
          targets: targets.map((target) => ({
            ...target,
            progress: provider.signInProgress?.(target.id) ?? { running: false, output: [] },
          })),
        };
      } catch (err) {
        return { id: provider.id, name: provider.name, capabilities: provider.capabilities, targets: [], error: errorMessage(err) };
      }
    }),
  );
}

// Streams one run as newline-delimited JSON, one app event per line.
async function streamRun(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req);
  const provider: AgentProvider = findProvider(providers, body.provider);
  const controller = new AbortController();
  // Stop the run if the client disconnects.
  res.on("close", () => controller.abort());

  res.writeHead(200, { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" });
  for await (const event of provider.run({
    prompt: String(body.prompt ?? ""),
    model: body.model,
    sessionId: body.sessionId,
    signal: controller.signal,
  })) {
    res.write(`${JSON.stringify(event)}\n`);
  }
  res.end();
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${HOST}`);
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    return void res.end(DASHBOARD_HTML);
  }

  if (req.method === "GET" && url.pathname === "/api/providers") {
    return sendJson(res, 200, { providers: await listProviders() });
  }

  if (req.method === "POST" && url.pathname === "/api/run") {
    return streamRun(req, res);
  }

  // /api/providers/:provider/targets/:target/(sign-in|answer|sign-out)
  if (parts[0] === "api" && parts[1] === "providers" && parts[3] === "targets" && parts.length === 6 && req.method === "POST") {
    const provider = findProvider(providers, parts[2]);
    const target = parts[4];
    const action = parts[5];
    const body = await readJson(req);

    if (action === "sign-in") {
      provider.startSignIn?.(target, body.method as SignInMethod);
      return sendJson(res, 202, { started: true });
    }
    if (action === "answer") {
      provider.answerSignIn?.(target, String(body.answer ?? ""));
      return sendJson(res, 200, { ok: true });
    }
    if (action === "sign-out") {
      await provider.signOut?.(target);
      return sendJson(res, 200, { ok: true });
    }
  }

  sendJson(res, 404, { error: "not found" });
}

createServer((req, res) => {
  handle(req, res).catch((err: unknown) => {
    if (!res.headersSent) sendJson(res, 500, { error: errorMessage(err) });
    else res.end();
  });
}).listen(PORT, HOST, () => {
  console.log(`mip dashboard: http://${HOST}:${PORT}`);
});
