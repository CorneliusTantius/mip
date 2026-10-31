// Checks the skill registry end to end: review before install, refusals, per-chat enablement, the skill tools, and the tool lists.
// Run after a build: node src/backend/app/skills/skills.test.mjs
// It sets MIP_HOME to a temporary folder before the modules load, so the real skills folder is not touched.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIST = pathToFileURL(fileURLToPath(new URL("../../../../dist/backend/", import.meta.url))).href;
const root = mkdtempSync(join(tmpdir(), "mip-skills-"));
process.env.MIP_HOME = join(root, "mip-home");

try {
  const { confirmImport, discardImport, stageImport } = await import(`${DIST}app/skills/imports.js`);
  const { enabledSkill, listSkills, loadSkill, readSkillFile, removeSkill, setChatSkills, skillsPrompt } = await import(`${DIST}app/skills/registry.js`);
  const { enabledSkillNames } = await import(`${DIST}storage/skills.js`);
  const { BOT_TOOLS, AGENT_TOOLS, TOOLS, describeTools, registerRun, releaseRun, runContextForToken } = await import(`${DIST}app/tools/index.js`);
  const { SKILLS_DIR } = await import(`${DIST}storage/paths.js`);
  const { createSkill } = await import(`${DIST}app/skills/create.js`);

  // A folder with a SKILL.md, and the files written next to it.
  const writeSkill = (folder, name, description, body = "Body text.") => {
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`);
    return folder;
  };
  const stagingLeft = () => (existsSync(join(SKILLS_DIR, ".staging")) ? readdirSync(join(SKILLS_DIR, ".staging")).length : 0);

  // Review, then install. The reference file is listed; SKILL.md and the source note are not.
  const source = writeSkill(join(root, "codeword"), "codeword", "The project codeword.", "The codeword is PELICAN-42.");
  mkdirSync(join(source, "notes"));
  writeFileSync(join(source, "notes", "history.md"), "Chosen in 2026.");
  const preview = stageImport(source);
  assert.equal(preview.name, "codeword");
  assert.deepEqual(preview.files, ["SKILL.md", "notes/history.md"]);
  assert.equal(preview.replaces, null, "nothing is installed yet, so nothing is replaced");
  assert.equal(listSkills().skills.length, 0, "the registry does not change until the import is confirmed");

  const installed = confirmImport(preview.id);
  assert.equal(installed.name, "codeword");
  assert.match(installed.body, /PELICAN-42/);
  assert.deepEqual(installed.files, ["notes/history.md"]);
  assert.equal(readSkillFile("codeword", "notes/history.md"), "Chosen in 2026.");
  assert.equal(stagingLeft(), 0, "a confirmed import leaves no staging folder behind");

  // Refusals: a script, a symbolic link, no SKILL.md, a bad name, and a path that is not absolute. Each leaves nothing behind.
  const withScript = writeSkill(join(root, "with-script"), "with-script", "Has a script.");
  writeFileSync(join(withScript, "run.sh"), "echo hi");
  assert.throws(() => stageImport(withScript), /text files only/);

  const withLink = writeSkill(join(root, "with-link"), "with-link", "Has a link.");
  symlinkSync(join(source, "SKILL.md"), join(withLink, "alias.md"));
  assert.throws(() => stageImport(withLink), /symbolic links/);

  const nameless = join(root, "nameless");
  mkdirSync(nameless);
  writeFileSync(join(nameless, "readme.md"), "no header");
  assert.throws(() => stageImport(nameless), /no SKILL.md/);

  const badName = writeSkill(join(root, "bad-name"), "Bad_Name", "Wrong name.");
  assert.throws(() => stageImport(badName), /lowercase letters/);
  assert.throws(() => stageImport("relative/folder"), /full path/);
  assert.equal(stagingLeft(), 0, "refused imports leave no staging folder behind");

  // A second import with the same name shows what it would replace. Discarding it changes nothing.
  const updated = writeSkill(join(root, "codeword-v2"), "codeword", "The project codeword, updated.", "The codeword is HERON-7.");
  mkdirSync(join(updated, "notes"));
  writeFileSync(join(updated, "notes", "history.md"), "Chosen in 2026.");
  const again = stageImport(updated);
  assert.match(again.replaces, /PELICAN-42/);
  discardImport(again.id);
  assert.match(loadSkill("codeword").body, /PELICAN-42/);

  // Per-chat enablement: only the chat that enabled a skill can read it.
  assert.deepEqual(setChatSkills("chat-a", ["codeword"]), ["codeword"]);
  assert.match(skillsPrompt("chat-a"), /- codeword: The project codeword\./);
  assert.equal(enabledSkill("chat-a", "codeword").name, "codeword");
  assert.throws(() => enabledSkill("chat-b", "codeword"), /not enabled for this chat/);
  assert.equal(skillsPrompt("chat-b"), "", "a chat with no skills gets no skills section");
  assert.throws(() => setChatSkills("chat-a", ["missing-skill"]), /no such skill/);

  // A replaced skill keeps its enablement, and the new text is what gets read.
  const second = stageImport(updated);
  confirmImport(second.id);
  assert.match(enabledSkill("chat-a", "codeword").body, /HERON-7/);

  // Reference files: only listed files are readable, and nothing outside the skill is.
  assert.throws(() => readSkillFile("codeword", "../SKILL.md"), /has no file/);
  assert.throws(() => readSkillFile("codeword", "notes/other.md"), /has no file/);

  // The skill tools. A run without a chat has no skills. Refused calls come back as failed results, not exceptions.
  const skillRead = TOOLS.find((tool) => tool.name === "skill_read");
  const skillFile = TOOLS.find((tool) => tool.name === "skill_file");
  const noChat = await skillRead.run({ name: "codeword" }, { workspace: root });
  assert.equal(noChat.isError, true);
  const inChat = await skillRead.run({ name: "codeword" }, { workspace: root, chatId: "chat-a" });
  assert.equal(inChat.isError, false);
  assert.match(inChat.text, /HERON-7/);
  assert.match(inChat.text, /notes\/history\.md/, "the reply lists the files the skill names");
  const otherChat = await skillRead.run({ name: "codeword" }, { workspace: root, chatId: "chat-b" });
  assert.equal(otherChat.isError, true);
  const file = await skillFile.run({ name: "codeword", path: "notes/history.md" }, { workspace: root, chatId: "chat-a" });
  assert.equal(file.text, "Chosen in 2026.");
  const escape = await skillFile.run({ name: "codeword", path: "../SKILL.md" }, { workspace: root, chatId: "chat-a" });
  assert.equal(escape.isError, true);

  // One registry, two lists: chats get every tool, bots get none for now. A run's token carries its own list.
  assert.ok(AGENT_TOOLS.some((tool) => tool.name === "skill_read") && AGENT_TOOLS.some((tool) => tool.name === "bash"));
  assert.deepEqual(BOT_TOOLS, []);
  const token = registerRun({ workspace: root, chatId: "chat-a", tools: BOT_TOOLS });
  assert.deepEqual(runContextForToken(token).tools, []);
  releaseRun(token);
  assert.equal(runContextForToken(token), undefined, "a released token opens nothing");

  // The registry lists every tool with the kinds of run that may use it: chats get all of them, bots none.
  const described = describeTools();
  assert.equal(described.length, TOOLS.length);
  assert.ok(described.every((tool) => tool.agent === true && tool.bot === false));
  assert.equal(described.find((tool) => tool.name === "skill_read").description, TOOLS.find((tool) => tool.name === "skill_read").description);

  // A folder in the registry that is not a valid skill is reported, not hidden.
  mkdirSync(join(SKILLS_DIR, "broken"), { recursive: true });
  writeFileSync(join(SKILLS_DIR, "broken", "SKILL.md"), "no header here");
  const listing = listSkills();
  assert.equal(listing.skills.length, 1);
  assert.equal(listing.problems[0].folder, "broken");

  // Removing a skill takes it away from the chats that had it enabled.
  removeSkill("codeword");
  assert.deepEqual(enabledSkillNames("chat-a"), []);
  assert.equal(skillsPrompt("chat-a"), "");
  assert.equal(existsSync(join(SKILLS_DIR, "codeword")), false);

  // Create from a form. The skill reads back like an import, and an installed skill is never replaced.
  const made = createSkill({ name: "release-checklist", description: "Steps before a release: tests, changelog, tag.", body: "1. Run the tests.\n2. Update the changelog." });
  assert.equal(made.name, "release-checklist");
  assert.equal(made.description, "Steps before a release: tests, changelog, tag.");
  assert.match(made.body, /Run the tests/);
  assert.deepEqual(made.files, []);
  assert.throws(() => createSkill({ name: "release-checklist", description: "Again.", body: "Again." }), /already installed/);
  assert.throws(() => createSkill({ name: "Release Checklist", description: "x", body: "x" }), /lowercase letters/);
  assert.throws(() => createSkill({ name: "imports", description: "x", body: "x" }), /lowercase letters/);
  assert.throws(() => createSkill({ name: "no-description", description: "", body: "x" }), /description is required/);
  assert.throws(() => createSkill({ name: "two-lines", description: "one\ntwo", body: "x" }), /one line/);
  assert.throws(() => createSkill({ name: "no-body", description: "x", body: "  " }), /instructions are required/);
  assert.equal(existsSync(join(SKILLS_DIR, "no-body")), false, "a refused create leaves no folder behind");
  removeSkill("release-checklist");

  console.log("skills tests passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}
