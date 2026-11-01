import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { DATA_DIR, DEVICE_ID_FILE } from "../storage/paths.js";

// The shape OpenAI's sign-in accepts for a device ID.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// This installation's device ID. A provider such as OpenAI's ChatGPT sign-in identifies each installation by one. It is made the first
// time it is asked for, and kept in the data folder. It is not synced, so each machine has its own.
let cached: string | undefined;

export function installationId(): string {
  if (cached) return cached;
  if (existsSync(DEVICE_ID_FILE)) {
    const saved = readFileSync(DEVICE_ID_FILE, "utf8").trim();
    if (UUID.test(saved)) return (cached = saved.toLowerCase());
  }
  // No saved ID, or one that is not a UUID: make a new one, and keep it.
  mkdirSync(DATA_DIR, { recursive: true });
  const id = randomUUID();
  writeFileSync(DEVICE_ID_FILE, `${id}\n`);
  return (cached = id);
}
