import { useEffect, useState } from "preact/hooks";
import { api } from "../../api/client";
import type { Bot, Room } from "../../api/types";

// The rooms and the bots, and which room is on screen. The room on screen stays the same across a reload when it still exists,
// and otherwise falls back to the first room.
export function useRooms() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [bots, setBots] = useState<Bot[]>([]);
  const [activeId, setActiveId] = useState<string>();

  async function reload(): Promise<void> {
    const [roomData, botData] = await Promise.all([api.get<{ rooms: Room[] }>("/api/rooms"), api.get<{ bots: Bot[] }>("/api/bots")]);
    setRooms(roomData.rooms);
    setBots(botData.bots);
    setActiveId((current) => (roomData.rooms.some((room) => room.id === current) ? current : roomData.rooms[0]?.id));
  }

  useEffect(() => {
    reload();
  }, []);

  const active = rooms.find((room) => room.id === activeId);
  return { rooms, bots, active, setActiveId, reload };
}
