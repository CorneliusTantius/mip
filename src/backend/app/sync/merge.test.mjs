// Checks the sync merge: which side wins, what is kept, and what is reported. Run after a build: node src/backend/app/sync/merge.test.mjs
// The tests import the compiled module from dist, so they need `npm run build:backend` first.
import assert from "node:assert/strict";
import { countChanges, emptySnapshot, indexBy, keyOf, mergeSnapshots, snapshotFromSaved } from "../../../../dist/backend/app/sync/merge.js";

const note = (title, body, updatedAt) => ({ title, body, links: [], tags: [], updatedAt });
const withNotes = (...notes) => ({ ...emptySnapshot(), notes: indexBy(notes, keyOf.note) });
const msg = (createdAt, text, role = "user") => ({ createdAt, role, text, tools: [], error: null });
const agent = (id, title, updatedAt, messages) => ({ id, title, providerId: "pi", personaId: "default", model: null, thinking: null, updatedAt, messages });
const withAgents = (...agents) => ({ ...emptySnapshot(), agents: indexBy(agents, keyOf.agent) });

// Only one side changed: that side's version is taken, and nothing is reported.
{
  const base = withNotes(note("Ideas", "v1", 1));
  const { merged, notes } = mergeSnapshots(base, withNotes(note("Ideas", "v2", 2)), withNotes(note("Ideas", "v1", 1)));
  assert.equal(merged.notes.ideas.body, "v2");
  assert.deepEqual(notes, []);
}

// Only GitHub changed: its version is taken.
{
  const base = withNotes(note("Ideas", "v1", 1));
  const { merged } = mergeSnapshots(base, withNotes(note("Ideas", "v1", 1)), withNotes(note("Ideas", "remote", 3)));
  assert.equal(merged.notes.ideas.body, "remote");
}

// Both sides edited: the later change time wins, and the sync log says so.
{
  const base = withNotes(note("Ideas", "v1", 1));
  const { merged, notes } = mergeSnapshots(base, withNotes(note("Ideas", "local", 5)), withNotes(note("Ideas", "remote", 3)));
  assert.equal(merged.notes.ideas.body, "local");
  assert.equal(notes.length, 1);
  assert.match(notes[0], /edited on both sides/);
}

// A tie goes to GitHub's copy, so both sides end up with the same note.
{
  const base = withNotes(note("Ideas", "v1", 1));
  const { merged } = mergeSnapshots(base, withNotes(note("Ideas", "local", 5)), withNotes(note("Ideas", "remote", 5)));
  assert.equal(merged.notes.ideas.body, "remote");
}

// Edited here, deleted on GitHub: the edit is kept.
{
  const base = withNotes(note("Ideas", "v1", 1));
  const { merged, notes } = mergeSnapshots(base, withNotes(note("Ideas", "edited", 4)), withNotes());
  assert.equal(merged.notes.ideas.body, "edited");
  assert.match(notes[0], /edited on one side and deleted on the other/);
}

// Deleted here, edited on GitHub: the edit is kept.
{
  const base = withNotes(note("Ideas", "v1", 1));
  const { merged } = mergeSnapshots(base, withNotes(), withNotes(note("Ideas", "edited", 4)));
  assert.equal(merged.notes.ideas.body, "edited");
}

// Deleted here, untouched on GitHub: the delete goes through.
{
  const base = withNotes(note("Ideas", "v1", 1));
  const { merged } = mergeSnapshots(base, withNotes(), withNotes(note("Ideas", "v1", 1)));
  assert.equal(merged.notes.ideas, undefined);
}

// A record added on one side only is added to the merge.
{
  const { merged } = mergeSnapshots(emptySnapshot(), withNotes(note("New", "x", 1)), emptySnapshot());
  assert.equal(merged.notes.new.body, "x");
}

// Chats: messages from both sides are kept once each, oldest first. The newer settings win.
{
  const shared = msg(10, "hello");
  const base = withAgents(agent("c1", "Agent", 10, [shared]));
  const local = withAgents(agent("c1", "Agent", 20, [shared, msg(20, "from laptop", "assistant")]));
  const remote = withAgents(agent("c1", "Agent", 15, [shared, msg(15, "from desktop", "assistant")]));
  const { merged, notes } = mergeSnapshots(base, local, remote);
  assert.deepEqual(
    merged.agents.c1.messages.map((m) => m.text),
    ["hello", "from desktop", "from laptop"],
  );
  assert.equal(merged.agents.c1.updatedAt, 20);
  assert.equal(notes.length, 1);
}

