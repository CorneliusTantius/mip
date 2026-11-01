import { db, type Row } from "./db.js";

// The room that the messages from before rooms existed belong to. Its id is fixed, so every machine has the same one.
export const MAIN_ROOM_ID = "main";

// A room: a name, and the bots in it. Its messages are kept apart by room id (see room.ts). A bot can be in several rooms.
export interface Room {
  id: string;
  name: string;
  // The members, by bot id.
  botIds: string[];
  createdAt: number;
  updatedAt: number;
}

// The rooms, oldest first, each with its members.
export function listRooms(): Room[] {
  const members = new Map<string, string[]>();
  for (const row of db.prepare("SELECT room_id, bot_id FROM room_bots").all() as Row[]) {
    members.set(row.room_id, [...(members.get(row.room_id) ?? []), row.bot_id]);
  }
  return (db.prepare("SELECT * FROM rooms ORDER BY created_at, id").all() as Row[]).map((row) => toRoom(row, members.get(row.id) ?? []));
}

export function getRoom(id: string): Room | undefined {
  const row = db.prepare("SELECT * FROM rooms WHERE id = ?").get(id) as Row | undefined;
  if (!row) return undefined;
  const botIds = (db.prepare("SELECT bot_id FROM room_bots WHERE room_id = ?").all(id) as Row[]).map((member) => member.bot_id);
  return toRoom(row, botIds);
}

// Names ignore case, as they do in the database.
export function getRoomByName(name: string): Room | undefined {
  const row = db.prepare("SELECT id FROM rooms WHERE name = ? COLLATE NOCASE").get(name) as Row | undefined;
  return row ? getRoom(row.id) : undefined;
}

export function roomCount(): number {
  return Number((db.prepare("SELECT COUNT(*) AS n FROM rooms").get() as Row).n);
}

export function insertRoom(room: Room): void {
  db.prepare("INSERT INTO rooms (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)").run(room.id, room.name, room.createdAt, room.updatedAt);
  setRoomBots(room.id, room.botIds);
}

// Renames a room and sets its members. The change time moves, so the change reaches GitHub on the next sync.
export function updateRoom(room: Room): void {
  db.prepare("UPDATE rooms SET name = ?, updated_at = ? WHERE id = ?").run(room.name, room.updatedAt, room.id);
  setRoomBots(room.id, room.botIds);
}

// Removes a room with its messages and its members.
export function deleteRoom(id: string): void {
  db.prepare("DELETE FROM room_messages WHERE room_id = ?").run(id);
  db.prepare("DELETE FROM room_bots WHERE room_id = ?").run(id);
  db.prepare("DELETE FROM rooms WHERE id = ?").run(id);
}

function setRoomBots(roomId: string, botIds: string[]): void {
  db.prepare("DELETE FROM room_bots WHERE room_id = ?").run(roomId);
  const add = db.prepare("INSERT INTO room_bots (room_id, bot_id) VALUES (?, ?)");
  for (const botId of new Set(botIds)) add.run(roomId, botId);
}

function toRoom(row: Row, botIds: string[]): Room {
  return { id: row.id, name: row.name, botIds, createdAt: row.created_at, updatedAt: row.updated_at };
}
