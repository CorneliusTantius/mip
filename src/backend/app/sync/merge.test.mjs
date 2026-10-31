// Checks the sync merge: which side wins, what is kept, and what is reported. Run after a build: node src/backend/app/sync/merge.test.mjs
// The tests import the compiled module from dist, so they need `npm run build:backend` first.
import assert from "node:assert/strict";
import { countChanges, emptySnapshot, indexBy, keyOf, mergeSnapshots } from "../../../../dist/backend/app/sync/merge.js";

const note = (title, body, updatedAt) => ({ title, body, links: [], tags: [], updatedAt });
const withNotes = (...notes) => ({ ...emptySnapshot(), notes: indexBy(notes, keyOf.note) });
const msg = (createdAt, text, role = "user") => ({ createdAt, role, text, tools: [], error: null });
const agent = (id, title, updatedAt, messages) => ({ id, title, providerId: "pi", personaId: "default", model: null, thinking: null, updatedAt, messages });
const withChats = (...chats) => ({ ...emptySnapshot(), chats: indexBy(chats, keyOf.agent) });

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
  const base = withChats(agent("c1", "Agent", 10, [shared]));
  const local = withChats(agent("c1", "Agent", 20, [shared, msg(20, "from laptop", "assistant")]));
  const remote = withChats(agent("c1", "Agent", 15, [shared, msg(15, "from desktop", "assistant")]));
  const { merged, notes } = mergeSnapshots(base, local, remote);
  assert.deepEqual(
    merged.chats.c1.messages.map((m) => m.text),
    ["hello", "from desktop", "from laptop"],
  );
  assert.equal(merged.chats.c1.updatedAt, 20);
  assert.equal(notes.length, 1);
}

// An agent deleted on GitHub while it changed here is kept, with its new messages.
{
  const base = withChats(agent("c1", "Agent", 10, [msg(10, "hello")]));
  const local = withChats(agent("c1", "Agent", 30, [msg(10, "hello"), msg(30, "still here")]));
  const { merged } = mergeSnapshots(base, local, emptySnapshot());
  assert.equal(merged.chats.c1.messages.length, 2);
}

// The room keeps both sides' messages, since none are edited or removed.
{
  const here = { createdAt: 1, kind: "user", authorName: "me", text: "hi" };
  const there = { createdAt: 2, kind: "bot", authorName: "Bob", text: "yo" };
  const local = { ...emptySnapshot(), room: indexBy([here], keyOf.room) };
  const remote = { ...emptySnapshot(), room: indexBy([there], keyOf.room) };
  const { merged } = mergeSnapshots(emptySnapshot(), local, remote);
  assert.equal(Object.keys(merged.room).length, 2);
}

// Same data on both sides: nothing to report, and nothing counted as changed.
{
  const same = withNotes(note("Ideas", "v1", 1));
  const { merged, notes } = mergeSnapshots(same, same, same);
  assert.deepEqual(notes, []);
  assert.equal(countChanges(merged, same), 0);
  assert.equal(countChanges(same, withNotes(note("Ideas", "v2", 2))), 1);
}

console.log("merge tests passed");
