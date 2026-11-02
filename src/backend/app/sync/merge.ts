import { createHash } from "node:crypto";
import type { Credential, ModelsStoreEntry } from "@earendil-works/pi-ai";
import type { Ask } from "../../storage/agents.js";
import type { MailAccount } from "../mail/accounts.js";
import type { McpServerEntry } from "../mcp/config.js";

// The data GitHub sync keeps, in the form the dotmip repo stores it. Records hold no local ids, so two machines can share them.
// Each record has a change time, which decides the winner when both sides edited it. Pure: no database and no git.

export interface PersonaRecord {
  id: string;
  name: string;
  systemPrompt: string;
  updatedAt: number;
}

export interface BotRecord {
  name: string;
  persona: string;
  providerId: string;
  model: string | null;
  thinking: string | null;
  // Null in a record written before colors existed.
  color: string | null;
  updatedAt: number;
}

export interface NoteRecord {
  title: string;
  body: string;
  links: string[];
  tags: string[];
  updatedAt: number;
}

export interface MessageRecord {
  createdAt: number;
  role: string;
  text: string;
  tools: string[];
  error: string | null;
  // The question the reply ends with, or null. A record written before questions existed has none.
  ask: Ask | null;
}

// An agent's settings, and its messages. Messages are never edited, so both sides' messages are kept.
export interface AgentRecord {
  id: string;
  title: string;
  providerId: string;
  personaId: string;
  model: string | null;
  thinking: string | null;
  // Whether bots may send tasks to the agent.
  openToBots: boolean;
  updatedAt: number;
  messages: MessageRecord[];
}

// A room's name and members, by bot name. Rooms are found by id, which every machine shares.
export interface RoomRecord {
  id: string;
  name: string;
  bots: string[];
  updatedAt: number;
}

// One message in a room. Messages are never edited, so both sides' messages are kept.
export interface RoomMessageRecord {
  room: string;
  createdAt: number;
  kind: string;
  authorName: string;
  text: string;
}

// One MCP server from mcp.json, with its tokens and environment values. It has no change time (the file does not keep one).
export type McpServerRecord = McpServerEntry;

// One mail account from mail.json, with its app password. It has no change time, so GitHub's copy wins when both sides changed it.
export type MailRecord = MailAccount;

// Pi's credential for one provider, with the time it changed. The newer copy wins when both sides changed it.
export interface PiCredentialRecord {
  providerId: string;
  credential: Credential;
  updatedAt: number;
}

// Pi's model catalog for one provider, with the time it was stored.
export interface PiModelRecord {
  providerId: string;
  entry: ModelsStoreEntry;
  updatedAt: number;
}

// One Pi config file, by name, with its text. A file has no change time, so GitHub's copy wins when both sides changed it.
export interface PiFileRecord {
  name: string;
  text: string;
}

// The whole synced state. Each part maps a record's key to the record. The keys are in keyOf below.
export interface Snapshot {
  personas: Record<string, PersonaRecord>;
  bots: Record<string, BotRecord>;
  notes: Record<string, NoteRecord>;
  agents: Record<string, AgentRecord>;
  rooms: Record<string, RoomRecord>;
  room: Record<string, RoomMessageRecord>;
  mcp: Record<string, McpServerRecord>;
  mail: Record<string, MailRecord>;
  piCredentials: Record<string, PiCredentialRecord>;
  piModels: Record<string, PiModelRecord>;
  piFiles: Record<string, PiFileRecord>;
}

export const PARTS = ["personas", "bots", "notes", "agents", "rooms", "room", "mcp", "mail", "piCredentials", "piModels", "piFiles"] as const;

export function emptySnapshot(): Snapshot {
  return { personas: {}, bots: {}, notes: {}, agents: {}, rooms: {}, room: {}, mcp: {}, mail: {}, piCredentials: {}, piModels: {}, piFiles: {} };
}

export function isEmptySnapshot(snapshot: Snapshot): boolean {
  return PARTS.every((part) => Object.keys(snapshot[part]).length === 0);
}

// A snapshot saved before the rename kept its agents under chats. The other parts did not change name.
export function snapshotFromSaved(saved: Partial<Snapshot> & { chats?: Snapshot["agents"] }): Snapshot {
  return { ...emptySnapshot(), ...saved, agents: saved.agents ?? saved.chats ?? {} };
}

