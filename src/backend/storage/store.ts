import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DATA_DIR, ensureMipDirs } from "./paths.js";

// One SQLite file holds personas, chats, messages, and runs. Provider files (Claude, Pi) stay in their own folders.
ensureMipDirs();
const db = new DatabaseSync(join(DATA_DIR, "mip.db"));
db.exec(`
  CREATE TABLE IF NOT EXISTS personas (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    provider_session_id TEXT,
    persona_id TEXT NOT NULL DEFAULT 'default',
    title TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    text TEXT NOT NULL,
    tools TEXT NOT NULL DEFAULT '[]',
    error TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL UNIQUE COLLATE NOCASE,
    body TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(title, body, note_id UNINDEXED);
  CREATE TABLE IF NOT EXISTS note_links (
    from_id TEXT NOT NULL,
    to_title TEXT NOT NULL COLLATE NOCASE,
    PRIMARY KEY (from_id, to_title)
  );
  CREATE TABLE IF NOT EXISTS note_tags (
    note_id TEXT NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY (note_id, tag)
  );
  CREATE TABLE IF NOT EXISTS run_events (
    run_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    event TEXT NOT NULL,
    PRIMARY KEY (run_id, seq)
  );
  CREATE TABLE IF NOT EXISTS bots (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    persona TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    model TEXT,
    thinking TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS room_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    bot_id TEXT,
    author_name TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS repos (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    url TEXT NOT NULL,
    status TEXT NOT NULL,
    error TEXT,
    created_at INTEGER NOT NULL
  );
`);

type Row = Record<string, any>;

// A run cut off by a server restart can't finish, so it is marked as failed. The same goes for clones.
db.prepare("UPDATE runs SET status = 'error' WHERE status = 'running'").run();
db.prepare("UPDATE repos SET status = 'error', error = 'interrupted by a server restart' WHERE status = 'cloning'").run();

// Databases made before personas have no persona column. Their chats get the default persona.
if (!(db.prepare("PRAGMA table_info(sessions)").all() as Row[]).some((c) => c.name === "persona_id")) {
  db.exec("ALTER TABLE sessions ADD COLUMN persona_id TEXT NOT NULL DEFAULT 'default'");
}
if (!(db.prepare("PRAGMA table_info(personas)").all() as Row[]).some((c) => c.name === "is_default")) {
  db.exec("ALTER TABLE personas ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0");
}
// Databases made before per-chat model and thinking settings. Their chats use the provider's defaults.
for (const column of ["model", "thinking"]) {
  if (!(db.prepare("PRAGMA table_info(sessions)").all() as Row[]).some((c) => c.name === column)) {
    db.exec(`ALTER TABLE sessions ADD COLUMN ${column} TEXT`);
  }
}

export interface Persona {
  id: string;
  name: string;
  systemPrompt: string;
  // New chats start with the default persona. Exactly one persona is the default.
  isDefault: boolean;
}

type PersonaFields = Omit<Persona, "isDefault">;

export interface Session {
  id: string;
  providerId: string;
  // The provider's own session id, used to resume its conversation.
  providerSessionId: string | null;
  // Chosen when the chat is created, and kept for the chat's life.
  personaId: string;
  // The model and thinking level the chat uses. Null means the provider's default. Changes apply to the next message.
  model: string | null;
  thinking: string | null;
  // The agent's name, given when the chat is created. Renaming changes it.
  title: string;
  updatedAt: number;
}

export interface Message {
  role: "user" | "assistant";
  text: string;
  tools: string[];
  error: string | null;
}

function toPersona(row: Row): Persona {
  return { id: row.id, name: row.name, systemPrompt: row.system_prompt, isDefault: row.is_default === 1 };
}

function toSession(row: Row): Session {
  return {
    id: row.id,
    providerId: row.provider_id,
    providerSessionId: row.provider_session_id,
    personaId: row.persona_id,
    model: row.model ?? null,
    thinking: row.thinking ?? null,
    title: row.title,
    updatedAt: row.updated_at,
  };
}

export function listPersonas(): Persona[] {
  return (db.prepare("SELECT * FROM personas ORDER BY created_at").all() as Row[]).map(toPersona);
}

export function getPersona(id: string): Persona | undefined {
  const row = db.prepare("SELECT * FROM personas WHERE id = ?").get(id) as Row | undefined;
  return row && toPersona(row);
}

