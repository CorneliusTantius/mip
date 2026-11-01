// Checks bot skills: a bot enables installed skills, reads only the ones it enabled, lists them in its prompt, and loses them when a
// skill is removed or the bot is deleted. Run after a build: node src/backend/app/skills/bot-skills.test.mjs
// It sets MIP_HOME to a temporary folder before the modules load, so the real skills folder is not touched. Bots are made straight in
// the database, since creating one checks its provider's model list.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIST = pathToFileURL(fileURLToPath(new URL("../../../../dist/backend/", import.meta.url))).href;
const root = mkdtempSync(join(tmpdir(), "mip-bot-skills-"));
process.env.MIP_HOME = join(root, "mip-home");

try {
  const { confirmImport, stageImport } = await import(`${DIST}app/skills/imports.js`);
  const { allBots, removeBot } = await import(`${DIST}app/bots.js`);
  const { botSkills, botSkillsPrompt, enabledBotSkill, removeSkill, setBotSkills, skillsPrompt } = await import(`${DIST}app/skills/registry.js`);
  const { skillFileTool, skillReadTool } = await import(`${DIST}app/tools/skills.js`);
  const { BOT_TOOLS } = await import(`${DIST}app/tools/index.js`);
  const { botSkillNames } = await import(`${DIST}storage/skills.js`);
  const bots = await import(`${DIST}storage/bots.js`);
  const { db } = await import(`${DIST}storage/db.js`);

  // Installs a skill from a folder, the way the Skills card does: review, then confirm.
  const install = (name, description, body, files = {}) => {
    const folder = join(root, `source-${name}`);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`);
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(join(folder, path, ".."), { recursive: true });
      writeFileSync(join(folder, path), text);
    }
    return confirmImport(stageImport(folder).id);
  };
  install("codeword", "The project codeword.", "The codeword is PELICAN-42.", { "notes/history.md": "Chosen in 2026." });
  install("tone", "How to answer in the room.", "Keep it short and plain.");

  // Two bots, made in the database.
  const bot = (id, name) => bots.insertBot({ id, name, persona: "A keen reviewer.", providerId: "claude-cli", model: null, thinking: null, color: "teal" });
  bot("b-freya", "Freya");
  bot("b-thorin", "Thorin");

  // 1. A bot enables installed skills. A name that is not installed is refused, and nothing changes.
  assert.deepEqual(setBotSkills("b-freya", ["codeword", "codeword"]), ["codeword"], "names are kept once");
  assert.deepEqual(botSkillNames("b-freya"), ["codeword"]);
  assert.throws(() => setBotSkills("b-freya", ["missing-skill"]), /no such skill/);
  assert.deepEqual(botSkillNames("b-freya"), ["codeword"], "a refused list changes nothing");
  assert.deepEqual(botSkills("b-freya").map((skill) => skill.name), ["codeword"]);

  // 2. The bot's prompt lists its skills, and no other bot's. An agent's prompt is separate.
  assert.match(botSkillsPrompt("b-freya"), /Skills enabled for this bot\./);
  assert.match(botSkillsPrompt("b-freya"), /- codeword: The project codeword\./);
  assert.equal(botSkillsPrompt("b-thorin"), "", "a bot with no skills gets no skills section");
  assert.equal(skillsPrompt("agent-a"), "", "an agent with no skills gets no skills section");

  // 3. Only the enabled skill can be read. A skill the bot has not enabled is refused.
  assert.match(enabledBotSkill("b-freya", "codeword").body, /PELICAN-42/);
  assert.throws(() => enabledBotSkill("b-freya", "tone"), /not enabled for this bot/);

  // 4. The skill tools work for a bot's run: skill_read gives the instructions, and skill_file reads a file the skill lists.
  const read = await skillReadTool.run({ name: "codeword" }, { workspace: root, botId: "b-freya" });
  assert.match(read.text, /PELICAN-42/);
  assert.match(read.text, /notes\/history\.md/);
  const file = await skillFileTool.run({ name: "codeword", path: "notes/history.md" }, { workspace: root, botId: "b-freya" });
  assert.equal(file.text, "Chosen in 2026.");
  await assert.rejects(() => skillReadTool.run({ name: "tone" }, { workspace: root, botId: "b-freya" }), /not enabled for this bot/);
  await assert.rejects(() => skillFileTool.run({ name: "tone", path: "SKILL.md" }, { workspace: root, botId: "b-freya" }), /not enabled for this bot/);
  assert.ok(BOT_TOOLS.some((tool) => tool.name === "skill_file") && BOT_TOOLS.some((tool) => tool.name === "skill_read"));

  // 5. A run with neither a bot nor an agent has no skills at all.
  await assert.rejects(() => skillReadTool.run({ name: "codeword" }, { workspace: root }), /only available inside an agent or a bot/);

  // 6. The bot list shows each bot with its skills.
  setBotSkills("b-thorin", ["tone"]);
  const listed = Object.fromEntries(allBots().map((b) => [b.name, b.skills]));
  assert.deepEqual(listed, { Freya: ["codeword"], Thorin: ["tone"] });

  // 7. Removing a skill takes it away from every bot that had it enabled.
  removeSkill("codeword");
  assert.deepEqual(botSkillNames("b-freya"), []);
  assert.equal(botSkillsPrompt("b-freya"), "");
  assert.deepEqual(botSkillNames("b-thorin"), ["tone"], "other skills stay");

  // 8. Deleting a bot deletes its skill enablements, so none are left behind.
  removeBot("b-thorin");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bot_skill_enablements WHERE bot_id = ?").get("b-thorin").n, 0);
  assert.deepEqual(allBots().map((b) => b.name), ["Freya"]);

  console.log("bot skill tests passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}
