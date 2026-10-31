import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DATA_DIR, ensureMipDirs } from "./paths.js";

// The one SQLite connection, shared by every storage module. The schema is created here on first start.
// App data lives in this file. Provider files (Claude, Pi) stay in their own folders.
ensureMipDirs();
export const db = new DatabaseSync(join(DATA_DIR, "mip.db"));

// Rows come back as plain objects. Each storage module maps them to its own types.
export type Row = Record<string, any>;

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
  CREATE TABLE IF NOT EXISTS skill_enablements (
    session_id TEXT NOT NULL,
    skill TEXT NOT NULL,
    PRIMARY KEY (session_id, skill)
  );
`);

// Migrations for databases made before some columns existed. Each one adds the column only when it is missing.
function hasColumn(table: string, column: string): boolean {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Row[]).some((c) => c.name === column);
}

// Databases made before personas have no persona column. Their chats get the default persona.
if (!hasColumn("sessions", "persona_id")) {
  db.exec("ALTER TABLE sessions ADD COLUMN persona_id TEXT NOT NULL DEFAULT 'default'");
}
if (!hasColumn("personas", "is_default")) {
  db.exec("ALTER TABLE personas ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0");
}
// Databases made before per-chat model and thinking settings. Their chats use the provider's defaults.
for (const column of ["model", "thinking"]) {
  if (!hasColumn("sessions", column)) {
    db.exec(`ALTER TABLE sessions ADD COLUMN ${column} TEXT`);
  }
}
// Databases made before GitHub sync need change times. Existing rows start at their creation time.
if (!hasColumn("personas", "updated_at")) {
  db.exec("ALTER TABLE personas ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0");
  db.exec("UPDATE personas SET updated_at = created_at");
}
if (!hasColumn("bots", "updated_at")) {
  db.exec("ALTER TABLE bots ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0");
  db.exec("UPDATE bots SET updated_at = created_at");
}
// Renames and setting changes move this, not updated_at, so the chat list order stays the same.
if (!hasColumn("sessions", "meta_updated_at")) {
  db.exec("ALTER TABLE sessions ADD COLUMN meta_updated_at INTEGER NOT NULL DEFAULT 0");
  db.exec("UPDATE sessions SET meta_updated_at = updated_at");
}

// Startup recovery. A run or clone cut off by a server restart can't finish, so it is marked as failed.
db.prepare("UPDATE runs SET status = 'error' WHERE status = 'running'").run();
db.prepare("UPDATE repos SET status = 'error', error = 'interrupted by a server restart' WHERE status = 'cloning'").run();
