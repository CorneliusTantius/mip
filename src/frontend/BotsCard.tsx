import { useEffect, useRef, useState } from "preact/hooks";
import { type BotInfo, BotsDialog } from "./BotsDialog";

interface RoomMessage {
  id: number;
  kind: "user" | "bot" | "system";
  authorName: string;
  text: string;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

// The bots' shared room. Mention a bot with @Name to get its reply first. Bots can mention each other.
export function BotsCard() {
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState<string | null>(null);
  const [bots, setBots] = useState<BotInfo[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string>();
  const [managing, setManaging] = useState(false);
  // The last message this page has, so each poll asks only for what is new.
  const lastId = useRef(0);
  const log = useRef<HTMLDivElement>(null);

  const loadBots = () =>
    fetch("/api/bots")
      .then((res) => res.json())
      .then((data) => setBots(data.bots));

  const poll = () =>
    fetch(`/api/room?after=${lastId.current}`)
      .then((res) => res.json())
      .then((data: { messages: RoomMessage[]; busy: boolean; speaking: string | null }) => {
        const first = lastId.current === 0;
        if (data.messages.length > 0) lastId.current = data.messages[data.messages.length - 1].id;
        setMessages((list) => (first ? data.messages : [...list, ...data.messages]));
        setBusy(data.busy);
        setSpeaking(data.speaking);
      });

  useEffect(() => {
    loadBots();
    poll();
    const timer = setInterval(poll, 1500);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [messages]);

  async function send(e: Event) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setError(undefined);
    const res = await fetch("/api/room/messages", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ text }) });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    setDraft("");
    poll();
  }

  return (
    <section className="card card-border flex h-[min(32rem,70vh)] shrink-0 bg-base-200/80">
      <div className="card-body min-h-0 flex-1 gap-3 p-4">
        <div className="flex items-center gap-2">
          <h2 className="card-title mr-auto">Bots</h2>
          <div className="flex min-w-0 flex-wrap justify-end gap-1.5">
            {bots.map((bot) => (
              <span key={bot.id} className="badge badge-outline">
                {bot.name}
              </span>
            ))}
          </div>
          <button className="btn btn-sm" onClick={() => setManaging(true)}>
            Manage bots
          </button>
        </div>

        <div ref={log} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          {messages.length === 0 && (
            <p className="m-auto text-sm opacity-60">{bots.length ? "Say something to start. Mention a bot with @Name." : "No bots yet. Create one with Manage bots."}</p>
          )}
          {messages.map((message) =>
            message.kind === "system" ? (
              <p key={message.id} className="text-center text-xs opacity-60">
                {message.text}
              </p>
            ) : (
              <div key={message.id} className={"chat " + (message.kind === "user" ? "chat-end" : "chat-start")}>
                <div className="chat-header text-xs opacity-70">{message.authorName}</div>
                <div className={"chat-bubble whitespace-pre-wrap " + (message.kind === "user" ? "chat-bubble-primary" : "")}>{message.text}</div>
              </div>
            ),
          )}
        </div>

        {busy && <p className="text-xs opacity-70">{speaking ? `${speaking} is writing…` : "The bots are talking…"}</p>}
        {error && (
          <div role="alert" className="alert alert-error py-2 text-sm">
            <span>{error}</span>
          </div>
        )}
        <form className="join w-full" onSubmit={send}>
          <input
            className="input join-item w-full"
            placeholder={bots.length ? "Message the room. @Name asks a bot first." : "Create a bot first"}
            value={draft}
            disabled={busy || bots.length === 0}
            onInput={(e) => setDraft(e.currentTarget.value)}
          />
          <button className="btn btn-primary join-item" disabled={busy || bots.length === 0 || !draft.trim()}>
            Send
          </button>
        </form>
      </div>

      <BotsDialog
        open={managing}
        onClose={() => {
          setManaging(false);
          loadBots();
        }}
      />
    </section>
  );
}
