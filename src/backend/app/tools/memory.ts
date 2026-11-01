import type { ToolSpec } from "../../adapters/contract.js";
import { readNote, searchMemory, writeNote } from "../memory.js";
import { fail, ok } from "./result.js";

// Memory is shared: the agent and the bots see the same notes.
export const memorySearchTool: ToolSpec = {
  name: "memory_search",
  guide: "Searches the notes shared by the agent and the bots, by words. Check it when the user refers to something from before, before you say you do not know.",
  description: "Search the notes shared by the agent and the bots. Returns the matching note titles with a snippet of each.",
  inputSchema: {
    type: "object",
    properties: { query: { type: "string", description: "Words to look for" } },
    required: ["query"],
  },
  async run({ query }) {
    const hits = searchMemory(String(query ?? ""), 10);
    if (hits.length === 0) return ok("No notes match.");
    return ok(hits.map((hit) => `${hit.title}: ${hit.snippet}`).join("\n"));
  },
};

export const memoryReadTool: ToolSpec = {
  name: "memory_read",
  guide: "Reads one shared note by its title. Use it after memory_search has found the note.",
  description: "Read one note by its title. Shows the full text, the notes it links to, the notes that link to it, and its tags.",
  inputSchema: {
    type: "object",
    properties: { title: { type: "string", description: "Title of the note" } },
    required: ["title"],
  },
  async run({ title }) {
    const note = readNote(String(title ?? ""));
    if (!note) return fail(`No note called "${title}"`);
    return ok(
      [
        `# ${note.title}`,
        note.body,
        "",
        `Links to: ${note.links.join(", ") || "none"}`,
        `Linked from: ${note.backlinks.join(", ") || "none"}`,
        `Tags: ${note.tags.map((t) => "#" + t).join(" ") || "none"}`,
      ].join("\n"),
    );
  },
};

// Changes part of a note that already exists. The agent and the bots can't create or delete notes: the user does that in the memory screen.
export const memoryEditTool: ToolSpec = {
  name: "memory_edit",
  guide: "Changes one part of a note that already exists, such as correcting a fact or adding a line. You cannot create or delete notes; the user does that. Do not edit notes for small talk.",
  description:
    "Edit a note that already exists. Replaces one exact piece of its text with new text. The old text must appear exactly once in the note. Links ([[Title]]) and tags (#tag) in the new text are kept up to date.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Title of the existing note" },
      oldText: { type: "string", description: "Exact text to replace. It must appear once in the note" },
      newText: { type: "string", description: "Text to put in its place. Empty removes the old text" },
    },
    required: ["title", "oldText", "newText"],
  },
  async run({ title, oldText, newText }) {
    const note = readNote(String(title ?? ""));
    if (!note) return fail(`No note called "${title}". Only notes that already exist can be edited.`);
    const search = String(oldText ?? "");
    if (!search) return fail("oldText is required");

    const count = note.body.split(search).length - 1;
    if (count === 0) return fail(`oldText was not found in "${note.title}"`);
    if (count > 1) return fail(`oldText appears ${count} times in "${note.title}". Include more of the text around it so it matches once.`);

    // A function, so "$" in the new text is kept as written.
    const body = note.body.replace(search, () => String(newText ?? ""));
    if (!body.trim()) return fail(`"${note.title}" would be empty. Only the user can delete a note.`);
    const saved = writeNote(note.title, body);
    return ok(`Edited note "${saved.title}" (links: ${saved.links.join(", ") || "none"}; tags: ${saved.tags.join(", ") || "none"})`);
  },
};
