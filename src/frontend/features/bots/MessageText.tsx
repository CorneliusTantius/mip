import type { Bot } from "../../api/types";
import { splitMentions } from "./mentions";

// A message's text. Each mention of a bot is a pill in that bot's color. A click opens the bot's profile.
export function MessageText({ text, bots, onOpenBot }: { text: string; bots: Bot[]; onOpenBot: (bot: Bot) => void }) {
  return (
    <>
      {splitMentions(text, bots).map((piece, i) =>
        piece.kind === "text" ? (
          piece.text
        ) : (
          <button key={i} type="button" className={`mention bot-${piece.bot.color}`} onClick={() => onOpenBot(piece.bot)}>
            {piece.text}
          </button>
        ),
      )}
    </>
  );
}
