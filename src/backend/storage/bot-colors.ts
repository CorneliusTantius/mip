// The colors a bot can have. Each name is a Nord accent, and the dashboard styles it with the same name (see styles.css).
// Ordered so that the first few colors a bot takes are far apart in hue. A new bot takes the first one no bot has.
export const BOT_COLORS = ["frost", "orange", "violet", "green", "yellow", "red", "teal", "blue"] as const;

export type BotColor = (typeof BOT_COLORS)[number];

export function isBotColor(value: unknown): value is BotColor {
  return typeof value === "string" && (BOT_COLORS as readonly string[]).includes(value);
}
