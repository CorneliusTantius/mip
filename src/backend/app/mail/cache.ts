import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { MAIL_CACHE_FILE } from "../../storage/paths.js";
import type { MailHeader } from "./messages.js";

// The newest message headers of each account, as the last sync left them, newest first. A sync adds what is new and drops what the server
// removed, so a reload asks the server only for changes. Headers only, no bodies. It is a copy of the mailbox, so sync does not carry it.

export interface CachedMailbox {
  uidValidity: number;
  messages: MailHeader[];
}

export function readMailCache(): Record<string, CachedMailbox> {
  if (!existsSync(MAIL_CACHE_FILE)) return {};
  try {
    return JSON.parse(readFileSync(MAIL_CACHE_FILE, "utf8")) as Record<string, CachedMailbox>;
  } catch {
    // A cache that cannot be read is empty; the next sync fills it again.
    return {};
  }
}

export function saveMailbox(id: string, mailbox: CachedMailbox): void {
  const all = readMailCache();
  all[id] = mailbox;
  writeFileSync(MAIL_CACHE_FILE, JSON.stringify(all), { mode: 0o600 });
}

// Forgets an account's cached headers, when the account is removed.
export function dropMailbox(id: string): void {
  const all = readMailCache();
  if (!(id in all)) return;
  delete all[id];
  writeFileSync(MAIL_CACHE_FILE, JSON.stringify(all), { mode: 0o600 });
}
