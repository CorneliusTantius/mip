import type { ThinkingLevel } from "../../adapters/contract.js";
import type { ToolCall } from "../../storage/agents.js";
import { type Bot, listBots } from "../../storage/bots.js";
import { addRoomMessage, type RoomMessage, roomMessagesAfter } from "../../storage/room.js";
import { HOST, PORT } from "../config.js";
import { AppError } from "../errors.js";
import { findProvider } from "../providers.js";
import { ToolCallLog } from "../tools/calls.js";
import { BOT_DEFERRED, BOT_TOOLS, registerRun, releaseRun, toolGuidesPrompt } from "../tools/index.js";
import { converseRoom, mentionedBots } from "./engine.js";

// How many turns one message can set off, and how much of the room each bot sees.
const MAX_TURNS = 8;
const HISTORY = 30;
const MAX_TEXT = 4000;
// What every bot is told about the room. The guides of its tools follow it in the system prompt.
const ROOM_RULES = "You are in a shared room with the user and other bots. Keep each message short.";

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
  converseRoom<Bot, ToolCall[]>({
    bots,
    queue: named.length > 0 ? named : bots,
    maxTurns: MAX_TURNS,
    runTurn: (bot) => runTurn(bot, bots),
    say: (event) => {
      if (event.kind === "bot") addRoomMessage({ kind: "bot", botId: event.bot.id, authorName: event.bot.name, text: event.text, calls: event.calls });
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

// One bot's turn: its persona, the room's rules, the guides of its tools, and the recent room. Its reply is the text it writes.
// Its tools are reached through the app's tool endpoint, with a token that works only for this turn.
async function runTurn(bot: Bot, bots: Bot[]): Promise<{ text: string; calls: ToolCall[] }> {
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
  const systemPrompt = [bot.persona, ROOM_RULES, toolGuidesPrompt(BOT_TOOLS)].filter(Boolean).join("\n\n");

  const token = registerRun({ tools: BOT_TOOLS, deferred: BOT_DEFERRED });
  const calls = new ToolCallLog();
  let text = "";
  try {
    for await (const event of findProvider(bot.providerId).run({
      prompt,
      systemPrompt,
      tools: BOT_TOOLS,
      deferredTools: BOT_DEFERRED,
      toolServer: { url: `http://${HOST}:${PORT}/mcp`, token },
      model: bot.model ?? undefined,
      thinking: (bot.thinking as ThinkingLevel | null) ?? undefined,
    })) {
      if (event.type === "text") text += event.text;
      if (event.type === "tool_call") calls.start(event.id, event.name, event.input);
      if (event.type === "tool_result") calls.finish(event.id, event.output, event.isError);
      if (event.type === "error") throw new Error(event.message);
    }
  } finally {
    releaseRun(token);
  }
  return { text, calls: calls.calls };
}