export function insertPersona(persona: PersonaFields): void {
  db.prepare("INSERT INTO personas (id, name, system_prompt, is_default, created_at) VALUES (?, ?, ?, 0, ?)").run(persona.id, persona.name, persona.systemPrompt, Date.now());
}

export function updatePersona(persona: PersonaFields): void {
  db.prepare("UPDATE personas SET name = ?, system_prompt = ? WHERE id = ?").run(persona.name, persona.systemPrompt, persona.id);
}

// Marks one persona as the default and clears the mark from the rest.
export function setDefaultPersona(id: string): void {
  db.prepare("UPDATE personas SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END").run(id);
}

export function deletePersona(id: string): void {
  db.prepare("DELETE FROM personas WHERE id = ?").run(id);
}

export function countSessionsWithPersona(id: string): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE persona_id = ?").get(id) as Row).n;
}

export function createSession(providerId: string, personaId: string, title: string): Session {
  const id = randomUUID();
  db.prepare("INSERT INTO sessions (id, provider_id, persona_id, title, updated_at) VALUES (?, ?, ?, ?, ?)").run(id, providerId, personaId, title, Date.now());
  return getSession(id)!;
}

export function listSessions(): Session[] {
  return (db.prepare("SELECT * FROM sessions ORDER BY updated_at DESC").all() as Row[]).map(toSession);
}

export function getSession(id: string): Session | undefined {
  const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as Row | undefined;
  return row && toSession(row);
}

export function listMessages(sessionId: string): Message[] {
  const rows = db.prepare("SELECT role, text, tools, error FROM messages WHERE session_id = ? ORDER BY id").all(sessionId) as Row[];
  return rows.map((row) => ({ role: row.role, text: row.text, tools: JSON.parse(row.tools), error: row.error }));
}

export function addMessage(sessionId: string, message: Message): void {
  db.prepare("INSERT INTO messages (session_id, role, text, tools, error, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    sessionId,
    message.role,
    message.text,
    JSON.stringify(message.tools),
    message.error,
    Date.now(),
  );
}

export function renameSession(id: string, title: string): void {
  db.prepare("UPDATE sessions SET title = ? WHERE id = ?").run(title, id);
}

export function setSessionSettings(id: string, model: string | null, thinking: string | null): void {
  db.prepare("UPDATE sessions SET model = ?, thinking = ? WHERE id = ?").run(model, thinking, id);
}

