import { useEffect, useRef } from "preact/hooks";
import type { SlackMessage } from "../../api/types";
import { SlackText } from "./SlackText";

// The messages of a conversation or a thread, oldest first, drawn as chat bubbles like the room. Your own messages sit on the right in the
// primary color. A message with replies has a button that opens its thread, when onOpenThread is given.
export function SlackTranscript({
  messages,
  me,
  emptyText,
  large,
  onOpenThread,
}: {
  messages: SlackMessage[];
  me: string | undefined;
  emptyText: string;
  large: boolean;
  onOpenThread?: (threadTs: string) => void;
}) {
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [messages]);

  const size = large ? "text-base" : "text-sm";
  return (
    <div ref={log} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
      {messages.length === 0 && <p className="m-auto text-sm opacity-60">{emptyText}</p>}
      {messages.map((message) => {
        const mine = !!me && message.user === me;
        return (
          <div key={message.ts} className={`chat ${mine ? "chat-end" : "chat-start"}`}>
            <div className="chat-header text-xs opacity-70">
              {message.author} <time className="ml-1 opacity-70">{formatTime(message.time)}</time>
            </div>
            <div className={`chat-bubble break-words ${size} ${mine ? "chat-bubble-primary" : ""}`}>
              <SlackText text={message.text || "(no text)"} />
            </div>
            {onOpenThread && message.replies > 0 && (
              <div className="chat-footer">
                <button className="btn btn-ghost btn-xs" onClick={() => onOpenThread(message.ts)}>
                  {message.replies} {message.replies === 1 ? "reply" : "replies"}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
