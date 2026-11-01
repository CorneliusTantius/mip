import { useEffect, useRef } from "preact/hooks";
import type { AgentMessage } from "../../api/types";
import { Markdown } from "../../ui/Markdown";
import { ToolCallsButton } from "../../ui/ToolCallsDialog";
import { AskCard } from "./AskCard";

// The messages of the open agent. It scrolls to the newest message as they arrive. A reply is drawn as Markdown; your own messages
// are shown as written. A reply that used tools has a button at its bottom that lists those tool calls. A question the agent asked
// shows its controls under the reply, and an answer is sent as the next message.
export function Transcript({
  messages,
  busy,
  emptyText,
  onAnswer,
}: {
  messages: AgentMessage[];
  busy: boolean;
  emptyText: string;
  onAnswer: (answer: string) => void;
}) {
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [messages]);

  return (
    <div ref={log} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
      {messages.length === 0 && <p className="m-auto text-sm opacity-60">{emptyText}</p>}
      {messages.map((m, i) => {
        const last = i === messages.length - 1;
        // A reply with nothing in it gets no bubble. The loading dots stay while the reply is still being written.
        if (m.role === "assistant" && !m.text && !m.error && m.tools.length === 0 && !m.ask && !(busy && last)) return null;
        // A question is answered once the user has written after it.
        const answered = messages.slice(i + 1).some((next) => next.role === "user");
        return (
          <div key={i} className={"chat " + (m.role === "user" ? "chat-end" : "chat-start")}>
            <div className={"chat-bubble whitespace-pre-wrap " + (m.error ? "chat-bubble-error" : m.role === "user" ? "chat-bubble-primary" : "")}>
              {m.role === "assistant" && m.text ? (
                <Markdown text={m.text} />
              ) : (
                m.text || m.error || (busy && last ? <span className="loading loading-dots loading-sm" /> : null)
              )}
              {m.error && m.text && <p className="mt-1 text-sm">{m.error}</p>}
              {m.tools.length > 0 && <ToolCallsButton calls={m.calls} names={m.tools} />}
              {m.ask && <AskCard ask={m.ask} disabled={busy || answered} onAnswer={onAnswer} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}
