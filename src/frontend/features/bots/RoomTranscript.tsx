import { useEffect, useRef } from "preact/hooks";
import type { Bot, RoomMessage } from "../../api/types";
import { Markdown } from "../../ui/Markdown";
import { ToolCallsButton } from "../../ui/ToolCallsDialog";
import { MessageText } from "./MessageText";

// The room's messages. Replies from people and bots are bubbles. A bot's reply is drawn as Markdown, and its mentions stay pills.
// A bot's bubble takes a light tint of its color, and its name takes the color itself. A reply that used tools has a button at its
// bottom that lists those tool calls. System notes are small centered lines.
export function RoomTranscript({
  messages,
  bots,
  emptyText,
  onOpenBot,
}: {
  messages: RoomMessage[];
  bots: Bot[];
  emptyText: string;
  onOpenBot: (bot: Bot) => void;
}) {
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [messages]);

  return (
    <div ref={log} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
      {messages.length === 0 && <p className="m-auto text-sm opacity-60">{emptyText}</p>}
      {messages.map((message) => {
        if (message.kind === "system") {
          return (
            <p key={message.id} className="text-center text-xs opacity-60">
              {message.text}
            </p>
          );
        }
        const bot = message.kind === "bot" ? bots.find((b) => b.id === message.botId) : undefined;
        const side = message.kind === "user" ? "chat-end" : "chat-start";
        const bubble = message.kind === "user" ? "chat-bubble-primary" : bot ? "bot-bubble" : "";
        return (
          <div key={message.id} className={`chat ${side}${bot ? ` bot-${bot.color}` : ""}`}>
            <div className="chat-header text-xs opacity-70">
              {bot ? <span className="bot-name">{message.authorName}</span> : message.authorName}
            </div>
            <div className={`chat-bubble whitespace-pre-wrap ${bubble}`}>
              {message.kind === "bot" ? (
                <Markdown text={message.text} renderText={(text) => <MessageText text={text} bots={bots} onOpenBot={onOpenBot} />} />
              ) : (
                <MessageText text={message.text} bots={bots} onOpenBot={onOpenBot} />
              )}
              {message.calls.length > 0 && <ToolCallsButton calls={message.calls} names={message.calls.map((call) => call.name)} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}
