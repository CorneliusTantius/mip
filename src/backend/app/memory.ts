import { randomUUID } from "node:crypto";
import { allLinks, deleteNote, getNoteByTitle, linksFrom, linksTo, listNotes, saveNote, searchNotes, tagsOf } from "../storage/store.js";
import { AppError } from "./errors.js";

// [[Title]] or [[Title|alias]] makes a link. #tag marks a tag.
const LINK = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
const TAG = /(?:^|\s)#([\p{L}\p{N}_-]+)/gu;

// Titles ignore case, so [[Giza]] and [[giza]] are one link. The first spelling is kept.
function parseLinks(body: string): string[] {
  const byTitle = new Map<string, string>();
  for (const [, raw] of body.matchAll(LINK)) {
    const title = raw.trim();
    if (title && !byTitle.has(title.toLowerCase())) byTitle.set(title.toLowerCase(), title);
  }
  return [...byTitle.values()];
}

function parseTags(body: string): string[] {
  return [...new Set([...body.matchAll(TAG)].map((m) => m[1].toLowerCase()))];
}

// Creates a note, or replaces the one with the same title (titles ignore case).
export function writeNote(title: unknown, body: unknown): { title: string; links: string[]; tags: string[] } {
  const cleanTitle = String(title ?? "").trim();
  const text = String(body ?? "");
  if (!cleanTitle) throw new AppError(400, "title is required");
  const id = getNoteByTitle(cleanTitle)?.id ?? randomUUID();
  const links = parseLinks(text);
  const tags = parseTags(text);
  saveNote({ id, title: cleanTitle, body: text }, links, tags);
  return { title: cleanTitle, links, tags };
}

// One note, with the notes it links to, the notes that link to it, and its tags.
export function readNote(title: string) {
  const note = getNoteByTitle(title.trim());
  if (!note) return undefined;
  return { ...note, links: linksFrom(note.id), backlinks: linksTo(note.title), tags: tagsOf(note.id) };
}

// Search by any word of the query, with the best matches first. Words shorter than minLength are ignored.
export function searchMemory(query: string, limit: number, minLength = 2) {
  const words = (query.match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length >= minLength);
  if (words.length === 0) return [];
  return searchNotes(words.map((w) => `"${w}"`).join(" OR "), limit);
}

// The memory screen's list: every note, or the notes that match a search.
export function memoryList(query: string) {
  return query.trim() ? searchMemory(query, 100, 1) : listNotes();
}

// The memory graph: a node per note, plus a node for each link to a title that has no note yet. Links are undirected.
export function memoryGraph() {
  const notes = listNotes();
  const titleById = new Map(notes.map((note) => [note.id, note.title]));
  const nodes = new Map<string, { id: string; title: string; missing: boolean; degree: number }>();
  for (const note of notes) nodes.set(note.title.toLowerCase(), { id: note.title.toLowerCase(), title: note.title, missing: false, degree: 0 });

  const edges = new Map<string, { source: string; target: string }>();
  for (const { fromId, toTitle } of allLinks()) {
    const from = titleById.get(fromId)?.toLowerCase();
    const to = toTitle.toLowerCase();
    if (!from || from === to) continue;
    if (!nodes.has(to)) nodes.set(to, { id: to, title: toTitle, missing: true, degree: 0 });
    const key = [from, to].sort().join("|");
    if (edges.has(key)) continue;
    edges.set(key, { source: from, target: to });
    nodes.get(from)!.degree++;
    nodes.get(to)!.degree++;
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

export function forgetNote(title: string): void {
  const note = getNoteByTitle(title.trim());
  if (!note) throw new AppError(404, "no such note");
  deleteNote(note.id);
}

// The notes most relevant to a prompt, written as text for the system prompt. Empty when nothing matches.
export function recallFor(prompt: string): string {
  const hits = searchMemory(prompt, 5, 4);
  if (hits.length === 0) return "";
  const lines = hits.map((hit) => `- ${hit.title}: ${hit.snippet}`);
  return `Notes from memory that may matter here. Use memory_read for the full text.\n${lines.join("\n")}`;
}
