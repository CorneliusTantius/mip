import { db, type Row } from "./db.js";

// A persona is a name and a system prompt. Exactly one persona is the default for new agents.
export interface Persona {
  id: string;
  name: string;
  systemPrompt: string;
  isDefault: boolean;
}

type PersonaFields = Omit<Persona, "isDefault">;

function toPersona(row: Row): Persona {
  return { id: row.id, name: row.name, systemPrompt: row.system_prompt, isDefault: row.is_default === 1 };
}

export function listPersonas(): Persona[] {
  return (db.prepare("SELECT * FROM personas ORDER BY created_at").all() as Row[]).map(toPersona);
}

export function getPersona(id: string): Persona | undefined {
  const row = db.prepare("SELECT * FROM personas WHERE id = ?").get(id) as Row | undefined;
  return row && toPersona(row);
}

export function insertPersona(persona: PersonaFields): void {
  const now = Date.now();
  db.prepare("INSERT INTO personas (id, name, system_prompt, is_default, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)").run(
    persona.id,
    persona.name,
    persona.systemPrompt,
    now,
    now,
  );
}

export function updatePersona(persona: PersonaFields): void {
  db.prepare("UPDATE personas SET name = ?, system_prompt = ?, updated_at = ? WHERE id = ?").run(
    persona.name,
    persona.systemPrompt,
    Date.now(),
    persona.id,
  );
}

// Marks one persona as the default and clears the mark from the rest.
export function setDefaultPersona(id: string): void {
  db.prepare("UPDATE personas SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END").run(id);
}

export function deletePersona(id: string): void {
  db.prepare("DELETE FROM personas WHERE id = ?").run(id);
}
