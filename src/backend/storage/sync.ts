import { randomUUID } from "node:crypto";
import { db, type Row } from "./db.js";
import { deleteNote, getNoteByTitle, linksFrom, saveNote, tagsOf } from "./notes.js";
import { deletePersona } from "./personas.js";
import { countAgentsWithPersona, deleteAgent } from "./agents.js";

// The rows GitHub sync reads and writes. Each write keeps the change time it is given, so a record that came from GitHub keeps
// its own time. The app's sync code decides what to write. A remove returns false when the database must keep the row.

export interface PersonaRow {
  id: string;
  name: string;
  systemPrompt: string;
  updatedAt: number;
}

export interface BotRow {
  name: string;
  persona: string;
  providerId: string;
  model: string | null;
  thinking: string | null;
  // Null when the record came from a version without colors.
  color: string | null;
  updatedAt: number;
}

export interface NoteRow {
  title: string;
  body: string;
  links: string[];
  tags: string[];
  updatedAt: number;
}

export interface AgentRow {
  id: string;
  title: string;
  providerId: string;
  personaId: string;
  model: string | null;
  thinking: string | null;
  updatedAt: number;
}

export interface MessageRow {
  createdAt: number;
  role: string;
  text: string;
  tools: string[];
  error: string | null;
}

export interface RoomRow {
  createdAt: number;
  kind: string;
  authorName: string;
  text: string;
}

export function readPersonaRows(): PersonaRow[] {
  return (db.prepare("SELECT id, name, system_prompt, updated_at FROM personas").all() as Row[]).map((row) => ({
    id: row.id,
    name: row.name,
    systemPrompt: row.system_prompt,
    updatedAt: row.updated_at,
  }));
}

// Inserts or updates a persona. The default flag stays local, so each machine keeps its own default.
export function writePersonaRow(persona: PersonaRow): void {
  db.prepare(
    "INSERT INTO personas (id, name, system_prompt, is_default, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, system_prompt = excluded.system_prompt, updated_at = excluded.updated_at",
  ).run(persona.id, persona.name, persona.systemPrompt, persona.updatedAt, persona.updatedAt);
}

// The default persona stays, and so does one an agent still uses. Otherwise the persona is removed.
export function removePersonaRow(id: string): boolean {
  const row = db.prepare("SELECT is_default FROM personas WHERE id = ?").get(id) as Row | undefined;
  if (!row) return true;
  if (row.is_default === 1 || countAgentsWithPersona(id) > 0) return false;
  deletePersona(id);
  return true;
}

export function readBotRows(): BotRow[] {
  return (db.prepare("SELECT name, persona, provider_id, model, thinking, color, updated_at FROM bots").all() as Row[]).map((row) => ({
    name: row.name,
    persona: row.persona,
    providerId: row.provider_id,
    model: row.model ?? null,
    thinking: row.thinking ?? null,
    color: row.color ?? null,
    updatedAt: row.updated_at,
  }));
}

// Bots are found by name, without case. A new bot gets a local id.
export function writeBotRow(bot: BotRow): void {
  const row = db.prepare("SELECT id FROM bots WHERE name = ? COLLATE NOCASE").get(bot.name) as Row | undefined;
  if (row) {
    db.prepare("UPDATE bots SET name = ?, persona = ?, provider_id = ?, model = ?, thinking = ?, color = ?, updated_at = ? WHERE id = ?").run(
      bot.name,
      bot.persona,
      bot.providerId,
      bot.model,
      bot.thinking,
      bot.color,
      bot.updatedAt,
      row.id,
    );
  } else {
    db.prepare("INSERT INTO bots (id, name, persona, provider_id, model, thinking, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      randomUUID(),
      bot.name,
      bot.persona,
      bot.providerId,
      bot.model,
      bot.thinking,
      bot.color,
      bot.updatedAt,
      bot.updatedAt,
    );
  }
}

