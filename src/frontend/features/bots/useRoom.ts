import { useEffect, useRef, useState } from "preact/hooks";
import { api, errorText } from "../../api/client";
import type { RoomMessage } from "../../api/types";
import { usePolling } from "../../ui/hooks";

// How often the page asks the server for new messages in the room on screen.
const POLL_MS = 1500;

// What GET /api/room returns: the messages after the given id, and whether bots are talking in that room.
interface RoomState {
  messages: RoomMessage[];
  busy: boolean;
  speaking: string | null;
}

// One room's messages, whether its bots are talking, and posting to it. Messages are fetched by id, so each poll asks only for what is new.
// When the room changes, the messages of the old room are dropped, and a reply that arrives late for it is ignored.
export function useRoom(roomId: string | undefined) {
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  // The room on screen, and the last message this page has from it.
  const current = useRef(roomId);
  current.current = roomId;
  const lastId = useRef(0);

  async function poll(): Promise<void> {
    const id = current.current;
    if (!id) return;
    try {
      const data = await api.get<RoomState>(`/api/room?room=${encodeURIComponent(id)}&after=${lastId.current}`);
      if (current.current !== id) return;
      const first = lastId.current === 0;
      // Only a poll that brings messages changes the list, so the transcript is not redrawn (and scrolled) on every empty poll.
      if (data.messages.length > 0) {
        lastId.current = data.messages[data.messages.length - 1].id;
        setMessages((list) => (first ? data.messages : [...list, ...data.messages]));
      }
      setBusy(data.busy);
      setSpeaking(data.speaking);
    } catch (err) {
      setError(errorText(err));
    }
  }

  useEffect(() => {
    lastId.current = 0;
    setMessages([]);
    setBusy(false);
    setSpeaking(null);
    setError(undefined);
    poll();
  }, [roomId]);

  usePolling(poll, POLL_MS);

  // Posts a message to the room on screen. Returns true when the room accepted it, so the caller can clear its box.
  async function send(text: string): Promise<boolean> {
    if (!roomId || !text || busy) return false;
    setError(undefined);
    try {
      await api.post("/api/room/messages", { room: roomId, text });
    } catch (err) {
      setError(errorText(err));
      return false;
    }
    poll();
    return true;
  }

  return { messages, busy, speaking, error, send };
}
