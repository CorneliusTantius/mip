import { randomUUID } from "node:crypto";
import { BOT_COLORS, type BotColor, isBotColor } from "../storage/bot-colors.js";
import { type Bot, deleteBot, getBot, getBotByName, insertBot, listBots, updateBot } from "../storage/bots.js";
import { botSkillNames } from "../storage/skills.js";
import { AppError } from "./errors.js";
import { findProvider, hasProvider } from "./providers.js";
import { checkSkillNames, setBotSkills } from "./skills/registry.js";

// A bot is named the way you would mention it: a letter, then letters, digits, dashes or underscores.
const NAME = /^[A-Za-z][A-Za-z0-9_-]{1,23}$/;
const MAX_PERSONA = 4000;

// A bot as the app shows it: its settings, and the names of the skills it has enabled.
export type BotView = Bot & { skills: string[] };

function withSkills(bot: Bot): BotView {
  return { ...bot, skills: botSkillNames(bot.id) };
}

export function allBots(): BotView[] {
  return listBots().map(withSkills);
}

// The first color no bot uses yet. Once every color is in use, they repeat in order.
export function nextBotColor(used: readonly string[]): BotColor {
  return BOT_COLORS.find((color) => !used.includes(color)) ?? BOT_COLORS[used.length % BOT_COLORS.length];
}

// A new bot without a color gets the next free one. A bot without skills has none enabled.
export async function createBot(input: unknown): Promise<BotView> {
  const { skills, ...fields } = await checkFields(undefined, input);
  const color = fields.color ?? nextBotColor(listBots().map((bot) => bot.color));
  const bot = { id: randomUUID(), ...fields, color };
  insertBot(bot);
  if (skills) setBotSkills(bot.id, skills);
  return withSkills(bot);
}

// An edit without a color keeps the bot's color. An edit without skills keeps the bot's skills.
export async function editBot(id: string, input: unknown): Promise<BotView> {
  const existing = getBot(id);
  if (!existing) throw new AppError(404, "no such bot");
  const { skills, ...fields } = await checkFields(id, input);
  updateBot({ id, ...fields, color: fields.color ?? existing.color });
  if (skills) setBotSkills(id, skills);
  return withSkills(getBot(id)!);
}

export function removeBot(id: string): void {
  if (!getBot(id)) throw new AppError(404, "no such bot");
  deleteBot(id);
}

// Checks a bot's fields. The model and thinking level must be ones the bot's provider lists right now. Skills, when given, must be
// installed skills.
async function checkFields(id: string | undefined, input: unknown): Promise<Omit<Bot, "id" | "color"> & { color?: BotColor; skills?: string[] }> {
  const body = (input ?? {}) as Record<string, unknown>;
  const name = String(body.name ?? "").trim();
  if (!NAME.test(name)) throw new AppError(400, "name must start with a letter and use 2 to 24 letters, digits, - or _");
  const clash = getBotByName(name);
  if (clash && clash.id !== id) throw new AppError(409, `a bot called ${name} already exists`);

  const persona = String(body.persona ?? "").trim();
  if (!persona) throw new AppError(400, "persona is required");
  if (persona.length > MAX_PERSONA) throw new AppError(400, `persona must be ${MAX_PERSONA} characters or fewer`);

  const providerId = String(body.providerId ?? "claude-cli");
  if (!hasProvider(providerId)) throw new AppError(400, "unknown provider");
  const model = String(body.model ?? "").trim() || null;
  const thinking = String(body.thinking ?? "").trim() || null;

  const catalog = await findProvider(providerId).models();
  const option = catalog.find((m) => m.id === (model ?? ""));
  if (model && !option) throw new AppError(400, `this provider has no model "${model}"`);
  const levels: readonly string[] = option?.thinkingLevels ?? [];
  if (thinking && !levels.includes(thinking)) throw new AppError(400, `this model has no thinking level "${thinking}"`);

  const color = String(body.color ?? "").trim();
  if (color && !isBotColor(color)) throw new AppError(400, `color must be one of ${BOT_COLORS.join(", ")}`);

  let skills: string[] | undefined;
  if (body.skills !== undefined) {
    if (!Array.isArray(body.skills) || !body.skills.every((skill) => typeof skill === "string")) throw new AppError(400, "skills must be a list of names");
    skills = checkSkillNames(body.skills as string[]);
  }

  return { name, persona, providerId, model, thinking, color: isBotColor(color) ? color : undefined, skills };
}
