import { randomUUID } from "node:crypto";
import { db, type Row } from "./db.js";

// An agent: one conversation with one provider, one persona, and its own model and thinking level.
export interface Agent {
  id: string;
  providerId: string;
  // The provider's own agent id, used to resume its conversation.
  providerSessionId: string | null;
  // Chosen when the agent is created, and kept for the agent's life.
  personaId: string;
  // Null means the provider's default. Changes apply to the next message.
  model: string | null;
  thinking: string | null;
  // The agent's name, given when the agent is created. Renaming changes it.
  title: string;
  // Whether bots may send tasks to this agent. The user turns it on per agent.
  openToBots: boolean;
  updatedAt: number;
}

// One tool call in a reply: its name, its input as JSON text, and its result. A result is null when the run ended before it came.
export interface ToolCall {
  name: string;
  input: string;
  output: string | null;
  isError: boolean;
}

// A question the agent asks the user, shown under its reply. The answer is sent as the next message, so the run that asked has ended.
export type Ask = { question: string } & (
  | { kind: "choice" | "multi"; options: string[] }
  | { kind: "text"; placeholder: string }
  | { kind: "slider"; min: number; max: number; step: number; value: number }
);

// One message in an agent. Tool names are kept so the transcript can show what was used, and the calls keep the details.
export interface Message {
  role: "user" | "assistant";
  text: string;
  tools: string[];
  calls: ToolCall[];
  error: string | null;
  // The question the reply ends with, if the agent asked one.
  ask: Ask | null;
}

// What a caller saves. A message with no calls (a user's message, for example) can leave them out.
export type NewMessage = Omit<Message, "calls" | "ask"> & { calls?: ToolCall[]; ask?: Ask | null };

function toAgent(row: Row): Agent {
  return {
    id: row.id,
    providerId: row.provider_id,
    providerSessionId: row.provider_session_id,
    personaId: row.persona_id,
    model: row.model ?? null,
    thinking: row.thinking ?? null,
    title: row.title,
    openToBots: row.open_to_bots === 1,
    updatedAt: row.updated_at,
  };
}

export function insertAgent(providerId: string, personaId: string, title: string): Agent {
  const id = randomUUID();
  const now = Date.now();
  db.prepare("INSERT INTO agents (id, provider_id, persona_id, title, updated_at, meta_updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    id,
    providerId,
    personaId,
    title,
    now,
    now,
  );
  return getAgent(id)!;
}

export function listAgents(): Agent[] {
  return (db.prepare("SELECT * FROM agents ORDER BY updated_at DESC").all() as Row[]).map(toAgent);
}

export function getAgent(id: string): Agent | undefined {
  const row = db.prepare("SELECT * FROM agents WHERE id = ?").get(id) as Row | undefined;
  return row && toAgent(row);
}

export function countAgentsWithPersona(personaId: string): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM agents WHERE persona_id = ?").get(personaId) as Row).n;
}

export function listMessages(agentId: string): Message[] {
  // Sent time first. Messages synced from another machine are inserted later, so the insert order is not always the agent order.
  const rows = db.prepare("SELECT role, text, tools, calls, error, ask FROM messages WHERE agent_id = ? ORDER BY created_at, id").all(agentId) as Row[];
  return rows.map((row) => ({
    role: row.role,
    text: row.text,
    tools: JSON.parse(row.tools),
    calls: JSON.parse(row.calls),
    error: row.error,
    ask: row.ask ? JSON.parse(row.ask) : null,
  }));
}

export function addMessage(agentId: string, message: NewMessage): void {
  db.prepare("INSERT INTO messages (agent_id, role, text, tools, calls, error, ask, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
    agentId,
    message.role,
    message.text,
    JSON.stringify(message.tools),
    JSON.stringify(message.calls ?? []),
    message.error,
    message.ask ? JSON.stringify(message.ask) : null,
    Date.now(),
  );
}

export function renameAgent(id: string, title: string): void {
  db.prepare("UPDATE agents SET title = ?, meta_updated_at = ? WHERE id = ?").run(title, Date.now(), id);
}

export function setAgentSettings(id: string, model: string | null, thinking: string | null): void {
  db.prepare("UPDATE agents SET model = ?, thinking = ?, meta_updated_at = ? WHERE id = ?").run(model, thinking, Date.now(), id);
}

export function setAgentOpenToBots(id: string, openToBots: boolean): void {
  db.prepare("UPDATE agents SET open_to_bots = ?, meta_updated_at = ? WHERE id = ?").run(openToBots ? 1 : 0, Date.now(), id);
}

// Called when a run ends. Stores the provider's agent id, so the next message resumes that conversation.
export function saveProviderSession(agentId: string, providerSessionId: string | undefined): void {
  db.prepare("UPDATE agents SET provider_session_id = COALESCE(?, provider_session_id), updated_at = ? WHERE id = ?").run(
    providerSessionId ?? null,
    Date.now(),
    agentId,
  );
}

// Removes the agent with its messages and runs. Provider files (Claude, Pi) are left alone.
export function deleteAgent(id: string): void {
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM run_events WHERE run_id IN (SELECT id FROM runs WHERE agent_id = ?)").run(id);
    db.prepare("DELETE FROM runs WHERE agent_id = ?").run(id);
    db.prepare("DELETE FROM messages WHERE agent_id = ?").run(id);
    db.prepare("DELETE FROM agents WHERE id = ?").run(id);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