export function removeBotRow(name: string): boolean {
  db.prepare("DELETE FROM bots WHERE name = ? COLLATE NOCASE").run(name);
  return true;
}

export function readNoteRows(): NoteRow[] {
  return (db.prepare("SELECT id, title, body, updated_at FROM notes").all() as Row[]).map((row) => ({
    title: row.title,
    body: row.body,
    links: linksFrom(row.id),
    tags: tagsOf(row.id),
    updatedAt: row.updated_at,
  }));
}

// Titles are unique without regard to case. A note that exists keeps its local id.
export function writeNoteRow(note: NoteRow): void {
  const existing = getNoteByTitle(note.title);
  saveNote({ id: existing?.id ?? randomUUID(), title: note.title, body: note.body }, note.links, note.tags, note.updatedAt);
}

export function removeNoteRow(title: string): boolean {
  const note = getNoteByTitle(title);
  if (note) deleteNote(note.id);
  return true;
}

export function readAgentRows(): AgentRow[] {
  return (db.prepare("SELECT id, provider_id, persona_id, model, thinking, title, meta_updated_at FROM agents").all() as Row[]).map((row) => ({
    id: row.id,
    providerId: row.provider_id,
    personaId: row.persona_id,
    model: row.model ?? null,
    thinking: row.thinking ?? null,
    title: row.title,
    updatedAt: row.meta_updated_at,
  }));
}

// Inserts or updates an agent's settings. The agent's activity time only moves forward, so the agent list keeps its order.
export function writeAgentRow(agent: AgentRow): void {
  db.prepare(
    `INSERT INTO agents (id, provider_id, persona_id, title, model, thinking, updated_at, meta_updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET provider_id = excluded.provider_id, persona_id = excluded.persona_id, title = excluded.title,
     model = excluded.model, thinking = excluded.thinking, updated_at = MAX(agents.updated_at, excluded.updated_at),
     meta_updated_at = excluded.meta_updated_at`,
  ).run(agent.id, agent.providerId, agent.personaId, agent.title, agent.model, agent.thinking, agent.updatedAt, agent.updatedAt);
}

// An agent that is running stays, so its reply is not lost. Otherwise the agent goes with its messages and runs.
export function removeAgentRow(id: string): boolean {
  if (db.prepare("SELECT 1 FROM runs WHERE agent_id = ? AND status = 'running'").get(id)) return false;
  deleteAgent(id);
  return true;
}

export function readMessageRows(agentId: string): MessageRow[] {
  return (db.prepare("SELECT created_at, role, text, tools, error FROM messages WHERE agent_id = ? ORDER BY created_at, id").all(agentId) as Row[]).map(
    (row) => ({
      createdAt: row.created_at,
      role: row.role,
      text: row.text,
      tools: JSON.parse(row.tools),
      error: row.error ?? null,
    }),
  );
}

export function insertMessageRow(agentId: string, message: MessageRow): void {
  db.prepare("INSERT INTO messages (agent_id, role, text, tools, error, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    agentId,
    message.role,
    message.text,
    JSON.stringify(message.tools),
    message.error,
    message.createdAt,
  );
}

export function readRoomRows(): RoomRow[] {
  return (db.prepare("SELECT kind, author_name, text, created_at FROM room_messages ORDER BY id").all() as Row[]).map((row) => ({
    kind: row.kind,
    authorName: row.author_name,
    text: row.text,
    createdAt: row.created_at,
  }));
}

// A room message is only ever added. A bot's message is linked to the local bot with the same name, if there is one.
export function insertRoomRow(message: RoomRow): void {
  db.prepare("INSERT INTO room_messages (kind, bot_id, author_name, text, created_at) VALUES (?, (SELECT id FROM bots WHERE name = ? COLLATE NOCASE), ?, ?, ?)").run(
    message.kind,
    message.authorName,
    message.authorName,
    message.text,
    message.createdAt,
  );
}
