import type { ThinkingLevel } from "../../adapters/contract.js";
import type { ToolCall } from "../../storage/agents.js";
import { type Bot, listBots } from "../../storage/bots.js";
import { addRoomMessage, type RoomMessage, roomMessagesAfter } from "../../storage/room.js";
import { getRoom, type Room } from "../../storage/rooms.js";
import { HOST, PORT } from "../config.js";
import { AppError } from "../errors.js";
import { findProvider } from "../providers.js";
import { ToolCallLog } from "../tools/calls.js";
import { BOT_TOOLS, botDeferredTools, registerRun, releaseRun, toolGuidesPrompt } from "../tools/index.js";
import { converseRoom, mentionedBots } from "./engine.js";

// How many turns one message can set off, and how much of its room each bot sees.
const MAX_TURNS = 8;
const HISTORY = 30;
const MAX_TEXT = 4000;

// The rooms where a conversation is running, and who is speaking in each. These are in memory, so a restart clears them.
const talking = new Map<string, { speaking: string | null }>();

export function roomStatus(roomId: string) {
  const state = talking.get(roomId);
  return { busy: state !== undefined, speaking: state?.speaking ?? null };
}

// A room's messages after a sequence id. With 0, the latest messages.
export function roomMessages(roomId: string, afterId: number): RoomMessage[] {
  findRoom(roomId);
  return roomMessagesAfter(roomId, afterId, afterId > 0 ? 200 : 100);
}

// Posts a message to a room. The room's bots that are named in it answer first. With no names, every bot in the room takes a turn in order.
// The conversation runs in the background, so this returns as soon as the message is saved.
export function postToRoom(input: unknown): RoomMessage {
  const body = (input ?? {}) as { room?: unknown; text?: unknown };
  const room = findRoom(String(body.room ?? ""));
  if (talking.has(room.id)) throw new AppError(409, "this room is busy, wait for the bots to finish");
  const text = String(body.text ?? "").trim();
  if (!text) throw new AppError(400, "message is required");
  if (text.length > MAX_TEXT) throw new AppError(400, `message must be ${MAX_TEXT} characters or fewer`);

  const message = addRoomMessage({ roomId: room.id, kind: "user", botId: null, authorName: "You", text });
  const members = listBots().filter((bot) => room.botIds.includes(bot.id));
  // With no @mention, the room master speaks first. The others keep their order.
  const master = members.find((bot) => bot.id === room.masterBotId);
  const ordered = master ? [master, ...members.filter((bot) => bot !== master)] : members;
  if (members.length === 0) {
    addRoomMessage({ roomId: room.id, kind: "system", botId: null, authorName: "System", text: "No bots in this room yet. Add some with Members." });
    return message;
  }

  const named = mentionedBots(text, members);
  talking.set(room.id, { speaking: null });
  converseRoom<Bot, ToolCall[]>({
    bots: members,
    queue: named.length > 0 ? named : ordered,
    maxTurns: MAX_TURNS,
    runTurn: (bot) => runTurn(room, bot, members),
    say: (event) => {
      if (event.kind === "bot") {
        addRoomMessage({ roomId: room.id, kind: "bot", botId: event.bot.id, authorName: event.bot.name, text: event.text, calls: event.calls });
      } else {
        addRoomMessage({ roomId: room.id, kind: "system", botId: null, authorName: "System", text: event.text });
      }
    },
    speaking: (name) => {
      talking.set(room.id, { speaking: name });
    },
  })
    .catch((err: unknown) => {
      console.error("room conversation failed:", err);
    })
    .finally(() => {
      talking.delete(room.id);
    });
  return message;
}

function findRoom(roomId: string): Room {
  const room = getRoom(roomId);
  if (!room) throw new AppError(404, "no such room");
  return room;
}

// What every bot is told about the room it is in. The guides of its tools follow it in the system prompt.
function roomRules(name: string): string {
  return `You are in the room "${name}" with the user and other bots. Keep each message short.`;
}

// One bot's turn in a room: its persona, the room's rules, the guides of its tools, and the room's recent messages. Its reply is the text
// it writes. Its tools are reached through the app's tool endpoint, with a token that works only for this turn and this room.
async function runTurn(room: Room, bot: Bot, members: Bot[]): Promise<{ text: string; calls: ToolCall[] }> {
  const history = roomMessagesAfter(room.id, 0, HISTORY)
    .map((m) => `${m.authorName}: ${m.text}`)
    .join("\n");
  const others = members.filter((b) => b.id !== bot.id).map((b) => b.name);
  const prompt = [
    "Room so far:",
    history,
    "",
    `You are ${bot.name}. Write your next message to the room, and only that message.`,
    "Mention a bot with @Name when you need it to answer. Reply with PASS if you have nothing to add.",
    `Other bots in the room: ${others.join(", ") || "none"}.`,
  ].join("\n");
  const systemPrompt = [bot.persona, roomRules(room.name), toolGuidesPrompt(BOT_TOOLS)].filter(Boolean).join("\n\n");

  const deferred = botDeferredTools();
  const token = registerRun({ tools: BOT_TOOLS, deferred, botId: bot.id, roomId: room.id });
  const calls = new ToolCallLog();
  let text = "";
  try {
    for await (const event of findProvider(bot.providerId).run({
      prompt,
      systemPrompt,
      tools: BOT_TOOLS,
      deferredTools: deferred,
      botId: bot.id,
      roomId: room.id,
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
