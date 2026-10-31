// The "@name" being typed at the caret, such as "hey @Th". Group 1 is what came before the "@", group 2 is the partial name.
const MENTION = /(^|\s)@([A-Za-z0-9_-]*)$/;

export interface Mention {
  // Index of the "@" in the text.
  start: number;
  // The name typed so far, without the "@".
  query: string;
}

// The mention the caret is in, if it is in one.
export function mentionAt(text: string, caret: number): Mention | undefined {
  const match = MENTION.exec(text.slice(0, caret));
  if (!match) return undefined;
  return { start: caret - match[0].length + match[1].length, query: match[2] };
}

// The bots a partial name could complete to. Once the name is typed out in full, the list steps aside, so Enter sends.
export function suggestions<B extends { name: string }>(bots: B[], mention: Mention): B[] {
  const query = mention.query.toLowerCase();
  const matches = bots.filter((bot) => bot.name.toLowerCase().startsWith(query));
  const typedOut = matches.length === 1 && matches[0].name.toLowerCase() === query;
  return typedOut ? [] : matches;
}

// The pieces of a message: plain text, and each mention of a bot in the room. An "@name" that is no bot stays plain text.
// The name is matched the way the server matches it, so a pill shows exactly when the bot is asked for.
export type Piece<B> = { kind: "text"; text: string } | { kind: "mention"; text: string; bot: B };

export function splitMentions<B extends { name: string }>(text: string, bots: B[]): Piece<B>[] {
  const pieces: Piece<B>[] = [];
  let last = 0;
  for (const match of text.matchAll(/@([A-Za-z][A-Za-z0-9_-]*)/g)) {
    const bot = bots.find((b) => b.name.toLowerCase() === match[1].toLowerCase());
    if (!bot) continue;
    const at = match.index ?? 0;
    if (at > last) pieces.push({ kind: "text", text: text.slice(last, at) });
    pieces.push({ kind: "mention", text: match[0], bot });
    last = at + match[0].length;
  }
  if (last < text.length) pieces.push({ kind: "text", text: text.slice(last) });
  return pieces;
}

// Replaces the partial name with the full one and a space. Returns the new text and where the caret goes.
export function completeMention(text: string, caret: number, mention: Mention, name: string): { text: string; caret: number } {
  const after = mention.start + name.length + 2;
  return { text: `${text.slice(0, mention.start)}@${name} ${text.slice(caret)}`, caret: after };
}
