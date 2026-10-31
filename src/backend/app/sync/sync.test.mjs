// Runs the GitHub sync end to end, with two machines and a local bare repo in place of GitHub. Run after a build:
//   node src/backend/app/sync/sync.test.mjs
// Each machine is a separate Node process with its own MIP_HOME, so each has its own database, as on two real machines.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIST = pathToFileURL(fileURLToPath(new URL("../../../../dist/backend/", import.meta.url))).href;
const root = mkdtempSync(join(tmpdir(), "mip-sync-"));
const bare = join(root, "dotmip-remote.git");
execFileSync("git", ["init", "--bare", "-b", "main", bare], { stdio: "ignore" });
try {
  await run();
} finally {
  rmSync(root, { recursive: true, force: true });
}

async function run() {

// Runs a script on one machine and returns what the script returns. The script runs inside a module with the
// compiled storage and sync modules in scope.
function machine(home, script) {
  const code = `
    const engine = await import(${JSON.stringify(`${DIST}app/sync/engine.js`)});
    const notes = await import(${JSON.stringify(`${DIST}storage/notes.js`)});
    const sessions = await import(${JSON.stringify(`${DIST}storage/sessions.js`)});
    const remote = { url: ${JSON.stringify(bare)}, env: {} };
    const result = await (async () => { ${script} })();
    console.log(JSON.stringify(result ?? null));
  `;
  const stdout = execFileSync(process.execPath, ["--input-type=module", "-e", code], {
    env: { ...process.env, MIP_HOME: home },
    encoding: "utf8",
  });
  return JSON.parse(stdout.trim().split("\n").pop());
}

// What a machine shows after a sync: its notes by title, and its chats with their messages.
const READ = `
  const chats = sessions.listSessions().map((s) => ({ id: s.id, title: s.title, messages: sessions.listMessages(s.id).map((m) => m.text) }));
  const noteBody = (title) => notes.getNoteByTitle(title)?.body ?? null;
  return { chats, ideas: noteBody("Ideas"), temp: noteBody("Temp") };
`;

const a = join(root, "machine-a");
const b = join(root, "machine-b");

// Machine A creates data and syncs. The remote is empty, so this creates the dotmip contents.
const first = machine(a, `
  notes.saveNote({ id: "n-ideas", title: "Ideas", body: "from A" }, [], []);
  notes.saveNote({ id: "n-temp", title: "Temp", body: "delete me" }, [], []);
  const chat = sessions.createSession("pi", "default", "Plans");
  sessions.addMessage(chat.id, { role: "user", text: "hello from A", tools: [], error: null });
  const run = await engine.syncWith(remote);
  return { run, chatId: chat.id };
`);
assert.equal(first.run.ok, true);
assert.ok(first.run.pushed > 0, "the first sync pushes what machine A has");

// Machine B starts empty, and syncs. It gets everything from A.
const second = machine(b, `
  const run = await engine.syncWith(remote);
  ${READ.replace("return {", "return { run,")}
`);
assert.equal(second.run.ok, true);
assert.equal(second.ideas, "from A");
assert.equal(second.temp, "delete me");
assert.deepEqual(second.chats.map((c) => c.messages), [["hello from A"]]);

// Machine B edits the note and adds a message, then syncs.
machine(b, `
  notes.saveNote({ id: notes.getNoteByTitle("Ideas").id, title: "Ideas", body: "from B" }, [], []);
  sessions.addMessage(${JSON.stringify(first.chatId)}, { role: "assistant", text: "hi from B", tools: [], error: null });
  return await engine.syncWith(remote);
`);

// Machine A edits the same note later, deletes Temp, and adds a message. Both sides changed the note, so the newer edit wins.
const third = machine(a, `
  notes.saveNote({ id: notes.getNoteByTitle("Ideas").id, title: "Ideas", body: "from A later" }, [], []);
  notes.deleteNote(notes.getNoteByTitle("Temp").id);
  sessions.addMessage(${JSON.stringify(first.chatId)}, { role: "user", text: "from A again", tools: [], error: null });
  const run = await engine.syncWith(remote);
  ${READ.replace("return {", "return { run,")}
`);
assert.equal(third.run.ok, true);
assert.equal(third.ideas, "from A later", "the later edit wins the note");
assert.equal(third.temp, null, "the delete on A reaches GitHub");
assert.ok(third.run.notes.some((note) => /Ideas/.test(note)), "the conflict is reported in the sync log");
assert.deepEqual(third.chats[0].messages, ["hello from A", "hi from B", "from A again"], "both sides' messages are kept once, in order");

// Machine B syncs again. It takes A's note and the delete, and keeps its own message.
const fourth = machine(b, `
  const run = await engine.syncWith(remote);
  ${READ.replace("return {", "return { run,")}
`);
assert.equal(fourth.run.ok, true);
assert.equal(fourth.ideas, "from A later");
assert.equal(fourth.temp, null);
assert.deepEqual(fourth.chats[0].messages, ["hello from A", "hi from B", "from A again"]);

// Nothing changed since the last run: the sync reports that and pushes nothing.
const fifth = machine(b, `
  return await engine.syncWith(remote);
`);
assert.equal(fifth.ok, true);
assert.equal(fifth.pushed, 0);
assert.equal(fifth.message, "Already in sync.");

// The repo holds one file per record, under readable names, and no secrets.
const files = execFileSync("git", ["--git-dir", bare, "ls-tree", "-r", "--name-only", "main"], { encoding: "utf8" });
assert.match(files, /notes\/ideas\.json/);
assert.match(files, /chats\/.*\.json/);
assert.match(files, /room\.json/);
assert.doesNotMatch(files, /sessions\/|auth|github\.json/i);

console.log("sync tests passed");
}
