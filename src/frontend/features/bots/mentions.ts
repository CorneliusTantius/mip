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

// Replaces the partial name with the full one and a space. Returns the new text and where the caret goes.
export function completeMention(text: string, caret: number, mention: Mention, name: string): { text: string; caret: number } {
  const after = mention.start + name.length + 2;
  return { text: `${text.slice(0, mention.start)}@${name} ${text.slice(caret)}`, caret: after };
}
