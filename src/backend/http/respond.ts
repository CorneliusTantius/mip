import type { IncomingMessage, ServerResponse } from "node:http";
import { AppError } from "../app/errors.js";

// Requests that run git or npm, or that change the sync account, must be JSON. A page on another site can send a JSON
// request only after a preflight, and this server does not answer preflights, so only the dashboard can reach them.
export function requireJson(req: IncomingMessage): void {
  if (!String(req.headers["content-type"] ?? "").includes("application/json")) {
    throw new AppError(415, "send this request as JSON");
  }
}

// What a route returns: the status code and the JSON body to send.
export interface Reply {
  status: number;
  body: unknown;
}

export const ok = (body: unknown): Reply => ({ status: 200, body });
export const created = (body: unknown): Reply => ({ status: 201, body });
// For work that runs in the background. The body says what was accepted.
export const accepted = (body: unknown): Reply => ({ status: 202, body });
// Most writes with nothing to return answer { ok: true }.
export const ack = (): Reply => ok({ ok: true });
export const notFound = (): Reply => ({ status: 404, body: { error: "not found" } });

// Writes a JSON response. Responses are never cached.
export function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}

// Reads a JSON request body. An empty body reads as an empty object.
export async function readJson(req: IncomingMessage): Promise<Record<string, any>> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : {};
}
