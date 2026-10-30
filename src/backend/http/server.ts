import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { SignInMethod } from "../adapters/contract.js";
import { HOST, PORT } from "../app/config.js";
import { AppError, errorMessage } from "../app/errors.js";
import { forgetNote, memoryGraph, memoryList, readNote, writeNote } from "../app/memory.js";
import { allPersonas, createPersona, editPersona, makeDefaultPersona, removePersona } from "../app/personas.js";
import { answerSignIn, listProviders, signIn, signOut } from "../app/providers.js";
import { readRun, startRun } from "../app/runs.js";
import { createChat, deleteChat, getChat, listChats, updateChat } from "../app/sessions.js";
import { handleMcp } from "./mcp.js";
import { serveStatic } from "./static.js";

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}

async function readJson(req: IncomingMessage): Promise<any> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : {};
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${HOST}`);
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const method = req.method;

  if (method === "GET" && !url.pathname.startsWith("/api/") && (await serveStatic(url.pathname, res))) return;

  // The tool endpoint for the Claude CLI. Each run's bearer token decides what it may reach.
  if (method === "POST" && url.pathname === "/mcp") {
    return handleMcp(req, res, await readJson(req));
  }

  if (method === "GET" && url.pathname === "/api/providers") {
    return sendJson(res, 200, { providers: await listProviders() });
  }

  // A run goes on in the background. The response is the run id, and the events are read with /api/runs/:id/events.
  if (method === "POST" && url.pathname === "/api/run") {
    const body = await readJson(req);
    return sendJson(res, 202, { runId: startRun({ sessionId: String(body.sessionId ?? ""), prompt: String(body.prompt ?? "") }) });
  }
  if (method === "GET" && parts[0] === "api" && parts[1] === "runs" && parts[3] === "events" && parts.length === 4) {
    return sendJson(res, 200, readRun(parts[2], Number(url.searchParams.get("after") ?? 0)));
  }

  // The memory graph for the dashboard card. Its own path, so a note titled "graph" still opens.
  if (method === "GET" && url.pathname === "/api/graph") return sendJson(res, 200, memoryGraph());

  // Memory: notes shared by all agents. Saving a title that exists replaces that note.
  if (url.pathname === "/api/memory") {
    if (method === "GET") return sendJson(res, 200, { notes: memoryList(url.searchParams.get("q") ?? "") });
    if (method === "POST") {
      const body = await readJson(req);
      return sendJson(res, 200, writeNote(body.title, body.body));
    }
  }
  if (parts[0] === "api" && parts[1] === "memory" && parts.length === 3) {
    const title = parts[2];
    if (method === "GET") {
      const note = readNote(title);
      return note ? sendJson(res, 200, note) : sendJson(res, 404, { error: "no such note" });
    }
    if (method === "DELETE") {
      forgetNote(title);
      return sendJson(res, 200, { ok: true });
    }
  }

  // Personas: the system prompts a chat can use.
  if (url.pathname === "/api/personas") {
    if (method === "GET") return sendJson(res, 200, { personas: allPersonas() });
    if (method === "POST") {
      const body = await readJson(req);
      return sendJson(res, 201, createPersona(body.name, body.systemPrompt));
    }
  }
  if (parts[0] === "api" && parts[1] === "personas" && parts.length === 3) {
    const id = parts[2];
    if (method === "PUT") {
      const body = await readJson(req);
      return sendJson(res, 200, editPersona(id, body.name, body.systemPrompt));
    }
    if (method === "DELETE") {
      removePersona(id);
      return sendJson(res, 200, { ok: true });
    }
  }
  if (parts[0] === "api" && parts[1] === "personas" && parts.length === 4 && parts[3] === "default" && method === "POST") {
    makeDefaultPersona(parts[2]);
    return sendJson(res, 200, { ok: true });
  }

  // Chats: list, create (with a persona), open, rename, and delete.
  if (url.pathname === "/api/sessions") {
    if (method === "GET") return sendJson(res, 200, { sessions: listChats() });
    if (method === "POST") {
      const body = await readJson(req);
      return sendJson(res, 201, createChat(body.providerId, body.personaId));
    }
  }
  if (parts[0] === "api" && parts[1] === "sessions" && parts.length === 3) {
    const id = parts[2];
    if (method === "GET") return sendJson(res, 200, getChat(id));
    if (method === "PATCH") return sendJson(res, 200, await updateChat(id, await readJson(req)));
    if (method === "DELETE") {
      deleteChat(id);
      return sendJson(res, 200, { ok: true });
    }
  }

  // /api/providers/:provider/targets/:target/(sign-in|answer|sign-out)
  if (parts[0] === "api" && parts[1] === "providers" && parts[3] === "targets" && parts.length === 6 && method === "POST") {
    const [, , providerId, , targetId, action] = parts;
    const body = await readJson(req);
    if (action === "sign-in") {
      signIn(providerId, targetId, body.method as SignInMethod);
      return sendJson(res, 202, { started: true });
    }
    if (action === "answer") {
      answerSignIn(providerId, targetId, String(body.answer ?? ""));
      return sendJson(res, 200, { ok: true });
    }
    if (action === "sign-out") {
      await signOut(providerId, targetId);
      return sendJson(res, 200, { ok: true });
    }
  }

  sendJson(res, 404, { error: "not found" });
}

createServer((req, res) => {
  handle(req, res).catch((err: unknown) => {
    if (res.headersSent) return res.end();
    const status = err instanceof AppError ? err.status : 500;
    sendJson(res, status, { error: errorMessage(err) });
  });
}).listen(PORT, HOST, () => {
  console.log(`mip dashboard: http://${HOST}:${PORT}`);
});
