import { db, type Row } from "./db.js";

// A note in the shared memory. Its links and tags live in their own tables, so a note can be found from either side.
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
