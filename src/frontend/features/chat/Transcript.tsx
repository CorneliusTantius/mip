import { useEffect, useRef } from "preact/hooks";
import type { ChatMessage } from "../../api/types";

// The messages of the open chat. It scrolls to the newest message as they arrive. Tools a reply used show as badges.
export function Transcript({ messages, busy, emptyText }: { messages: ChatMessage[]; busy: boolean; emptyText: string }) {
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [messages]);

  return (
    <div ref={log} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
      {messages.length === 0 && <p className="m-auto text-sm opacity-60">{emptyText}</p>}
      {messages.map((m, i) => (
        <div key={i} className={"chat " + (m.role === "user" ? "chat-end" : "chat-start")}>
          <div className={"chat-bubble whitespace-pre-wrap " + (m.error ? "chat-bubble-error" : m.role === "user" ? "chat-bubble-primary" : "")}>
            {m.tools.map((tool, n) => (
              <span key={n} className="badge badge-sm badge-outline mr-1">
                {tool}
              </span>
            ))}
            {m.text || m.error || (busy && i === messages.length - 1 ? <span className="loading loading-dots loading-sm" /> : null)}
            {m.error && m.text && <p className="mt-1 text-sm">{m.error}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
