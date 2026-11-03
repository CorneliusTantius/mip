import { useEffect, useRef } from "preact/hooks";
import type { Bot, RoomMessage } from "../../api/types";
import { Markdown } from "../../ui/Markdown";
import { ToolCallsButton } from "../../ui/ToolCallsDialog";
import { MessageText } from "./MessageText";

// The room's messages. Replies from people, bots, and agents are bubbles. A bot's or an agent's reply is drawn as Markdown, and its mentions stay pills.
// A bot's bubble takes a light tint of its color, and its name takes the color itself. A reply that used tools has a button at its
// bottom that lists those tool calls. System notes are small centered lines.
// With collapseOthers on, a reply from a bot that is not the room master is folded to one line. Click the line to open the reply.
export function RoomTranscript({
  messages,
  bots,
  emptyText,
  masterBotId,
  collapseOthers = false,
  onOpenBot,
}: {
  messages: RoomMessage[];
  bots: Bot[];
  emptyText: string;
  masterBotId?: string | null;
  collapseOthers?: boolean;
  onOpenBot: (bot: Bot) => void;
}) {
  const log = useRef<HTMLDivElement>(null);
  // Whether the log is at its end. A new message scrolls the log down only then, so a reader who scrolled up stays where they are.
  const atEnd = useRef(true);
  const last = messages[messages.length - 1];

  // Follows a new message when the log is at its end, and always when the reader sent it.
  useEffect(() => {
    const el = log.current;
    if (el && (atEnd.current || last?.kind === "user")) el.scrollTo({ top: el.scrollHeight });
  }, [last?.id]);

  function trackEnd() {
    const el = log.current;
    if (el) atEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  }

  // The reply as a bubble: a bot's or an agent's as Markdown, a person's as plain text, then its tool calls.
  function bubble(message: RoomMessage, bot: Bot | undefined) {
    const bubbleStyle = message.kind === "user" ? "chat-bubble-primary" : bot ? "bot-bubble" : "";
    return (
      <div className={`chat-bubble whitespace-pre-wrap ${bubbleStyle}`}>
        {message.kind === "bot" || message.kind === "agent" ? (
          <Markdown text={message.text} renderText={(text) => <MessageText text={text} bots={bots} onOpenBot={onOpenBot} />} />
        ) : (
          <MessageText text={message.text} bots={bots} onOpenBot={onOpenBot} />
        )}
        {message.calls.length > 0 && <ToolCallsButton calls={message.calls} names={message.calls.map((call) => call.name)} />}
      </div>
    );
  }

  return (
    <div ref={log} onScroll={trackEnd} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
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
        const folded = collapseOthers && message.kind === "bot" && bot !== undefined && bot.id !== masterBotId;
        if (folded) {
          return (
            <details key={message.id} className={`chat ${side} bot-${bot.color}`}>
              <summary className="chat-header cursor-pointer list-none text-xs opacity-70">
                <span className="bot-name">{message.authorName}</span>
                <span className="ml-2 truncate opacity-60">{oneLine(message.text)}</span>
              </summary>
              {bubble(message, bot)}
            </details>
          );
        }
        return (
          <div key={message.id} className={`chat ${side}${bot ? ` bot-${bot.color}` : ""}`}>
            <div className="chat-header text-xs opacity-70">
              {bot ? <span className="bot-name">{message.authorName}</span> : message.authorName}
            </div>
            {bubble(message, bot)}
          </div>
        );
      })}
    </div>
  );
}

// The first part of a reply on one line, for the folded line.
function oneLine(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 80 ? `${flat.slice(0, 80)}…` : flat;
}
