import type { BotColor } from "../../api/types";

// The colors a bot can have, in the order a new bot takes them. The server accepts the same list, in the same order.
export const BOT_COLORS: BotColor[] = ["frost", "orange", "violet", "green", "yellow", "red", "teal", "blue"];

// The first color no bot uses yet, as the server picks for a new bot.
export function nextBotColor(used: readonly BotColor[]): BotColor {
  return BOT_COLORS.find((color) => !used.includes(color)) ?? BOT_COLORS[used.length % BOT_COLORS.length];
}
