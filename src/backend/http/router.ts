import type { IncomingMessage } from "node:http";
import type { Reply } from "./respond.js";

// What a route handler receives: the request, the parsed URL, and the values captured from the path.
export interface RouteContext {
  req: IncomingMessage;
  url: URL;
  params: Record<string, string>;
}

export type Handler = (ctx: RouteContext) => Reply | Promise<Reply>;

export interface Route {
  method: string;
  // A path such as "/api/bots/:botId". A segment that starts with ":" matches any one segment and is named in params.
  path: string;
  handle: Handler;
}

const route = (method: string) => (path: string, handle: Handler): Route => ({ method, path, handle });
export const get = route("GET");
export const post = route("POST");
export const put = route("PUT");
export const patch = route("PATCH");
export const del = route("DELETE");

// The first route whose method and path both match, with its captured params. Segments are decoded before they are compared.
export function matchRoute(routes: Route[], method: string, pathname: string): { route: Route; params: Record<string, string> } | undefined {
  const segments = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  for (const candidate of routes) {
    if (candidate.method !== method) continue;
    const pattern = candidate.path.split("/").filter(Boolean);
    if (pattern.length !== segments.length) continue;

    const params: Record<string, string> = {};
    const matched = pattern.every((part, i) => {
      if (part.startsWith(":")) {
        params[part.slice(1)] = segments[i];
        return true;
      }
      return part === segments[i];
    });
    if (matched) return { route: candidate, params };
  }
  return undefined;
}
