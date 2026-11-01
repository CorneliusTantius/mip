import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Credential, ModelsStoreEntry } from "@earendil-works/pi-ai";
import { db, type Row } from "./db.js";
import { PI_AGENT_DIR } from "./paths.js";

// Pi's own data, kept in mip's data folder so it can sync: the credentials and model catalogs are rows, and settings.json and
// models.json are files in Pi's agent folder. Each row has the time it changed, which sync uses to pick the newer copy.

export interface PiCredentialRow {
  providerId: string;
  credential: Credential;
  updatedAt: number;
}

export interface PiModelRow {
  providerId: string;
  entry: ModelsStoreEntry;
  updatedAt: number;
}

// The Pi config files that sync. Only these names are read or written, so a name from the repo cannot reach any other file.
export const PI_CONFIG_FILES = ["settings.json", "models.json"] as const;
export type PiConfigFile = (typeof PI_CONFIG_FILES)[number];

export function readPiCredentialRows(): PiCredentialRow[] {
  return (db.prepare("SELECT provider_id, credential, updated_at FROM pi_credentials ORDER BY provider_id").all() as Row[]).map(toCredentialRow);
}

export function readPiCredentialRow(providerId: string): PiCredentialRow | undefined {
  const row = db.prepare("SELECT provider_id, credential, updated_at FROM pi_credentials WHERE provider_id = ?").get(providerId) as Row | undefined;
  return row ? toCredentialRow(row) : undefined;
}

// Writes a credential with the change time it was given. Sync passes the time the record already has, so an equal copy stays equal.
export function writePiCredentialRow(row: PiCredentialRow): void {
  db.prepare("INSERT OR REPLACE INTO pi_credentials (provider_id, credential, updated_at) VALUES (?, ?, ?)").run(
    row.providerId,
    JSON.stringify(row.credential),
    row.updatedAt,
  );
}

export function removePiCredentialRow(providerId: string): boolean {
  db.prepare("DELETE FROM pi_credentials WHERE provider_id = ?").run(providerId);
  return true;
}

export function readPiModelRows(): PiModelRow[] {
  return (db.prepare("SELECT provider_id, entry, updated_at FROM pi_models ORDER BY provider_id").all() as Row[]).map(toModelRow);
}

export function readPiModelRow(providerId: string): PiModelRow | undefined {
  const row = db.prepare("SELECT provider_id, entry, updated_at FROM pi_models WHERE provider_id = ?").get(providerId) as Row | undefined;
  return row ? toModelRow(row) : undefined;
}

export function writePiModelRow(row: PiModelRow): void {
  db.prepare("INSERT OR REPLACE INTO pi_models (provider_id, entry, updated_at) VALUES (?, ?, ?)").run(row.providerId, JSON.stringify(row.entry), row.updatedAt);
}

export function removePiModelRow(providerId: string): boolean {
  db.prepare("DELETE FROM pi_models WHERE provider_id = ?").run(providerId);
  return true;
}

// A small setting kept by the app, such as whether the one-time import of Pi's auth file has run.
export function readPiState(key: string): string | undefined {
  const row = db.prepare("SELECT value FROM pi_state WHERE key = ?").get(key) as Row | undefined;
  return row?.value as string | undefined;
}

export function writePiState(key: string, value: string): void {
  db.prepare("INSERT OR REPLACE INTO pi_state (key, value) VALUES (?, ?)").run(key, value);
}

// The text of one Pi config file, or undefined when Pi's folder has no such file.
export function readPiConfigFile(name: PiConfigFile): string | undefined {
  const path = join(PI_AGENT_DIR, name);
  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}

export function writePiConfigFile(name: PiConfigFile, text: string): void {
  writeFileSync(join(PI_AGENT_DIR, name), text);
}

export function removePiConfigFile(name: PiConfigFile): boolean {
  rmSync(join(PI_AGENT_DIR, name), { force: true });
  return true;
}

function toCredentialRow(row: Row): PiCredentialRow {
  return { providerId: row.provider_id as string, credential: JSON.parse(row.credential as string) as Credential, updatedAt: row.updated_at as number };
}

function toModelRow(row: Row): PiModelRow {
  return { providerId: row.provider_id as string, entry: JSON.parse(row.entry as string) as ModelsStoreEntry, updatedAt: row.updated_at as number };
}
