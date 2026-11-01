// Runs the GitHub sync end to end, with two machines and local bare repos in place of GitHub. Run after a build:
//   node src/backend/app/sync/sync.test.mjs
// Each machine is a separate Node process with its own MIP_HOME, so each has its own database, as on two real machines.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIST = pathToFileURL(fileURLToPath(new URL("../../../../dist/backend/", import.meta.url))).href;
const root = mkdtempSync(join(tmpdir(), "mip-sync-"));
try {
  run();
} finally {
  rmSync(root, { recursive: true, force: true });
}

function run() {
  const bare = bareRepo("dotmip-remote.git");
  const defaultRemote = { url: bare, env: {}, repo: "test/dotmip" };

  // Runs a script on one machine and returns what the script returns. The script runs inside a module that has the compiled
  // sync engine and storage in scope, and `remote` set to the remote it syncs with.
  function machine(home, script, remote = defaultRemote) {
    const code = `
      const engine = await import(${JSON.stringify(`${DIST}app/sync/engine.js`)});
      const notes = await import(${JSON.stringify(`${DIST}storage/notes.js`)});
      const agents = await import(${JSON.stringify(`${DIST}storage/agents.js`)});
      const bots = await import(${JSON.stringify(`${DIST}storage/bots.js`)});
      const rooms = await import(${JSON.stringify(`${DIST}storage/rooms.js`)});
      const room = await import(${JSON.stringify(`${DIST}storage/room.js`)});
      const remote = ${JSON.stringify(remote)};
      const result = await (async () => { ${script} })();
      console.log(JSON.stringify(result ?? null));
    `;
    const stdout = execFileSync(process.execPath, ["--input-type=module", "-e", code], {
      env: { ...process.env, MIP_HOME: home },
      encoding: "utf8",
    });
    return JSON.parse(stdout.trim().split("\n").pop());
  }

  // What a machine shows after a sync: its notes by title, and its agents with their messages.
  const READ = `
    const found = agents.listAgents().map((s) => ({ id: s.id, title: s.title, messages: agents.listMessages(s.id).map((m) => m.text) }));
    const noteBody = (title) => notes.getNoteByTitle(title)?.body ?? null;
    const roomBots = bots.listBots().map((bot) => ({ name: bot.name, color: bot.color }));
    const roomList = rooms.listRooms().map((r) => ({ name: r.name, bots: r.botIds.map((id) => bots.getBot(id).name) })).sort((x, y) => x.name.localeCompare(y.name));
    const lounge = room.roomMessagesAfter("lounge-1", 0, 10).map((m) => m.text);
    return { agents: found, bots: roomBots, rooms: roomList, lounge, ideas: noteBody("Ideas"), temp: noteBody("Temp") };
  `;
  const withRun = (run) => `const run = ${run}; ${READ.replace("return {", "return { run,")}`;

  const a = join(root, "machine-a");
  const b = join(root, "machine-b");

  // Machine A creates data and syncs. The remote is empty, so this creates the dotmip contents.
  const first = machine(a, `
    notes.saveNote({ id: "n-ideas", title: "Ideas", body: "from A" }, [], []);
    notes.saveNote({ id: "n-temp", title: "Temp", body: "delete me" }, [], []);
    const agent = agents.insertAgent("pi", "default", "Plans");
    bots.insertBot({ id: "b-freya", name: "Freya", persona: "A keen reviewer.", providerId: "pi", model: null, thinking: null, color: "teal" });
    agents.addMessage(agent.id, { role: "user", text: "hello from A", tools: [], error: null });
    rooms.insertRoom({ id: "lounge-1", name: "Lounge", botIds: ["b-freya"], createdAt: 1, updatedAt: 1 });
    room.addRoomMessage({ roomId: "lounge-1", kind: "user", botId: null, authorName: "You", text: "hi lounge" });
    const run = await engine.syncWith(remote);
    return { run, agentId: agent.id };
  `);
  assert.equal(first.run.ok, true);
  assert.ok(first.run.pushed > 0, "the first sync pushes what machine A has");

  // Machine B starts empty, and syncs. It gets everything from A.
  const second = machine(b, withRun("await engine.syncWith(remote)"));
  assert.equal(second.run.ok, true);
  assert.equal(second.ideas, "from A");
  assert.equal(second.temp, "delete me");
  assert.deepEqual(second.agents.map((a) => a.messages), [["hello from A"]]);
  assert.deepEqual(second.bots, [{ name: "Freya", color: "teal" }], "a bot's color reaches the other machine");
  assert.deepEqual(second.rooms, [{ name: "Lounge", bots: ["Freya"] }, { name: "Main", bots: [] }], "rooms and their bots reach the other machine");
  assert.deepEqual(second.lounge, ["hi lounge"], "a room's messages reach the other machine, in their room");

  // Machine B edits the note and adds a message, then syncs.
  machine(b, `
    notes.saveNote({ id: notes.getNoteByTitle("Ideas").id, title: "Ideas", body: "from B" }, [], []);
    agents.addMessage(${JSON.stringify(first.agentId)}, { role: "assistant", text: "hi from B", tools: [], error: null });
    return await engine.syncWith(remote);
  `);

  // Machine A edits the same note later, deletes Temp, and adds a message. Both sides changed the note, so the newer edit wins.
  const third = machine(a, withRun(`await engine.syncWith(remote)`).replace(
    "const run =",
    `notes.saveNote({ id: notes.getNoteByTitle("Ideas").id, title: "Ideas", body: "from A later" }, [], []);
     notes.deleteNote(notes.getNoteByTitle("Temp").id);
     agents.addMessage(${JSON.stringify(first.agentId)}, { role: "user", text: "from A again", tools: [], error: null });
     const run =`,
  ));
  assert.equal(third.run.ok, true);
  assert.equal(third.ideas, "from A later", "the later edit wins the note");
  assert.equal(third.temp, null, "the delete on A reaches GitHub");
  assert.ok(third.run.notes.some((note) => /Ideas/.test(note)), "the conflict is reported in the sync log");
  assert.deepEqual(third.agents[0].messages, ["hello from A", "hi from B", "from A again"], "both sides' messages are kept once, in order");

  // Machine B syncs again. It takes A's note and the delete, and keeps its own message.
  const fourth = machine(b, withRun("await engine.syncWith(remote)"));
  assert.equal(fourth.run.ok, true);
  assert.equal(fourth.ideas, "from A later");
  assert.equal(fourth.temp, null);
  assert.deepEqual(fourth.agents[0].messages, ["hello from A", "hi from B", "from A again"]);

  // Nothing changed since the last run: the sync reports that and pushes nothing.
  const fifth = machine(b, "return await engine.syncWith(remote);");
  assert.equal(fifth.ok, true);
  assert.equal(fifth.pushed, 0);
  assert.equal(fifth.message, "Already in sync.");

  // Machine B deletes Lounge, with its messages, and syncs. Machine A gets the delete on its next sync, and the messages go too.
  machine(b, `rooms.deleteRoom("lounge-1"); return await engine.syncWith(remote);`);
  const gone = machine(a, `
    const run = await engine.syncWith(remote);
    return { run, rooms: rooms.listRooms().map((r) => r.name).sort(), lounge: room.roomMessagesAfter("lounge-1", 0, 10).length };
  `);
  assert.equal(gone.run.ok, true);
  assert.deepEqual(gone.rooms, ["Main"], "the delete reaches machine A");
  assert.equal(gone.lounge, 0, "the room's messages go with it");

  // Switching to another GitHub account (another repo) keeps this machine's data. The base from the old repo is ignored, so
  // nothing the new repo lacks is read as a delete. This machine's data then goes to the new repo.
  const other = bareRepo("other-remote.git");
  const switched = machine(b, "return await engine.syncWith(remote);", { url: other, env: {}, repo: "other/dotmip" });
  assert.equal(switched.ok, true);
  assert.ok(switched.pushed > 0, "the data goes to the new repo");
  const kept = machine(b, READ);
  assert.equal(kept.ideas, "from A later", "switching accounts keeps the local note");
  assert.match(lsTree(other), /notes\/ideas\.json/);

  // The repo holds one file per record, under readable names, and no secrets.
  const files = lsTree(bare);
  assert.match(files, /notes\/ideas\.json/);
  assert.match(files, /agents\/.*\.json/);
  assert.match(files, /room\.json/);
  assert.doesNotMatch(files, /sessions\/|auth|github\.json|token/i);

  // A repo and a saved base written before the rename keep their agents under chats. Here the repo is moved back to that
  // layout by hand, and machine E's base is rewritten the same way. A new machine reads the agent from chats/, and the
  // sync writes agents/ and removes chats/. Then E, still holding the agent, sees the delete through its legacy base.
  const legacyRepo = { url: bareRepo("legacy-remote.git"), env: {}, repo: "test/legacy" };
  const e = join(root, "machine-e");
  const f = join(root, "machine-f");
  machine(e, `
    notes.saveNote({ id: "n-keep", title: "Keep", body: "stays" }, [], []);
    const agent = agents.insertAgent("pi", "default", "Old");
    agents.addMessage(agent.id, { role: "user", text: "old chat", tools: [], error: null });
    return await engine.syncWith(remote);
  `, legacyRepo);
  moveFolder(legacyRepo.url, "agents", "chats");
  const baseFile = join(e, "sync", "base.json");
  const saved = JSON.parse(readFileSync(baseFile, "utf8"));
  saved.snapshot.chats = saved.snapshot.agents;
  delete saved.snapshot.agents;
  writeFileSync(baseFile, JSON.stringify(saved));

  const fresh = machine(f, `
    const run = await engine.syncWith(remote);
    return { run, agents: agents.listAgents().map((a) => ({ id: a.id, title: a.title, messages: agents.listMessages(a.id).map((m) => m.text) })) };
  `, legacyRepo);
  assert.equal(fresh.run.ok, true);
  assert.deepEqual(fresh.agents.map((a) => a.title), ["Old"], "the agent is read from the legacy chats folder");
  assert.deepEqual(fresh.agents[0].messages, ["old chat"]);
  assert.match(lsTree(legacyRepo.url), /agents\/.*\.json/, "the sync writes the agents folder");
  assert.doesNotMatch(lsTree(legacyRepo.url), /(^|\n)chats\//, "the legacy chats folder is removed");

  machine(f, `
    agents.deleteAgent(${JSON.stringify(fresh.agents[0].id)});
    return await engine.syncWith(remote);
  `, legacyRepo);
  const stale = machine(e, `
    const run = await engine.syncWith(remote);
    return { run, agents: agents.listAgents().map((a) => a.title) };
  `, legacyRepo);
  assert.equal(stale.run.ok, true);
  assert.deepEqual(stale.agents, [], "the delete reaches machine E through its legacy base");

  // MCP servers sync with their tokens. Machine A adds two servers, and machine B gets both, with their values, in a file only this user reads.
  const PATHS = `const fs = await import("node:fs"); const paths = await import(${JSON.stringify(`${DIST}storage/paths.js`)});`;
  const HTTP = `{ type: "http", url: "http://127.0.0.1:47891/mcp", headers: { Authorization: "Bearer s3cret" } }`;
  machine(a, `${PATHS}
    fs.writeFileSync(paths.MCP_CONFIG_FILE, JSON.stringify({ mcpServers: { docs: ${HTTP}, local: { command: "node", args: ["server.mjs"], env: { TOKEN: "t0k" } } } }));
    return { run: await engine.syncWith(remote) };
  `);
  const mcpB = machine(b, `${PATHS}
    const run = await engine.syncWith(remote);
    const file = JSON.parse(fs.readFileSync(paths.MCP_CONFIG_FILE, "utf8"));
    return { run, servers: file.mcpServers, mode: (fs.statSync(paths.MCP_CONFIG_FILE).mode & 0o777).toString(8) };
  `);
  assert.equal(mcpB.run.ok, true);
  assert.equal(mcpB.servers.docs.headers.Authorization, "Bearer s3cret", "machine B gets the token");
  assert.deepEqual(mcpB.servers.local.env, { TOKEN: "t0k" });
  assert.equal(mcpB.servers.local.type, "stdio");
  assert.equal(mcpB.mode, "600", "the config file is readable only by this user");
  assert.match(lsTree(bare), /^mcp\/docs\.json$/m);
  assert.match(lsTree(bare), /^mcp\/local\.json$/m);
  assert.match(execFileSync("git", ["--git-dir", bare, "show", "main:mcp/docs.json"], { encoding: "utf8" }), /s3cret/);

  // Machine A removes one server. Machine B loses it too.
  machine(a, `${PATHS}
    fs.writeFileSync(paths.MCP_CONFIG_FILE, JSON.stringify({ mcpServers: { docs: ${HTTP} } }));
    return await engine.syncWith(remote);
  `);
  const mcpB2 = machine(b, `${PATHS}
    const run = await engine.syncWith(remote);
    return { run, servers: Object.keys(JSON.parse(fs.readFileSync(paths.MCP_CONFIG_FILE, "utf8")).mcpServers) };
  `);
  assert.deepEqual(mcpB2.servers, ["docs"], "a server removed on one machine is removed on the other");
  assert.doesNotMatch(lsTree(bare), /mcp\/local\.json/);

  // Machine B's file is broken. The sync stops before anything changes, so GitHub keeps every server.
  const broken = machine(b, `${PATHS}
    fs.writeFileSync(paths.MCP_CONFIG_FILE, "{not json");
    try {
      await engine.syncWith(remote);
      return { refused: false };
    } catch (err) {
      return { refused: true, message: err.message };
    }
  `);
  assert.equal(broken.refused, true);
  assert.match(broken.message, /mcp\.json has a problem/);
  assert.match(lsTree(bare), /^mcp\/docs\.json$/m, "a file with a problem deletes nothing on GitHub");

  // Machine B's config file was left broken by the check above. Writing the server GitHub still has makes B match it again.
  machine(b, `${PATHS}
    fs.writeFileSync(paths.MCP_CONFIG_FILE, JSON.stringify({ mcpServers: { docs: ${HTTP} } }));
    return null;
  `);
  // Pi's credentials, model catalogs and settings sync too, secrets included. Machine A has a key, a catalog and a settings file. Machine B
  // gets all three, and a key removed on A is removed on B.
  const PI = `const pi = await import(${JSON.stringify(`${DIST}storage/pi.js`)});`;
  const SETTINGS = JSON.stringify('{"codemode":{"mode":"on"}}\n');
  machine(a, `${PI}
    pi.writePiCredentialRow({ providerId: "openrouter", credential: { type: "api_key", key: "sk-or-test" }, updatedAt: 100 });
    pi.writePiModelRow({ providerId: "openrouter", entry: { models: [], checkedAt: 7 }, updatedAt: 100 });
    pi.writePiConfigFile("settings.json", ${SETTINGS});
    return await engine.syncWith(remote);
  `);
  const piB = machine(b, `${PI}
    const run = await engine.syncWith(remote);
    return {
      run,
      credential: pi.readPiCredentialRow("openrouter")?.credential ?? null,
      model: pi.readPiModelRow("openrouter")?.entry ?? null,
      settings: pi.readPiConfigFile("settings.json") ?? null,
    };
  `);
  assert.equal(piB.run.ok, true);
  assert.deepEqual(piB.credential, { type: "api_key", key: "sk-or-test" });
  assert.deepEqual(piB.model, { models: [], checkedAt: 7 });
  assert.equal(piB.settings, '{"codemode":{"mode":"on"}}\n');
  assert.match(execFileSync("git", ["--git-dir", bare, "show", "main:pi-credentials/openrouter.json"], { encoding: "utf8" }), /sk-or-test/);
  machine(a, `${PI}
    pi.removePiCredentialRow("openrouter");
    return await engine.syncWith(remote);
  `);
  const piB2 = machine(b, `${PI}
    const run = await engine.syncWith(remote);
    return { run, credential: pi.readPiCredentialRow("openrouter") ?? null };
  `);
  assert.equal(piB2.credential, null, "a credential removed on one machine is removed on the other");
  assert.doesNotMatch(lsTree(bare), /pi-credentials\/openrouter\.json/);

  console.log("sync tests passed");
}

function bareRepo(name) {
  const path = join(root, name);
  execFileSync("git", ["init", "--bare", "-b", "main", path], { stdio: "ignore" });
  return path;
}

// Renames a folder on the main branch of a bare repo, the way an older version of mip laid the repo out.
function moveFolder(repo, from, to) {
  const clone = join(root, `clone-${to}`);
  execFileSync("git", ["clone", "-q", repo, clone], { stdio: "ignore" });
  execFileSync("git", ["-C", clone, "mv", from, to]);
  execFileSync("git", ["-C", clone, "-c", "user.name=test", "-c", "user.email=test@localhost", "commit", "-q", "-m", `move ${from} to ${to}`]);
  execFileSync("git", ["-C", clone, "push", "-q", "origin", "HEAD:refs/heads/main"]);
}

function lsTree(repo) {
  return execFileSync("git", ["--git-dir", repo, "ls-tree", "-r", "--name-only", "main"], { encoding: "utf8" });
}