// An agent deleted on GitHub while it changed here is kept, with its new messages.
{
  const base = withAgents(agent("c1", "Agent", 10, [msg(10, "hello")]));
  const local = withAgents(agent("c1", "Agent", 30, [msg(10, "hello"), msg(30, "still here")]));
  const { merged } = mergeSnapshots(base, local, emptySnapshot());
  assert.equal(merged.agents.c1.messages.length, 2);
}

// A room keeps both sides' messages, since none are edited or removed. A message in a room that is gone goes with the room.
{
  const main = { id: "main", name: "Main", bots: [], updatedAt: 1 };
  const here = { room: "main", createdAt: 1, kind: "user", authorName: "me", text: "hi" };
  const there = { room: "main", createdAt: 2, kind: "bot", authorName: "Bob", text: "yo" };
  const gone = { room: "gone", createdAt: 3, kind: "user", authorName: "me", text: "lost" };
  const local = { ...emptySnapshot(), rooms: indexBy([main], keyOf.room), room: indexBy([here, gone], keyOf.roomMessage) };
  const remote = { ...emptySnapshot(), rooms: indexBy([main], keyOf.room), room: indexBy([there], keyOf.roomMessage) };
  const { merged } = mergeSnapshots(emptySnapshot(), local, remote);
  assert.equal(Object.keys(merged.room).length, 2, "the message of the room that is not there is dropped");
  assert.deepEqual(Object.values(merged.room).map((m) => m.text).sort(), ["hi", "yo"]);
}

// Rooms merge like bots: a room edited on one side only takes that side's edit, and two edits keep the newer one.
{
  const base = { ...emptySnapshot(), rooms: { main: { id: "main", name: "Main", bots: ["Freya"], updatedAt: 1 } } };
  const local = { ...emptySnapshot(), rooms: { main: { id: "main", name: "Main", bots: ["Freya", "Thorin"], updatedAt: 2 } } };
  const remote = { ...emptySnapshot(), rooms: { main: { id: "main", name: "Lobby", bots: ["Freya"], updatedAt: 3 } } };
  const { merged, notes } = mergeSnapshots(base, local, remote);
  assert.deepEqual(merged.rooms.main, { id: "main", name: "Lobby", bots: ["Freya"], updatedAt: 3 }, "the newer edit wins");
  assert.ok(notes.some((note) => /room "Main" was edited on both sides/.test(note)));
}

// Same data on both sides: nothing to report, and nothing counted as changed.
{
  const same = withNotes(note("Ideas", "v1", 1));
  const { merged, notes } = mergeSnapshots(same, same, same);
  assert.deepEqual(notes, []);
  assert.equal(countChanges(merged, same), 0);
  assert.equal(countChanges(same, withNotes(note("Ideas", "v2", 2))), 1);
}

// A snapshot saved before the rename kept its agents under chats. Reading it gives them under agents.
assert.deepEqual(Object.keys(snapshotFromSaved({ chats: indexBy([agent("c1", "Agent", 10, [])], keyOf.agent) }).agents), ["c1"]);