// The key that identifies a record on every machine. Bots and notes are keyed by name, without case, as the database does.
// A message is keyed by when it was sent, its role, and a hash of its text. Room messages are keyed the same way, plus the room and the author.
export const keyOf = {
  persona: (persona: PersonaRecord) => persona.id,
  bot: (bot: BotRecord) => bot.name.toLowerCase(),
  note: (note: NoteRecord) => note.title.toLowerCase(),
  agent: (agent: AgentRecord) => agent.id,
  message: (message: MessageRecord) => `${message.createdAt}:${message.role}:${digest(message.text)}`,
  room: (room: RoomRecord) => room.id,
  roomMessage: (message: RoomMessageRecord) =>
    `${message.room}:${message.createdAt}:${message.kind}:${message.authorName}:${digest(message.text)}`,
  mcp: (server: McpServerRecord) => server.name,
  mail: (account: MailRecord) => account.id,
  piCredential: (credential: PiCredentialRecord) => credential.providerId,
  piModel: (model: PiModelRecord) => model.providerId,
  piFile: (file: PiFileRecord) => file.name,
};

function digest(text: string): string {
  return createHash("sha1").update(text).digest("hex").slice(0, 12);
}

export function indexBy<T>(records: T[], key: (record: T) => string): Record<string, T> {
  return Object.fromEntries(records.map((record) => [key(record), record]));
}

// Sorts object keys at every depth, so equal records always serialize the same way.
export function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(object).sort().map((key) => [key, sortKeys(object[key])]));
  }
  return value;
}

// Whether two records hold the same data. A missing record equals only another missing one.
export function sameRecord(a: unknown, b: unknown): boolean {
  if (a === undefined || b === undefined) return a === b;
  return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
}

// Both lists' messages, each once, oldest first.
export function unionMessages(a: MessageRecord[], b: MessageRecord[]): MessageRecord[] {
  const byKey = new Map<string, MessageRecord>();
  for (const message of [...a, ...b]) byKey.set(keyOf.message(message), message);
  return [...byKey.entries()].sort(([keyA, a], [keyB, b]) => a.createdAt - b.createdAt || keyA.localeCompare(keyB)).map(([, message]) => message);
}

// The later change time wins. A tie goes to GitHub's copy, so both sides end up the same.
function newer<T extends { updatedAt: number }>(local: T, remote: T): T {
  return local.updatedAt > remote.updatedAt ? local : remote;
}

// Pi's credentials and model catalogs have change times, so the newer copy wins, as for a bot or a note.
const piCredentialKind: Kind<PiCredentialRecord> = {
  name: "Pi credential",
  label: (credential) => credential.providerId,
  combine: (local, remote) => [newer(local, remote), `Pi credential "${local.providerId}" was changed on both sides; kept the newer one`],
};

const piModelKind: Kind<PiModelRecord> = {
  name: "Pi model catalog",
  label: (model) => model.providerId,
  combine: (local, remote) => [newer(local, remote), `Pi model catalog "${local.providerId}" was changed on both sides; kept the newer one`],
};

// A Pi config file has no change time, so when both sides changed it, GitHub's copy is kept.
const piFileKind: Kind<PiFileRecord> = {
  name: "Pi file",
  label: (file) => file.name,
  combine: (local, remote) => [remote, `Pi file "${local.name}" was changed on both sides; kept the copy on GitHub`],
};

// An MCP server has no change time, so when both sides changed it, GitHub's copy is kept. The sync log says so, and a server edited on
// one side only is merged as usual.
const mcpKind: Kind<McpServerRecord> = {
  name: "MCP server",
  label: (server) => server.name,
  combine: (local, remote) => [remote, `MCP server "${local.name}" was changed on both sides; kept the copy on GitHub`],
};

// A mail account has no change time either, so when both sides changed it, GitHub's copy is kept. The sync log says so.
const mailKind: Kind<MailRecord> = {
  name: "mail account",
  label: (account) => account.label,
  combine: (local, remote) => [remote, `mail account "${local.label}" was changed on both sides; kept the copy on GitHub`],
};

// How one part is merged: its name for the sync log, a label for a record, and how two edits of one record are combined.
interface Kind<T> {
  name: string;
  label: (record: T) => string;
  combine: (local: T, remote: T) => [T, string];
}

