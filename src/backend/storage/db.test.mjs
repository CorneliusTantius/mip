// Checks the rename from chats to agents on a database made before it: its rows, messages, runs, and skill enablements all keep their data.
// Run after a build: node src/backend/storage/db.test.mjs. It sets MIP_HOME to a temporary folder before the modules load.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const DIST = pathToFileURL(fileURLToPath(new URL("../../../dist/backend/", import.meta.url))).href;
const root = mkdtempSync(join(tmpdir(), "mip-db-"));
process.env.MIP_HOME = join(root, "mip-home");
mkdirSync(join(process.env.MIP_HOME, "data"), { recursive: true });

try {
  // A database as the code left it before the rename: sessions tables with session_id columns.
  const old = new DatabaseSync(join(process.env.MIP_HOME, "data", "mip.db"));
  old.exec(`
    CREATE TABLE sessions (id TEXT PRIMARY KEY, provider_id TEXT NOT NULL, provider_session_id TEXT, title TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL);
    CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL, tools TEXT NOT NULL DEFAULT '[]', error TEXT, created_at INTEGER NOT NULL);
    CREATE TABLE runs (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, status TEXT NOT NULL, started_at INTEGER NOT NULL);
    CREATE TABLE skill_enablements (session_id TEXT NOT NULL, skill TEXT NOT NULL, PRIMARY KEY (session_id, skill));
    CREATE TABLE bots (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, persona TEXT NOT NULL, provider_id TEXT NOT NULL, model TEXT, thinking TEXT, created_at INTEGER NOT NULL);
  `);
  // Two bots made before colors existed. The later one should get the next color.
  old.prepare("INSERT INTO bots (id, name, persona, provider_id, created_at) VALUES (?, ?, ?, ?, ?)").run("b1", "Freya", "A keen reviewer.", "claude-cli", 100);
  old.prepare("INSERT INTO bots (id, name, persona, provider_id, created_at) VALUES (?, ?, ?, ?, ?)").run("b2", "Thorin", "Plain speaker.", "claude-cli", 200);
  old.prepare("INSERT INTO sessions (id, provider_id, provider_session_id, title, updated_at) VALUES (?, ?, ?, ?, ?)").run("a1", "claude-cli", "p1", "Old chat", 100);
  old.prepare("INSERT INTO messages (session_id, role, text, created_at) VALUES (?, ?, ?, ?)").run("a1", "user", "hello", 100);
  old.prepare("INSERT INTO runs (id, session_id, status, started_at) VALUES (?, ?, ?, ?)").run("r1", "a1", "done", 100);
  old.prepare("INSERT INTO skill_enablements (session_id, skill) VALUES (?, ?)").run("a1", "notes");
  old.close();

  // Opening the database with the current code renames the tables and columns, and keeps the rows.
  const agents = await import(`${DIST}storage/agents.js`);
  const runs = await import(`${DIST}storage/runs.js`);
  const skills = await import(`${DIST}storage/skills.js`);
  const bots = await import(`${DIST}storage/bots.js`);

  const listed = agents.listAgents();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, "a1");
  assert.equal(listed[0].title, "Old chat");
  assert.equal(listed[0].providerSessionId, "p1");
  assert.equal(agents.listMessages("a1")[0].text, "hello");
  assert.equal(runs.getRun("r1").status, "done");
  assert.deepEqual(skills.enabledSkillNames("a1"), ["notes"]);
  assert.deepEqual(Object.fromEntries(bots.listBots().map((bot) => [bot.name, bot.color])), { Freya: "frost", Thorin: "orange" });

  console.log("database rename tests passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}