// MCP servers: a server changed on one side only is taken from that side, and a deletion on one side reaches the other.
const server = (name, url) => ({ name, transport: "http", url, headers: { Authorization: "Bearer s3cret" } });
const withMcp = (...servers) => ({ ...emptySnapshot(), mcp: indexBy(servers, keyOf.mcp) });
{
  const base = withMcp(server("docs", "https://a.test/mcp"), server("notes", "https://n.test/mcp"));
  const local = withMcp(server("docs", "https://a.test/v2"), server("notes", "https://n.test/mcp"));
  const { merged, notes } = mergeSnapshots(base, local, base);
  assert.equal(merged.mcp.docs.url, "https://a.test/v2", "an edit on this side is kept");
  assert.deepEqual(notes, []);
  const removed = withMcp(server("docs", "https://a.test/mcp"));
  const gone = mergeSnapshots(base, removed, base);
  assert.deepEqual(Object.keys(gone.merged.mcp), ["docs"], "a server removed here is removed on GitHub too");
  // Both sides changed the same server: GitHub's copy is kept, and the log says so.
  const both = mergeSnapshots(base, local, withMcp(server("docs", "https://a.test/remote"), server("notes", "https://n.test/mcp")));
  assert.equal(both.merged.mcp.docs.url, "https://a.test/remote");
  assert.match(both.notes.join("\n"), /MCP server "docs" was changed on both sides; kept the copy on GitHub/);
  // A snapshot saved before this part existed has no servers, so its base is empty and nothing is removed.
  assert.deepEqual(snapshotFromSaved({ notes: {} }).mcp, {});
}

// Pi credentials: the newer copy wins, and a credential removed on one side is removed on the other. Pi config files: GitHub's copy
// wins when both sides changed one.
const cred = (providerId, key, updatedAt) => ({ providerId, credential: { type: "api_key", key }, updatedAt });
const withCreds = (...creds) => ({ ...emptySnapshot(), piCredentials: indexBy(creds, keyOf.piCredential) });
const withFiles = (...files) => ({ ...emptySnapshot(), piFiles: indexBy(files, keyOf.piFile) });
{
  const base = withCreds(cred("openrouter", "k1", 1));
  const local = withCreds(cred("openrouter", "k2", 5));
  const remote = withCreds(cred("openrouter", "k3", 3));
  const { merged, notes } = mergeSnapshots(base, local, remote);
  assert.equal(merged.piCredentials.openrouter.credential.key, "k2", "the newer credential wins");
  assert.match(notes.join("\n"), /Pi credential "openrouter" was changed on both sides; kept the newer one/);
  const gone = mergeSnapshots(withCreds(cred("anthropic", "x", 1)), emptySnapshot(), withCreds(cred("anthropic", "x", 1)));
  assert.deepEqual(gone.merged.piCredentials, {}, "a credential removed here is removed on GitHub too");
}
{
  const base = withFiles({ name: "settings.json", text: "a" });
  const local = withFiles({ name: "settings.json", text: "local" });
  const remote = withFiles({ name: "settings.json", text: "remote" });
  const { merged, notes } = mergeSnapshots(base, local, remote);
  assert.equal(merged.piFiles["settings.json"].text, "remote");
  assert.match(notes.join("\n"), /Pi file "settings.json" was changed on both sides; kept the copy on GitHub/);
}


// Caches sync like the rest, but their changes are not reported. A Slack entry keeps the newer read; a mail cache takes GitHub's copy.
{
  const cache = (accountId, uidValidity) => ({ accountId, uidValidity, messages: [] });
  const entry = (key, updatedAt, value) => ({ key, updatedAt, value });
  const withCaches = (mailCache, slackCache) => ({ ...emptySnapshot(), mailCache: indexBy(mailCache, keyOf.mailCache), slackCache: indexBy(slackCache, keyOf.slackCache) });
  const base = withCaches([cache("a", 1)], [entry("k", 1, "old")]);
  const local = withCaches([cache("a", 2)], [entry("k", 5, "local")]);
  const remote = withCaches([cache("a", 3)], [entry("k", 3, "remote"), entry("other", 4, "new")]);
  const { merged, notes } = mergeSnapshots(base, local, remote);
  assert.equal(merged.slackCache.k.value, "local", "the newer Slack read wins");
  assert.equal(merged.slackCache.other.value, "new", "an entry added on GitHub is kept");
  assert.equal(merged.mailCache.a.uidValidity, 3, "a mail cache changed on both sides takes GitHub's copy");
  assert.deepEqual(notes, [], "cache changes are not reported");

  const dropped = mergeSnapshots(base, withCaches([], []), withCaches([cache("a", 1)], [entry("k", 1, "old")]));
  assert.deepEqual(Object.keys(dropped.merged.mailCache), [], "a cache removed here is removed on GitHub too");
  assert.deepEqual(Object.keys(dropped.merged.slackCache), [], "a Slack entry removed here is removed on GitHub too");
}

console.log("merge tests passed");
