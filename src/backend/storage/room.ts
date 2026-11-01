import type { ToolCall } from "./agents.js";
import { db, type Row } from "./db.js";

// One message in a room. The author's name is stored with it, so it stays readable after a bot is deleted. A bot's calls
// are the tools its reply used, with their inputs and results. They stay on this machine, as an agent's calls do.
// An "agent" message is the reply of an agent a bot sent a task to. Its author is the agent, so botId is null.
export interface RoomMessage {
  id: number;
  roomId: string;
  kind: "user" | "bot" | "agent" | "system";
  botId: string | null;
  authorName: string;
  text: string;
  calls: ToolCall[];
  createdAt: number;
}

function toRoomMessage(row: Row): RoomMessage {
  return {
    id: row.id,
    roomId: row.room_id,
    kind: row.kind,
    botId: row.bot_id ?? null,
    authorName: row.author_name,
    text: row.text,
    calls: JSON.parse(row.calls),
    createdAt: row.created_at,
  };
}

// What a caller saves. A message with no calls, such as a user's, can leave them out.
export function addRoomMessage(message: Omit<RoomMessage, "id" | "createdAt" | "calls"> & { calls?: ToolCall[] }): RoomMessage {
  const result = db
    .prepare("INSERT INTO room_messages (room_id, kind, bot_id, author_name, text, calls, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(message.roomId, message.kind, message.botId, message.authorName, message.text, JSON.stringify(message.calls ?? []), Date.now());
  return toRoomMessage(db.prepare("SELECT * FROM room_messages WHERE id = ?").get(Number(result.lastInsertRowid)) as Row);
}

// The room's messages after a sequence id, oldest first. With afterId 0, the latest messages.
export function roomMessagesAfter(roomId: string, afterId: number, limit: number): RoomMessage[] {
  if (afterId > 0) {
    return (db.prepare("SELECT * FROM room_messages WHERE room_id = ? AND id > ? ORDER BY id LIMIT ?").all(roomId, afterId, limit) as Row[]).map(toRoomMessage);
  }
  return (db.prepare("SELECT * FROM (SELECT * FROM room_messages WHERE room_id = ? ORDER BY id DESC LIMIT ?) ORDER BY id").all(roomId, limit) as Row[]).map(
    toRoomMessage,
  );
}

// The room's messages that contain every word, newest first. In a word, % and _ match only themselves.
export function searchRoomMessages(roomId: string, words: string[], limit: number): RoomMessage[] {
  if (words.length === 0) return [];
  const where = words.map(() => "text LIKE ? ESCAPE '\\'").join(" AND ");
  const patterns = words.map((word) => `%${word.replace(/[\\%_]/g, "\\$&")}%`);
  return (db.prepare(`SELECT * FROM room_messages WHERE room_id = ? AND ${where} ORDER BY id DESC LIMIT ?`).all(roomId, ...patterns, limit) as Row[]).map(
    toRoomMessage,
  );
}
