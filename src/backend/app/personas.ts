import { randomUUID } from "node:crypto";
import { countSessionsWithPersona, deletePersona, getPersona, insertPersona, listPersonas, type Persona, setDefaultPersona, updatePersona } from "../storage/store.js";
import { AppError } from "./errors.js";

// The built-in persona. It always exists and can't be deleted. It is also the fallback when a chat's persona is missing.
export const DEFAULT_PERSONA_ID = "default";

// The text the built-in persona starts with. Each provider replaces its own default prompt with a persona's text.
const DEFAULT_SYSTEM_PROMPT = `You are mip's assistant. You help with everyday questions, writing, planning, research, and software work. Work out what kind of task each message is and handle it that way.

Working style:
- Reply in the language the user writes in.
- Understand the request before acting. If a missing detail would change the result, ask one short question. Otherwise make the most reasonable assumption and say what it was.
- For software work, read the relevant files before changing them. Make the smallest change that solves the problem, then check it by running it or reading it back. Say what changed and what you could not verify.
- For multi-step work, give a short plan, then do it. End with what was done, what was left out, and anything that still needs the user.

Tools:
- read, write, edit, and bash work in this chat's own workspace folder. Paths outside it are refused.
- memory_search and memory_read look at notes shared by all chats. Check them when the user refers to something from before.
- memory_edit changes one part of a note that already exists, such as correcting a fact or adding a line. You cannot create or delete notes; the user does that. Do not edit notes for small talk.

Answers:
- Lead with the answer. Add the reasoning only when it helps.
- Keep replies short unless the task needs more. Use Markdown where it helps: code blocks for code, short lists for steps. Skip headings in short replies.
- If you are not sure, say so and say what would settle it. Never invent file contents, command output, or sources, and never say you ran something you did not run.`;

// Every install has the built-in persona, and one persona is always the default.
if (!getPersona(DEFAULT_PERSONA_ID)) {
  insertPersona({ id: DEFAULT_PERSONA_ID, name: "Default", systemPrompt: DEFAULT_SYSTEM_PROMPT });
}
if (!listPersonas().some((p) => p.isDefault)) setDefaultPersona(DEFAULT_PERSONA_ID);

export function allPersonas(): Persona[] {
  return listPersonas();
}

export function defaultPersona(): Persona {
  return listPersonas().find((p) => p.isDefault) ?? getPersona(DEFAULT_PERSONA_ID)!;
}

export function hasPersona(id: string): boolean {
  return getPersona(id) !== undefined;
}

// The text a chat's persona uses. Read on every run, so edits apply to the next message.
export function personaPrompt(id: string): string {
  return (getPersona(id) ?? getPersona(DEFAULT_PERSONA_ID)!).systemPrompt;
}

export function createPersona(name: unknown, systemPrompt: unknown): Persona {
  const id = randomUUID();
  insertPersona({ id, ...checkFields(name, systemPrompt) });
  return getPersona(id)!;
}

export function editPersona(id: string, name: unknown, systemPrompt: unknown): Persona {
  requirePersona(id);
  updatePersona({ id, ...checkFields(name, systemPrompt) });
  return getPersona(id)!;
}

// New chats start with this persona from now on.
export function makeDefaultPersona(id: string): void {
  requirePersona(id);
  setDefaultPersona(id);
}

// The built-in persona can't be removed, and neither can the default or a persona that chats still use.
export function removePersona(id: string): void {
  const persona = requirePersona(id);
  if (id === DEFAULT_PERSONA_ID) throw new AppError(400, "the built-in Default persona can't be deleted");
  if (persona.isDefault) throw new AppError(400, "set another persona as default before deleting this one");
  const chats = countSessionsWithPersona(id);
  if (chats > 0) throw new AppError(409, `${chats} ${chats === 1 ? "chat uses" : "chats use"} this persona`);
  deletePersona(id);
}

function requirePersona(id: string): Persona {
  const persona = getPersona(id);
  if (!persona) throw new AppError(404, "no such persona");
  return persona;
}

function checkFields(name: unknown, systemPrompt: unknown): { name: string; systemPrompt: string } {
  const cleanName = String(name ?? "").trim();
  const cleanPrompt = String(systemPrompt ?? "").trim();
  if (!cleanName) throw new AppError(400, "name is required");
  if (!cleanPrompt) throw new AppError(400, "system prompt is required");
  return { name: cleanName, systemPrompt: cleanPrompt };
}
