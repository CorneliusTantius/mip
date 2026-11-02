import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { SLACK_CACHE_FILE } from "../../storage/paths.js";

// Slack answers kept on this machine, so a reload shows them without calling Slack again. Each entry records when it was fetched. A read
// older than its time to live is fetched again, unless the caller forces a fetch. The file is a cache, so sync does not carry it.
// shortcut: no size limit, so every channel read adds to the file; prune old entries once it grows large.

interface Entry {
  at: number;
  value: unknown;
}

let entries: Record<string, Entry> | undefined;

// Returns the cached value for key, or loads it and keeps the result. A failed load keeps nothing, so the error reaches the caller.
export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>, force = false): Promise<T> {
  const store = all();
  const hit = store[key];
  if (!force && hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await load();
  store[key] = { at: Date.now(), value };
  writeFileSync(SLACK_CACHE_FILE, JSON.stringify(store), { mode: 0o600 });
  return value;
}

// Drops every entry whose key starts with one of the prefixes, so a disconnected account leaves nothing behind.
export function forgetCache(prefixes: string[]): void {
  const store = all();
  for (const key of Object.keys(store)) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) delete store[key];
  }
  writeFileSync(SLACK_CACHE_FILE, JSON.stringify(store), { mode: 0o600 });
}

function all(): Record<string, Entry> {
  if (entries) return entries;
  try {
    entries = existsSync(SLACK_CACHE_FILE) ? (JSON.parse(readFileSync(SLACK_CACHE_FILE, "utf8")) as Record<string, Entry>) : {};
  } catch {
    entries = {};
  }
  return entries;
}
