import type { ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The Vite build of src/frontend lands in dist/frontend. This file compiles to dist/backend/http/static.js.
const WEB_DIR = fileURLToPath(new URL("../../frontend/", import.meta.url));
const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

// Serves a file from the web build. Returns false when there is no such file.
export async function serveStatic(pathname: string, res: ServerResponse): Promise<boolean> {
  const file = resolve(WEB_DIR, pathname === "/" ? "index.html" : "." + pathname);
  // Keep requests inside the build folder.
  if (!file.startsWith(WEB_DIR)) return false;
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": CONTENT_TYPES[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" });
    res.end(body);
    return true;
  } catch {
    return false;
  }
}
