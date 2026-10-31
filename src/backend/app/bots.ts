import { randomUUID } from "node:crypto";
import { deleteBot, getBot, getBotByName, insertBot, listBots, type Bot, updateBot } from "../storage/store.js";
import { AppError } from "./errors.js";
import { findProvider, hasProvider } from "./providers.js";

// A bot is named the way you would mention it: a letter, then letters, digits, dashes or underscores.
const NAME = /^[A-Za-z][A-Za-z0-9_-]{1,23}$/;
const MAX_PERSONA = 4000;

export function allBots(): Bot[] {
  return listBots();
}

export async function createBot(input: unknown): Promise<Bot> {
  const bot = { id: randomUUID(), ...(await checkFields(undefined, input)) };
  insertBot(bot);
  return bot;
}

export async function editBot(id: string, input: unknown): Promise<Bot> {
  if (!getBot(id)) throw new AppError(404, "no such bot");
  updateBot({ id, ...(await checkFields(id, input)) });
  return getBot(id)!;
}

export function removeBot(id: string): void {
  if (!getBot(id)) throw new AppError(404, "no such bot");
  deleteBot(id);
}

// Checks a bot's fields. The model and thinking level must be ones the bot's provider lists right now.
async function checkFields(id: string | undefined, input: unknown): Promise<Omit<Bot, "id">> {
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

  return { name, persona, providerId, model, thinking };
}
