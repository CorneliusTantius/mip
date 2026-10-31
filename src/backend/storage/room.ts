import { db, type Row } from "./db.js";

// One message in the shared room. The author's name is stored with it, so it stays readable after a bot is deleted.
export interface RoomMessage {
  id: number;
  kind: "user" | "bot" | "system";
  botId: string | null;
  authorName: string;
  text: string;
  createdAt: number;
}

function toRoomMessage(row: Row): RoomMessage {
  return { id: row.id, kind: row.kind, botId: row.bot_id ?? null, authorName: row.author_name, text: row.text, createdAt: row.created_at };
}

export function addRoomMessage(message: Omit<RoomMessage, "id" | "createdAt">): RoomMessage {
  const result = db
    .prepare("INSERT INTO room_messages (kind, bot_id, author_name, text, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(message.kind, message.botId, message.authorName, message.text, Date.now());
  return toRoomMessage(db.prepare("SELECT * FROM room_messages WHERE id = ?").get(Number(result.lastInsertRowid)) as Row);
}

// Messages after a sequence id, oldest first. With afterId 0, the latest messages.
export function roomMessagesAfter(afterId: number, limit: number): RoomMessage[] {
  if (afterId > 0) {
    return (db.prepare("SELECT * FROM room_messages WHERE id > ? ORDER BY id LIMIT ?").all(afterId, limit) as Row[]).map(toRoomMessage);
  }
  return (db.prepare("SELECT * FROM (SELECT * FROM room_messages ORDER BY id DESC LIMIT ?) ORDER BY id").all(limit) as Row[]).map(toRoomMessage);
}
