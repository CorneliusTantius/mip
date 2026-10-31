import { useEffect, useRef, useState } from "preact/hooks";
import { api, errorText } from "../../api/client";
import type { Bot, RoomMessage } from "../../api/types";
import { usePolling } from "../../ui/hooks";

// How often the page asks the server for new room messages.
const POLL_MS = 1500;

// What GET /api/room returns: the messages after the given id, and whether bots are talking.
interface RoomState {
  messages: RoomMessage[];
  busy: boolean;
  speaking: string | null;
}

// The shared room: its messages, whether bots are talking, and the bots in it.
// Messages are fetched by id, so each poll asks only for what is new.
export function useRoom() {
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState<string | null>(null);
  const [bots, setBots] = useState<Bot[]>([]);
  const [error, setError] = useState<string>();
  // The last message this page has.
  const lastId = useRef(0);

  async function loadBots(): Promise<void> {
    const data = await api.get<{ bots: Bot[] }>("/api/bots");
    setBots(data.bots);
  }

  async function poll(): Promise<void> {
    const data = await api.get<RoomState>(`/api/room?after=${lastId.current}`);
    const first = lastId.current === 0;
    if (data.messages.length > 0) lastId.current = data.messages[data.messages.length - 1].id;
    setMessages((list) => (first ? data.messages : [...list, ...data.messages]));
    setBusy(data.busy);
    setSpeaking(data.speaking);
  }

  useEffect(() => {
    loadBots();
    poll();
  }, []);

  usePolling(poll, POLL_MS);

  // Posts a message to the room. Returns true when the room accepted it, so the caller can clear its box.
  async function send(text: string): Promise<boolean> {
    if (!text || busy) return false;
    setError(undefined);
    try {
      await api.post("/api/room/messages", { text });
    } catch (err) {
      setError(errorText(err));
      return false;
    }
    poll();
    return true;
  }

  return { messages, busy, speaking, bots, error, send, loadBots };
}