const personaKind: Kind<PersonaRecord> = {
  name: "persona",
  label: (persona) => persona.name,
  combine: (local, remote) => [newer(local, remote), `persona "${local.name}" was edited on both sides; kept the newer edit`],
};

const botKind: Kind<BotRecord> = {
  name: "bot",
  label: (bot) => bot.name,
  combine: (local, remote) => [newer(local, remote), `bot "${local.name}" was edited on both sides; kept the newer edit`],
};

const noteKind: Kind<NoteRecord> = {
  name: "note",
  label: (note) => note.title,
  combine: (local, remote) => [newer(local, remote), `note "${local.title}" was edited on both sides; kept the newer edit`],
};

const roomKind: Kind<RoomRecord> = {
  name: "room",
  label: (room) => room.name,
  combine: (local, remote) => [newer(local, remote), `room "${local.name}" was edited on both sides; kept the newer edit`],
};

// An agent keeps the newer settings. Its messages from both sides are kept, so nothing said in either copy is lost.
const agentKind: Kind<AgentRecord> = {
  name: "agent",
  label: (agent) => agent.title || "New agent",
  combine: (local, remote) => [
    { ...newer(local, remote), messages: unionMessages(local.messages, remote.messages) },
    `agent "${local.title || "New agent"}" was changed on both sides; kept the newer settings and merged the messages`,
  ],
};

// Merges one part. base is what both sides last agreed on, so a record changed on one side only takes that side's version.
// When both sides changed it, an edit beats a delete, and combine decides between two edits.
function mergeKind<T>(kind: Kind<T>, base: Record<string, T>, local: Record<string, T>, remote: Record<string, T>, notes: string[]): Record<string, T> {
  const merged: Record<string, T> = {};
  for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) {
    const b = base[key];
    const l = local[key];
    const r = remote[key];
    let value: T | undefined;
    if (sameRecord(l, r)) value = l;
    else if (sameRecord(l, b)) value = r;
    else if (sameRecord(r, b)) value = l;
    else if (l === undefined || r === undefined) {
      const kept = (l ?? r) as T;
      value = kept;
      notes.push(`${kind.name} "${kind.label(kept)}" was edited on one side and deleted on the other; kept the edit`);
    } else {
      const [combined, note] = kind.combine(l, r);
      value = combined;
      notes.push(note);
    }
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}

// Merges three snapshots. base is the state both sides last synced, local is this machine's data, remote is GitHub's copy.
// Returns the merged state, and a note for each record the two sides changed differently.
export function mergeSnapshots(base: Snapshot, local: Snapshot, remote: Snapshot): { merged: Snapshot; notes: string[] } {
  const notes: string[] = [];
  const rooms = mergeKind(roomKind, base.rooms, local.rooms, remote.rooms, notes);
  // Room messages are never edited, so both sides' messages are kept. A room that is gone takes its messages with it.
  const messages = { ...remote.room, ...local.room };
  const merged: Snapshot = {
    personas: mergeKind(personaKind, base.personas, local.personas, remote.personas, notes),
    bots: mergeKind(botKind, base.bots, local.bots, remote.bots, notes),
    notes: mergeKind(noteKind, base.notes, local.notes, remote.notes, notes),
    agents: mergeKind(agentKind, base.agents, local.agents, remote.agents, notes),
    rooms,
    room: Object.fromEntries(Object.entries(messages).filter(([, message]) => rooms[message.room] !== undefined)),
    mcp: mergeKind(mcpKind, base.mcp, local.mcp, remote.mcp, notes),
    mail: mergeKind(mailKind, base.mail, local.mail, remote.mail, notes),
    piCredentials: mergeKind(piCredentialKind, base.piCredentials, local.piCredentials, remote.piCredentials, notes),
    piModels: mergeKind(piModelKind, base.piModels, local.piModels, remote.piModels, notes),
    piFiles: mergeKind(piFileKind, base.piFiles, local.piFiles, remote.piFiles, notes),
  };
  return { merged, notes };
}

// How many records differ between two snapshots. A sync reports this, so the user sees what moved.
export function countChanges(a: Snapshot, b: Snapshot): number {
  let count = 0;
  for (const part of PARTS) {
    const x = a[part] as Record<string, unknown>;
    const y = b[part] as Record<string, unknown>;
    for (const key of new Set([...Object.keys(x), ...Object.keys(y)])) {
      if (!sameRecord(x[key], y[key])) count++;
    }
  }
  return count;
}
