import type { ThinkingLevel } from "../adapters/contract.js";
import { type Bot, listBots } from "../storage/bots.js";
import { addRoomMessage, type RoomMessage, roomMessagesAfter } from "../storage/room.js";
import { AppError } from "./errors.js";
import { findProvider } from "./providers.js";
import { converseRoom, mentionedBots } from "./room-engine.js";
import { BOT_TOOLS } from "./tools/index.js";

// How many turns one message can set off, and how much of the room each bot sees.
const MAX_TURNS = 8;
const HISTORY = 30;
const MAX_TEXT = 4000;

// One conversation at a time. These are in memory, so a restart clears them.
let busy = false;
let speaking: string | null = null;

export function roomStatus() {
  return { busy, speaking };
}

// Messages after a sequence id. With 0, the latest messages.
export function roomMessages(afterId: number): RoomMessage[] {
  return roomMessagesAfter(afterId, afterId > 0 ? 200 : 100);
}

// Posts a message from the user. Bots named in it answer first. With no names, every bot takes a turn in order.
// The conversation runs in the background, so this returns as soon as the message is saved.
export function postToRoom(input: unknown): RoomMessage {
  if (busy) throw new AppError(409, "the room is busy, wait for the bots to finish");
  const text = String((input as { text?: unknown } | undefined)?.text ?? "").trim();
  if (!text) throw new AppError(400, "message is required");
  if (text.length > MAX_TEXT) throw new AppError(400, `message must be ${MAX_TEXT} characters or fewer`);

  const message = addRoomMessage({ kind: "user", botId: null, authorName: "You", text });
  const bots = listBots();
  if (bots.length === 0) {
    addRoomMessage({ kind: "system", botId: null, authorName: "System", text: "Create a bot first. Use Manage bots." });
    return message;
  }

  const named = mentionedBots(text, bots);
  busy = true;
  converseRoom<Bot>({
    bots,
    queue: named.length > 0 ? named : bots,
    maxTurns: MAX_TURNS,
    runTurn: (bot) => runTurn(bot, bots),
    say: (event) => {
      if (event.kind === "bot") addRoomMessage({ kind: "bot", botId: event.bot.id, authorName: event.bot.name, text: event.text });
      else addRoomMessage({ kind: "system", botId: null, authorName: "System", text: event.text });
    },
    speaking: (name) => {
      speaking = name;
    },
  })
    .catch((err: unknown) => {
      console.error("room conversation failed:", err);
    })
    .finally(() => {
      busy = false;
      speaking = null;
    });
  return message;
}

// One bot's turn: its persona, the recent room, and no tools. Its reply is the text it writes.
async function runTurn(bot: Bot, bots: Bot[]): Promise<string> {
  const history = roomMessagesAfter(0, HISTORY)
    .map((m) => `${m.authorName}: ${m.text}`)
    .join("\n");
  const others = bots.filter((b) => b.id !== bot.id).map((b) => b.name);
  const prompt = [
    "Room so far:",
    history,
    "",
    `You are ${bot.name}. Write your next message to the room, and only that message.`,
    "Mention a bot with @Name when you need it to answer. Reply with PASS if you have nothing to add.",
    `Other bots in the room: ${others.join(", ") || "none"}.`,
  ].join("\n");
  const systemPrompt = [
    bot.persona,
    "You are in a shared room with the user and other bots. Keep each message short. You have no tools in this room.",
  ].join("\n\n");

  let text = "";
  for await (const event of findProvider(bot.providerId).run({
    prompt,
    systemPrompt,
    tools: BOT_TOOLS,
    model: bot.model ?? undefined,
    thinking: (bot.thinking as ThinkingLevel | null) ?? undefined,
  })) {
    if (event.type === "text") text += event.text;
    if (event.type === "error") throw new Error(event.message);
  }
  return text;
}