// Removes the session with its messages and runs. Provider files (Claude, Pi) are left alone.
export function deleteSession(id: string): void {
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM run_events WHERE run_id IN (SELECT id FROM runs WHERE session_id = ?)").run(id);
    db.prepare("DELETE FROM runs WHERE session_id = ?").run(id);
    db.prepare("DELETE FROM messages WHERE session_id = ?").run(id);
    db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function createRun(id: string, sessionId: string): void {
  db.prepare("INSERT INTO runs (id, session_id, status, started_at) VALUES (?, ?, 'running', ?)").run(id, sessionId, Date.now());
}

export function getRun(id: string): { id: string; status: string } | undefined {
  return db.prepare("SELECT id, status FROM runs WHERE id = ?").get(id) as { id: string; status: string } | undefined;
}

// The run still going in a chat, if there is one. A chat has at most one.
export function activeRunForSession(sessionId: string): { id: string } | undefined {
  return db.prepare("SELECT id FROM runs WHERE session_id = ? AND status = 'running'").get(sessionId) as { id: string } | undefined;
}

export function setRunStatus(id: string, status: "done" | "error"): void {
  db.prepare("UPDATE runs SET status = ? WHERE id = ?").run(status, id);
}

export function appendRunEvent(runId: string, seq: number, event: unknown): void {
  db.prepare("INSERT INTO run_events (run_id, seq, event) VALUES (?, ?, ?)").run(runId, seq, JSON.stringify(event));
}

// Events after a sequence number, in order, so a client can pick up where it stopped.
export function listRunEvents(runId: string, after: number): { seq: number; event: unknown }[] {
  const rows = db.prepare("SELECT seq, event FROM run_events WHERE run_id = ? AND seq > ? ORDER BY seq").all(runId, after) as Row[];
  return rows.map((row) => ({ seq: row.seq, event: JSON.parse(row.event) }));
}

// Memory: notes shared by every agent. Links and tags are kept in their own tables, so a note can be found from either side.
export interface Note {
  id: string;
  title: string;
  body: string;
}

export function getNoteByTitle(title: string): Note | undefined {
  const row = db.prepare("SELECT id, title, body FROM notes WHERE title = ?").get(title) as Row | undefined;
  return row && { id: row.id, title: row.title, body: row.body };
}

// Saves a note, and rebuilds its search entry, links, and tags in one step.
export function saveNote(note: Note, links: string[], tags: string[]): void {
  db.exec("BEGIN");
  try {
    db.prepare(
      "INSERT INTO notes (id, title, body, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title = excluded.title, body = excluded.body, updated_at = excluded.updated_at",
    ).run(note.id, note.title, note.body, Date.now());
    db.prepare("DELETE FROM notes_fts WHERE note_id = ?").run(note.id);
    db.prepare("INSERT INTO notes_fts (title, body, note_id) VALUES (?, ?, ?)").run(note.title, note.body, note.id);
    db.prepare("DELETE FROM note_links WHERE from_id = ?").run(note.id);
    for (const target of links) db.prepare("INSERT OR IGNORE INTO note_links (from_id, to_title) VALUES (?, ?)").run(note.id, target);
    db.prepare("DELETE FROM note_tags WHERE note_id = ?").run(note.id);
    for (const tag of tags) db.prepare("INSERT OR IGNORE INTO note_tags (note_id, tag) VALUES (?, ?)").run(note.id, tag);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

// Every note, newest first, without bodies.
export function listNotes(): { id: string; title: string; updatedAt: number }[] {
  return (db.prepare("SELECT id, title, updated_at FROM notes ORDER BY updated_at DESC").all() as Row[]).map((row) => ({
    id: row.id,
    title: row.title,
    updatedAt: row.updated_at,
  }));
}

// Removes a note with its search entry, links, and tags. Links from other notes to its title stay, as in Obsidian.
export function deleteNote(id: string): void {
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM notes_fts WHERE note_id = ?").run(id);
    db.prepare("DELETE FROM note_links WHERE from_id = ?").run(id);
    db.prepare("DELETE FROM note_tags WHERE note_id = ?").run(id);
    db.prepare("DELETE FROM notes WHERE id = ?").run(id);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

// Full-text search over titles and bodies. Returns the best matches first, with a snippet of the body.
export function searchNotes(match: string, limit: number): { id: string; title: string; snippet: string }[] {
  const rows = db
    .prepare("SELECT note_id, title, snippet(notes_fts, 1, '[', ']', '...', 12) AS snippet FROM notes_fts WHERE notes_fts MATCH ? ORDER BY rank LIMIT ?")
    .all(match, limit) as Row[];
  return rows.map((row) => ({ id: row.note_id, title: row.title, snippet: row.snippet }));
}

// Titles this note links to, whether or not those notes exist yet.
export function linksFrom(noteId: string): string[] {
  return (db.prepare("SELECT to_title FROM note_links WHERE from_id = ? ORDER BY to_title").all(noteId) as Row[]).map((r) => r.to_title);
}

// Titles of the notes that link to this title.
export function linksTo(title: string): string[] {
  return (db.prepare("SELECT n.title FROM note_links l JOIN notes n ON n.id = l.from_id WHERE l.to_title = ? ORDER BY n.title").all(title) as Row[]).map((r) => r.title);
}

// Every link, as the note it comes from and the title it points to.
export function allLinks(): { fromId: string; toTitle: string }[] {
  return (db.prepare("SELECT from_id, to_title FROM note_links").all() as Row[]).map((r) => ({ fromId: r.from_id, toTitle: r.to_title }));
}

export function tagsOf(noteId: string): string[] {
  return (db.prepare("SELECT tag FROM note_tags WHERE note_id = ? ORDER BY tag").all(noteId) as Row[]).map((r) => r.tag);
}

// Called after each run: stores the provider's session id, so the next message resumes it.
export function finishRun(sessionId: string, providerSessionId: string | undefined): void {
  db.prepare("UPDATE sessions SET provider_session_id = COALESCE(?, provider_session_id), updated_at = ? WHERE id = ?").run(
    providerSessionId ?? null,
    Date.now(),
    sessionId,
  );
}

// Repositories: a clone in the repos folder, and the link it was cloned from.
export interface Repo {
  id: string;
  name: string;
  url: string;
  status: "cloning" | "ready" | "error";
  error: string | null;
}

function toRepo(row: Row): Repo {
  return { id: row.id, name: row.name, url: row.url, status: row.status, error: row.error ?? null };
}

export function listRepos(): Repo[] {
  return (db.prepare("SELECT * FROM repos ORDER BY name").all() as Row[]).map(toRepo);
}

export function getRepo(id: string): Repo | undefined {
  const row = db.prepare("SELECT * FROM repos WHERE id = ?").get(id) as Row | undefined;
  return row && toRepo(row);
}

export function getRepoByName(name: string): Repo | undefined {
  const row = db.prepare("SELECT * FROM repos WHERE name = ?").get(name) as Row | undefined;
  return row && toRepo(row);
}

export function insertRepo(repo: Repo): void {
  db.prepare("INSERT INTO repos (id, name, url, status, error, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    repo.id,
    repo.name,
    repo.url,
    repo.status,
    repo.error,
    Date.now(),
  );
}

export function setRepoStatus(id: string, status: Repo["status"], error: string | null): void {
  db.prepare("UPDATE repos SET status = ?, error = ? WHERE id = ?").run(status, error, id);
}

export function deleteRepo(id: string): void {
  db.prepare("DELETE FROM repos WHERE id = ?").run(id);
}

// Bots: named agents that share one room. Their replies come from their provider.
export interface Bot {
  id: string;
  name: string;
  persona: string;
  providerId: string;
  model: string | null;
  thinking: string | null;
}

function toBot(row: Row): Bot {
  return {
    id: row.id,
    name: row.name,
    persona: row.persona,
    providerId: row.provider_id,
    model: row.model ?? null,
    thinking: row.thinking ?? null,
  };
}

export function listBots(): Bot[] {
  return (db.prepare("SELECT * FROM bots ORDER BY name COLLATE NOCASE").all() as Row[]).map(toBot);
}

export function getBot(id: string): Bot | undefined {
  const row = db.prepare("SELECT * FROM bots WHERE id = ?").get(id) as Row | undefined;
  return row && toBot(row);
}

export function getBotByName(name: string): Bot | undefined {
  const row = db.prepare("SELECT * FROM bots WHERE name = ?").get(name) as Row | undefined;
  return row && toBot(row);
}

export function insertBot(bot: Bot): void {
  db.prepare("INSERT INTO bots (id, name, persona, provider_id, model, thinking, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    bot.id,
    bot.name,
    bot.persona,
    bot.providerId,
    bot.model,
    bot.thinking,
    Date.now(),
  );
}

export function updateBot(bot: Bot): void {
  db.prepare("UPDATE bots SET name = ?, persona = ?, provider_id = ?, model = ?, thinking = ? WHERE id = ?").run(
    bot.name,
    bot.persona,
    bot.providerId,
    bot.model,
    bot.thinking,
    bot.id,
  );
}

export function deleteBot(id: string): void {
  db.prepare("DELETE FROM bots WHERE id = ?").run(id);
}

// The shared room. Messages keep their author's name, so they stay readable after a bot is deleted.
export interface RoomMessage {
  id: number;
  kind: "user" | "bot" | "system";
  botId: string | null;
  authorName: string;
  text: string;
  createdAt: number;
}

function toRoomMessage(row: Row): RoomMessage {
  return { id: row.id, kind: row.kind, botId: row.bot_id ?? null, authorName: row.author_name, text: row.text, createdAt: row.created_at };
}

export function addRoomMessage(message: Omit<RoomMessage, "id" | "createdAt">): RoomMessage {
  const result = db
    .prepare("INSERT INTO room_messages (kind, bot_id, author_name, text, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(message.kind, message.botId, message.authorName, message.text, Date.now());
  return toRoomMessage(db.prepare("SELECT * FROM room_messages WHERE id = ?").get(Number(result.lastInsertRowid)) as Row);
}

// Messages after a sequence id, oldest first. With afterId 0, the latest messages.
export function roomMessagesAfter(afterId: number, limit: number): RoomMessage[] {
  if (afterId > 0) {
    return (db.prepare("SELECT * FROM room_messages WHERE id > ? ORDER BY id LIMIT ?").all(afterId, limit) as Row[]).map(toRoomMessage);
  }
  return (db.prepare("SELECT * FROM (SELECT * FROM room_messages ORDER BY id DESC LIMIT ?) ORDER BY id").all(limit) as Row[]).map(toRoomMessage);
}
