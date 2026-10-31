import { useEffect, useRef } from "preact/hooks";
import type { AgentMessage } from "../../api/types";
import { ToolCallsButton } from "./ToolCallsDialog";

// The messages of the open agent. It scrolls to the newest message as they arrive. A reply that used tools has a button at its
// bottom that lists those tool calls.
export function Transcript({ messages, busy, emptyText }: { messages: AgentMessage[]; busy: boolean; emptyText: string }) {
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [messages]);

  return (
    <div ref={log} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
      {messages.length === 0 && <p className="m-auto text-sm opacity-60">{emptyText}</p>}
      {messages.map((m, i) => (
        <div key={i} className={"agent " + (m.role === "user" ? "agent-end" : "agent-start")}>
          <div className={"agent-bubble whitespace-pre-wrap " + (m.error ? "agent-bubble-error" : m.role === "user" ? "agent-bubble-primary" : "")}>
            {m.text || m.error || (busy && i === messages.length - 1 ? <span className="loading loading-dots loading-sm" /> : null)}
            {m.error && m.text && <p className="mt-1 text-sm">{m.error}</p>}
            {m.tools.length > 0 && <ToolCallsButton calls={m.calls} names={m.tools} />}
          </div>
        </div>
      ))}
    </div>
  );
}
