import { randomUUID } from "node:crypto";
import { listBots } from "../../storage/bots.js";
import { deleteRoom, getRoom, getRoomByName, insertRoom, listRooms, type Room, roomCount, updateRoom } from "../../storage/rooms.js";
import { AppError } from "../errors.js";

// A room's name is short, so it fits in the list of rooms.
const MAX_NAME = 40;

export function allRooms(): Room[] {
  return listRooms();
}

// A new room has the name and bots it is given. A room with no bots is one where nobody answers yet.
export function createRoom(input: unknown): Room {
  const fields = roomFields(input);
  const now = Date.now();
  const room = { id: randomUUID(), ...fields, createdAt: now, updatedAt: now };
  insertRoom(room);
  return room;
}

// Renames a room and sets its bots. A field left out keeps its value.
export function editRoom(id: string, input: unknown): Room {
  const existing = getRoom(id);
  if (!existing) throw new AppError(404, "no such room");
  const fields = roomFields(input, existing);
  const room = { ...existing, ...fields, updatedAt: Date.now() };
  updateRoom(room);
  return room;
}

// Deletes a room with its messages. The last room is kept, so there is always one to talk in.
export function removeRoom(id: string): void {
  if (!getRoom(id)) throw new AppError(404, "no such room");
  if (roomCount() <= 1) throw new AppError(409, "keep at least one room");
  deleteRoom(id);
}

// The fields a room takes. A field left out keeps its value. A master who is no longer a member is cleared, unless the request names one.
function roomFields(input: unknown, existing?: Room): { name: string; botIds: string[]; masterBotId: string | null; collapseOthers: boolean } {
  const body = (input ?? {}) as { name?: unknown; botIds?: unknown; masterBotId?: unknown; collapseOthers?: unknown };
  const name = body.name === undefined ? (existing?.name ?? "") : String(body.name).trim();
  if (!name) throw new AppError(400, "name is required");
  if (name.length > MAX_NAME) throw new AppError(400, `name must be ${MAX_NAME} characters or fewer`);
  const taken = getRoomByName(name);
  if (taken && taken.id !== existing?.id) throw new AppError(409, `a room called "${name}" already exists`);

  let botIds = existing?.botIds ?? [];
  if (body.botIds !== undefined) {
    if (!Array.isArray(body.botIds)) throw new AppError(400, "botIds must be a list");
    const known = new Set(listBots().map((bot) => bot.id));
    botIds = [...new Set(body.botIds.map(String))];
    if (botIds.some((botId) => !known.has(botId))) throw new AppError(400, "a bot in the list does not exist");
  }

  let masterBotId = existing?.masterBotId ?? null;
  if (body.masterBotId !== undefined) {
    masterBotId = body.masterBotId === null || body.masterBotId === "" ? null : String(body.masterBotId);
    if (masterBotId !== null && !botIds.includes(masterBotId)) throw new AppError(400, "the room master must be a bot in the room");
  }
  if (masterBotId !== null && !botIds.includes(masterBotId)) masterBotId = null;

  const collapseOthers = body.collapseOthers === undefined ? (existing?.collapseOthers ?? false) : Boolean(body.collapseOthers);
  return { name, botIds, masterBotId, collapseOthers };
}
