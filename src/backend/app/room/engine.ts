// Turn-taking for the shared room. It has no storage or provider code, so it can be tested with fake bots.

export interface RoomBot {
  id: string;
  name: string;
}

// The bots named in a message, in the order they are named. Names ignore case. Unknown names are ignored.
export function mentionedBots<B extends RoomBot>(text: string, bots: B[]): B[] {
  const byName = new Map(bots.map((bot) => [bot.name.toLowerCase(), bot]));
  const found: B[] = [];
  for (const match of text.matchAll(/@([A-Za-z][A-Za-z0-9_-]*)/g)) {
    const bot = byName.get(match[1].toLowerCase());
    if (bot && !found.includes(bot)) found.push(bot);
  }
  return found;
}

// A reply of PASS, or nothing at all, means the bot has nothing to add.
export function isSilent(text: string): boolean {
  const trimmed = text.trim();
  return trimmed === "" || trimmed.toUpperCase() === "PASS";
}

// What a bot said. Calls are whatever the caller keeps about how the reply was made, such as its tool calls.
export type RoomEvent<B, C> = { kind: "bot"; bot: B; text: string; calls: C } | { kind: "system"; text: string };

export interface ConverseOptions<B extends RoomBot, C> {
  bots: B[];
  // Who speaks first, in order. Bots named in each reply are queued after it.
  queue: B[];
  maxTurns: number;
  // One turn: the bot's reply and the calls it made. Throws when the provider fails.
  runTurn(bot: B): Promise<{ text: string; calls: C }>;
  say(event: RoomEvent<B, C>): void;
  speaking(name: string | null): void;
}

// Runs the conversation until nobody is queued, a bot fails, or the turn limit is reached.
export async function converseRoom<B extends RoomBot, C>(options: ConverseOptions<B, C>): Promise<void> {
  const queue = [...options.queue];
  let turns = 0;
  try {
    while (queue.length > 0) {
      if (turns >= options.maxTurns) {
        options.say({ kind: "system", text: `Paused after ${options.maxTurns} turns. Mention a bot to keep the room going.` });
        return;
      }
      const bot = queue.shift()!;
      turns++;
      options.speaking(bot.name);
      let reply: { text: string; calls: C };
      try {
        reply = await options.runTurn(bot);
      } catch (err) {
        options.say({ kind: "system", text: `${bot.name} couldn't reply: ${err instanceof Error ? err.message : String(err)}` });
        return;
      }
      if (isSilent(reply.text)) continue;
      options.say({ kind: "bot", bot, text: reply.text.trim(), calls: reply.calls });
      for (const next of mentionedBots(reply.text, options.bots)) {
        // A bot already waiting its turn reads the latest history when it speaks, so it is not queued twice.
        if (next.id !== bot.id && !queue.some((waiting) => waiting.id === next.id)) queue.push(next);
      }
    }
  } finally {
    options.speaking(null);
  }
}
