import { db, type Row } from "./db.js";

// Which skills each agent and each bot has enabled. A skill is stored by name, and it is checked against the registry when it is used.

export function enabledSkillNames(agentId: string): string[] {
  return (db.prepare("SELECT skill FROM skill_enablements WHERE agent_id = ? ORDER BY skill").all(agentId) as Row[]).map((row) => row.skill);
}

// Replaces the agent's enabled skills in one step.
export function saveAgentSkills(agentId: string, names: string[]): void {
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM skill_enablements WHERE agent_id = ?").run(agentId);
    for (const name of names) db.prepare("INSERT INTO skill_enablements (agent_id, skill) VALUES (?, ?)").run(agentId, name);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function botSkillNames(botId: string): string[] {
  return (db.prepare("SELECT skill FROM bot_skill_enablements WHERE bot_id = ? ORDER BY skill").all(botId) as Row[]).map((row) => row.skill);
}

// Replaces the bot's enabled skills in one step.
export function saveBotSkills(botId: string, names: string[]): void {
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM bot_skill_enablements WHERE bot_id = ?").run(botId);
    for (const name of names) db.prepare("INSERT INTO bot_skill_enablements (bot_id, skill) VALUES (?, ?)").run(botId, name);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

// Called when a skill is removed, so no agent or bot keeps a pointer to it.
export function removeSkillEnablements(name: string): void {
  db.prepare("DELETE FROM skill_enablements WHERE skill = ?").run(name);
  db.prepare("DELETE FROM bot_skill_enablements WHERE skill = ?").run(name);
}
