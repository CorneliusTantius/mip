import { db, type Row } from "./db.js";

// Which skills each chat has enabled. A skill is stored by name, and it is checked against the registry when it is used.

export function enabledSkillNames(chatId: string): string[] {
  return (db.prepare("SELECT skill FROM skill_enablements WHERE session_id = ? ORDER BY skill").all(chatId) as Row[]).map((row) => row.skill);
}

// Replaces the chat's enabled skills in one step.
export function saveChatSkills(chatId: string, names: string[]): void {
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM skill_enablements WHERE session_id = ?").run(chatId);
    for (const name of names) db.prepare("INSERT INTO skill_enablements (session_id, skill) VALUES (?, ?)").run(chatId, name);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

// Called when a skill is removed, so no chat keeps a pointer to it.
export function removeSkillEnablements(name: string): void {
  db.prepare("DELETE FROM skill_enablements WHERE skill = ?").run(name);
}
