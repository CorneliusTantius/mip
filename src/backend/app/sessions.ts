import { createSession, deleteSession, getSession, listMessages, listSessions, renameSession, setSessionSettings, type Session } from "../storage/sessions.js";
import { enabledSkillNames } from "../storage/skills.js";
import { AppError } from "./errors.js";
import { pickAgentName } from "./names.js";
import { defaultPersona, hasPersona } from "./personas.js";
import { findProvider, hasProvider } from "./providers.js";
import { removeWorkspace } from "./tools/workspace.js";
import { activeRunId } from "./runs.js";
import { enabledSkills, setChatSkills } from "./skills/registry.js";

// Every chat, with the names of the skills it has enabled.
export function listChats(): (Session & { skills: string[] })[] {
  return listSessions().map((session) => ({ ...session, skills: enabledSkillNames(session.id) }));
}

// A new chat gets a random agent name that no other chat has. The persona is fixed for the chat's life.
export function createChat(providerId: unknown, personaId: unknown = defaultPersona().id): Session {
  if (typeof providerId !== "string" || !hasProvider(providerId)) throw new AppError(400, "unknown provider");
  if (typeof personaId !== "string" || !hasPersona(personaId)) throw new AppError(400, "unknown persona");
  const taken = new Set(listSessions().map((s) => s.title));
  return createSession(providerId, personaId, pickAgentName(taken));
}

// A chat with its messages, the id of the run still going in it (if any), and the names of the skills it has enabled.
export function getChat(id: string) {
  return {
    session: requireSession(id),
    messages: listMessages(id),
    activeRunId: activeRunId(id),
    skills: enabledSkills(id).map((skill) => skill.name),
  };
}

// Replaces the skills a chat has enabled. Each name must be an installed skill.
export function chooseChatSkills(id: string, names: unknown): string[] {
  requireSession(id);
  if (!Array.isArray(names) || !names.every((name) => typeof name === "string")) throw new AppError(400, "skills must be a list of names");
  return setChatSkills(id, names);
}

// Renames a chat and/or sets its model and thinking level. Empty values mean the provider's default.
// The model must be one the provider lists, and the thinking level one that model accepts.
// The model and thinking level apply to the next message, and the chat keeps them.
export async function updateChat(id: string, changes: { title?: unknown; model?: unknown; thinking?: unknown }): Promise<Session> {
  const session = requireSession(id);
  if (changes.title !== undefined) {
    const title = String(changes.title ?? "").trim();
    if (!title) throw new AppError(400, "title is required");
    renameSession(id, title);
  }
  if (changes.model !== undefined || changes.thinking !== undefined) {
    const model = changes.model === undefined ? session.model : optionalText(changes.model);
    const catalog = await findProvider(session.providerId).models();
    const option = catalog.find((m) => m.id === (model ?? ""));
    if (model && !option) throw new AppError(400, `this provider has no model "${model}"`);

    const levels: readonly string[] = option?.thinkingLevels ?? [];
    let thinking = changes.thinking === undefined ? session.thinking : optionalText(changes.thinking);
    if (thinking && !levels.includes(thinking)) {
      // A new model may not have the level the chat had. Clear it. A level picked directly must be valid.
      if (changes.thinking !== undefined) throw new AppError(400, `this model has no thinking level "${thinking}"`);
      thinking = null;
    }
    setSessionSettings(id, model, thinking);
  }
  return getSession(id)!;
}

function optionalText(value: unknown): string | null {
  return String(value ?? "").trim() || null;
}

// Deletes a chat, its messages, and its workspace with any repository copies in it.
export function deleteChat(id: string): void {
  requireSession(id);
  if (activeRunId(id)) throw new AppError(409, "this chat is still running");
  deleteSession(id);
  removeWorkspace(id);
}

function requireSession(id: string): Session {
  const session = getSession(id);
  if (!session) throw new AppError(404, "no such session");
  return session;
}
