import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Credential, CredentialInfo, CredentialStore, ModelsStore, ModelsStoreEntry } from "@earendil-works/pi-ai";
import {
  readPiCredentialRow,
  readPiCredentialRows,
  readPiModelRow,
  readPiState,
  removePiCredentialRow,
  removePiModelRow,
  writePiCredentialRow,
  writePiModelRow,
  writePiState,
} from "../../storage/pi.js";

// Pi's credentials and model catalogs, kept in mip's database so they can sync. Pi reads and writes them through the two stores below.

// Where the Pi CLI keeps its credentials. mip imports this file once, and leaves it as it is.
export const LEGACY_PI_AUTH = join(homedir(), ".pi", "agent", "auth.json");
const IMPORTED_KEY = "pi-auth-imported";

// One credential per provider. Writes for one provider run one after another, so an OAuth refresh cannot race another write.
export class DbCredentialStore implements CredentialStore {
  private chains = new Map<string, Promise<unknown>>();

  async read(providerId: string): Promise<Credential | undefined> {
    return readPiCredentialRow(providerId)?.credential;
  }

  async list(): Promise<readonly CredentialInfo[]> {
    return readPiCredentialRows().map((row) => ({ providerId: row.providerId, type: row.credential.type }));
  }

  // The only write path. The function sees the current credential, and returns the new one, or undefined to leave it unchanged.
  modify(providerId: string, fn: (current: Credential | undefined) => Promise<Credential | undefined>): Promise<Credential | undefined> {
    return this.serialize(providerId, async () => {
      const current = readPiCredentialRow(providerId)?.credential;
      const next = await fn(current);
      if (next === undefined) return current;
      writePiCredentialRow({ providerId, credential: next, updatedAt: Date.now() });
      return next;
    });
  }

  delete(providerId: string): Promise<void> {
    return this.serialize(providerId, async () => {
      removePiCredentialRow(providerId);
    });
  }

  // Runs the tasks for one provider in order. A task that fails does not stop the ones after it.
  private serialize<T>(providerId: string, task: () => Promise<T>): Promise<T> {
    const run = (this.chains.get(providerId) ?? Promise.resolve()).then(task);
    this.chains.set(providerId, run.catch(() => undefined));
    return run;
  }
}

// The model catalogs, one per provider.
export class DbModelsStore implements ModelsStore {
  async read(providerId: string): Promise<ModelsStoreEntry | undefined> {
    return readPiModelRow(providerId)?.entry;
  }

  async write(providerId: string, entry: ModelsStoreEntry): Promise<void> {
    writePiModelRow({ providerId, entry, updatedAt: Date.now() });
  }

  async delete(providerId: string): Promise<void> {
    removePiModelRow(providerId);
  }
}

// Imports Pi's auth file the first time mip starts. The credentials are copied only when the table is empty, and the import runs once:
// later starts do not import again, even after every credential has been removed. The file itself is left as it is.
export function importLegacyPiAuth(path: string = LEGACY_PI_AUTH): number {
  if (readPiState(IMPORTED_KEY) !== undefined) return 0;
  let count = 0;
  if (readPiCredentialRows().length === 0 && existsSync(path)) {
    const data = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    for (const [providerId, credential] of Object.entries(data)) {
      if (!isCredential(credential)) continue;
      writePiCredentialRow({ providerId, credential, updatedAt: Date.now() });
      count++;
    }
  }
  writePiState(IMPORTED_KEY, new Date().toISOString());
  return count;
}

function isCredential(value: unknown): value is Credential {
  const type = (value as { type?: unknown } | null)?.type;
  return type === "api_key" || type === "oauth";
}
