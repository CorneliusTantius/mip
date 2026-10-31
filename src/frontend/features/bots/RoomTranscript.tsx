import { useEffect, useRef } from "preact/hooks";
import type { RoomMessage } from "../../api/types";

// The room's messages. Replies from people and bots are bubbles. System notes are small centered lines.
export function RoomTranscript({ messages, emptyText }: { messages: RoomMessage[]; emptyText: string }) {
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [messages]);

  return (
    <div ref={log} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
      {messages.length === 0 && <p className="m-auto text-sm opacity-60">{emptyText}</p>}
      {messages.map((message) =>
        message.kind === "system" ? (
          <p key={message.id} className="text-center text-xs opacity-60">
            {message.text}
          </p>
        ) : (
          <div key={message.id} className={"agent " + (message.kind === "user" ? "agent-end" : "agent-start")}>
            <div className="agent-header text-xs opacity-70">{message.authorName}</div>
            <div className={"agent-bubble whitespace-pre-wrap " + (message.kind === "user" ? "agent-bubble-primary" : "")}>{message.text}</div>
          </div>
        ),
      )}
    </div>
  );
}
