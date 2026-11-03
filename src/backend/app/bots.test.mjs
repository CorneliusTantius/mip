// Checks the bot colors: the palette the server accepts, the first free color a new bot takes, and that the frontend and the
// stylesheet know every color. Run after a build: node src/backend/app/bots.test.mjs. It sets HOME to a temporary folder.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIST = pathToFileURL(fileURLToPath(new URL("../../../dist/backend/", import.meta.url))).href;
const root = mkdtempSync(join(tmpdir(), "mip-bots-"));
process.env.HOME = join(root, "home");

try {
  const colors = await import(`${DIST}storage/bot-colors.js`);
  const bots = await import(`${DIST}app/bots.js`);

  assert.deepEqual([...colors.BOT_COLORS], ["frost", "orange", "violet", "green", "yellow", "red", "teal", "blue"]);
  assert.equal(colors.isBotColor("teal"), true);
  assert.equal(colors.isBotColor("pink"), false);
  assert.equal(colors.isBotColor(undefined), false);

  // A new bot takes the first color no bot uses. Once every color is in use, they repeat in order.
  assert.equal(bots.nextBotColor([]), "frost");
  assert.equal(bots.nextBotColor(["frost", "violet"]), "orange");
  assert.equal(bots.nextBotColor([...colors.BOT_COLORS]), "frost");
  assert.equal(bots.nextBotColor([...colors.BOT_COLORS, "frost"]), "orange");

  // The frontend picks from the same list, and the stylesheet has a class for each color.
  const frontendList = readFileSync(new URL("../../frontend/features/bots/botColors.ts", import.meta.url), "utf8");
  const stylesheet = readFileSync(new URL("../../frontend/styles.css", import.meta.url), "utf8");
  for (const color of colors.BOT_COLORS) {
    assert.match(frontendList, new RegExp(`"${color}"`), `botColors.ts lists ${color}`);
    assert.match(stylesheet, new RegExp(`\\.bot-${color} \\{`), `styles.css styles ${color}`);
  }

  console.log("bot color tests passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}
