import { db, type Row } from "./db.js";
import { BOT_COLORS, type BotColor, isBotColor } from "./bot-colors.js";

// A bot is a named agent in the shared room. Its replies come from its provider.
export interface Bot {
  id: string;
  name: string;
  persona: string;
  providerId: string;
  model: string | null;
  thinking: string | null;
  // The color the room tints this bot's messages with.
  color: BotColor;
}

function toBot(row: Row): Bot {
  return {
    id: row.id,
    name: row.name,
    persona: row.persona,
    providerId: row.provider_id,
    model: row.model ?? null,
    thinking: row.thinking ?? null,
    color: isBotColor(row.color) ? row.color : BOT_COLORS[0],
  };
}

export function listBots(): Bot[] {
  return (db.prepare("SELECT * FROM bots ORDER BY name COLLATE NOCASE").all() as Row[]).map(toBot);
}

export function getBot(id: string): Bot | undefined {
  const row = db.prepare("SELECT * FROM bots WHERE id = ?").get(id) as Row | undefined;
  return row && toBot(row);
}

export function getBotByName(name: string): Bot | undefined {
  const row = db.prepare("SELECT * FROM bots WHERE name = ?").get(name) as Row | undefined;
  return row && toBot(row);
}

export function insertBot(bot: Bot): void {
  const now = Date.now();
  db.prepare("INSERT INTO bots (id, name, persona, provider_id, model, thinking, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    bot.id,
    bot.name,
    bot.persona,
    bot.providerId,
    bot.model,
    bot.thinking,
    bot.color,
    now,
    now,
  );
}

export function updateBot(bot: Bot): void {
  db.prepare("UPDATE bots SET name = ?, persona = ?, provider_id = ?, model = ?, thinking = ?, color = ?, updated_at = ? WHERE id = ?").run(
    bot.name,
    bot.persona,
    bot.providerId,
    bot.model,
    bot.thinking,
    bot.color,
    Date.now(),
    bot.id,
  );
}

// A bot leaves every room and loses its skills when it is deleted. Its messages stay in the rooms, with its name.
export function deleteBot(id: string): void {
  db.prepare("DELETE FROM room_bots WHERE bot_id = ?").run(id);
  db.prepare("DELETE FROM bot_skill_enablements WHERE bot_id = ?").run(id);
  db.prepare("DELETE FROM bots WHERE id = ?").run(id);
}
