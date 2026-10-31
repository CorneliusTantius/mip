import { randomUUID } from "node:crypto";
import { db, type Row } from "./db.js";

// A chat: one conversation with one provider, one persona, and its own model and thinking level.
export interface Session {
  id: string;
  providerId: string;
  // The provider's own session id, used to resume its conversation.
  providerSessionId: string | null;
  // Chosen when the chat is created, and kept for the chat's life.
  personaId: string;
  // Null means the provider's default. Changes apply to the next message.
  model: string | null;
  thinking: string | null;
  // The agent's name, given when the chat is created. Renaming changes it.
  title: string;
  updatedAt: number;
}

// One message in a chat. Tool names are kept so the transcript can show what was used.
export interface Message {
  role: "user" | "assistant";
  text: string;
  tools: string[];
  error: string | null;
}

function toSession(row: Row): Session {
  return {
    id: row.id,
    providerId: row.provider_id,
    providerSessionId: row.provider_session_id,
    personaId: row.persona_id,
    model: row.model ?? null,
    thinking: row.thinking ?? null,
    title: row.title,
    updatedAt: row.updated_at,
  };
}

export function createSession(providerId: string, personaId: string, title: string): Session {
  const id = randomUUID();
  db.prepare("INSERT INTO sessions (id, provider_id, persona_id, title, updated_at) VALUES (?, ?, ?, ?, ?)").run(id, providerId, personaId, title, Date.now());
  return getSession(id)!;
}

export function listSessions(): Session[] {
  return (db.prepare("SELECT * FROM sessions ORDER BY updated_at DESC").all() as Row[]).map(toSession);
}

export function getSession(id: string): Session | undefined {
  const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as Row | undefined;
  return row && toSession(row);
}

export function countSessionsWithPersona(personaId: string): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE persona_id = ?").get(personaId) as Row).n;
}

export function listMessages(sessionId: string): Message[] {
  const rows = db.prepare("SELECT role, text, tools, error FROM messages WHERE session_id = ? ORDER BY id").all(sessionId) as Row[];
  return rows.map((row) => ({ role: row.role, text: row.text, tools: JSON.parse(row.tools), error: row.error }));
}

export function addMessage(sessionId: string, message: Message): void {
  db.prepare("INSERT INTO messages (session_id, role, text, tools, error, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    sessionId,
    message.role,
    message.text,
    JSON.stringify(message.tools),
    message.error,
    Date.now(),
  );
}

export function renameSession(id: string, title: string): void {
  db.prepare("UPDATE sessions SET title = ? WHERE id = ?").run(title, id);
}

export function setSessionSettings(id: string, model: string | null, thinking: string | null): void {
  db.prepare("UPDATE sessions SET model = ?, thinking = ? WHERE id = ?").run(model, thinking, id);
}

// Called when a run ends. Stores the provider's session id, so the next message resumes that conversation.
export function saveProviderSession(sessionId: string, providerSessionId: string | undefined): void {
  db.prepare("UPDATE sessions SET provider_session_id = COALESCE(?, provider_session_id), updated_at = ? WHERE id = ?").run(
    providerSessionId ?? null,
    Date.now(),
    sessionId,
  );
}

// Removes the chat with its messages and runs. Provider files (Claude, Pi) are left alone.
export function deleteSession(id: string): void {
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM run_events WHERE run_id IN (SELECT id FROM runs WHERE session_id = ?)").run(id);
    db.prepare("DELETE FROM runs WHERE session_id = ?").run(id);
    db.prepare("DELETE FROM messages WHERE session_id = ?").run(id);
    db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
