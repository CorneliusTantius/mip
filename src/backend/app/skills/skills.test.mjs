// Checks the skill registry end to end: review before install, refusals, search, the /name command, the skill tools, and the tool lists.
// Run after a build: node src/backend/app/skills/skills.test.mjs
// It sets HOME to a temporary folder before the modules load, so the real skills folder is not touched.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIST = pathToFileURL(fileURLToPath(new URL("../../../../dist/backend/", import.meta.url))).href;
const root = mkdtempSync(join(tmpdir(), "mip-skills-"));
process.env.HOME = join(root, "home");

try {
  const { confirmImport, discardImport, stageImport } = await import(`${DIST}app/skills/imports.js`);
  const { listSkills, loadSkill, readSkillFile, removeSkill, searchSkills, withSkillCommand } = await import(`${DIST}app/skills/registry.js`);
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

  // Search finds an installed skill by a word in its name or description. A skill that holds more of the words ranks first.
  writeSkill(join(SKILLS_DIR, "meeting-notes"), "meeting-notes", "Write the notes after a meeting, with the decisions and owners.");
  writeSkill(join(SKILLS_DIR, "weekly-report"), "weekly-report", "Summarise the week into a report for the team.", "Start with the wins, then the blockers.");
  assert.deepEqual(searchSkills("report").map((skill) => skill.name), ["weekly-report"]);
  assert.deepEqual(searchSkills("meeting decisions").map((skill) => skill.name), ["meeting-notes"]);
  assert.deepEqual(searchSkills("team week").map((skill) => skill.name), ["weekly-report"], "the skill with both words ranks first, and a word that matches nothing is ignored");
  assert.deepEqual(searchSkills("zebra"), [], "no match gives an empty list");
  assert.equal(searchSkills("").length, 3, "an empty query lists the installed skills");
  assert.equal(searchSkills("", 1).length, 1, "the limit caps the list");

  // A message that starts with /name gets that skill's instructions. Anything else is sent as it was typed.
  const command = withSkillCommand("/weekly-report for the platform team");
  assert.match(command, /^The user asked for the skill "weekly-report"/);
  assert.match(command, /# weekly-report/);
  assert.match(command, /Start with the wins, then the blockers\./);
  assert.match(command, /The user's message:\nfor the platform team$/);
  assert.match(withSkillCommand("/weekly-report"), /\(no further text\)$/, "a bare /name still asks for the skill");
  assert.equal(withSkillCommand("/no-such-skill hello"), "/no-such-skill hello", "an unknown /name is sent as it was typed");
  assert.equal(withSkillCommand("write a report"), "write a report", "a message without a leading slash is unchanged");
  assert.equal(withSkillCommand("see /weekly-report"), "see /weekly-report", "only a leading /name counts");
  assert.equal(withSkillCommand("/usr/bin/env"), "/usr/bin/env", "a path is not a skill name");

  // A replaced skill is read with its new text.
  const second = stageImport(updated);
  confirmImport(second.id);
  assert.match(loadSkill("codeword").body, /HERON-7/);

  // Reference files: only listed files are readable, and nothing outside the skill is.
  assert.throws(() => readSkillFile("codeword", "../SKILL.md"), /has no file/);
  assert.throws(() => readSkillFile("codeword", "notes/other.md"), /has no file/);

  // The skill tools. Every run reads every installed skill, an agent or a bot alike. Refused calls come back as failed results, not exceptions.
  const skillSearch = TOOLS.find((tool) => tool.name === "skill_search");
  const skillRead = TOOLS.find((tool) => tool.name === "skill_read");
  const skillFile = TOOLS.find((tool) => tool.name === "skill_file");
  const found = await skillSearch.run({ query: "codeword" }, { workspace: root });
  assert.equal(found.isError, false);
  assert.equal(found.text, "- codeword: The project codeword, updated.", "the replaced skill is the one found");
  const none = await skillSearch.run({ query: "zebra" }, { workspace: root });
  assert.equal(none.text, "No installed skill matches that.");
  const inAgent = await skillRead.run({ name: "codeword" }, { workspace: root, agentId: "agent-a" });
  assert.equal(inAgent.isError, false);
  assert.match(inAgent.text, /HERON-7/);
  assert.match(inAgent.text, /notes\/history\.md/, "the reply lists the files the skill names");
  const inBot = await skillRead.run({ name: "codeword" }, { workspace: root, botId: "bot-a" });
  assert.equal(inBot.isError, false, "a bot reads the same skills");
  const missing = await skillRead.run({ name: "no-such-skill" }, { workspace: root, agentId: "agent-a" });
  assert.equal(missing.isError, true);
  const file = await skillFile.run({ name: "codeword", path: "notes/history.md" }, { workspace: root, agentId: "agent-a" });
  assert.equal(file.text, "Chosen in 2026.");
  const escape = await skillFile.run({ name: "codeword", path: "../SKILL.md" }, { workspace: root, agentId: "agent-a" });
  assert.equal(escape.isError, true);

  // One registry, two lists: agents get every tool, bots get the memory tools, the skill tools, the room search, and the search tools. A run's token carries its own list.
  assert.ok(AGENT_TOOLS.some((tool) => tool.name === "skill_read") && AGENT_TOOLS.some((tool) => tool.name === "bash"));
  assert.deepEqual(BOT_TOOLS.map((tool) => tool.name), ["memory_search", "memory_read", "memory_edit", "skill_search", "skill_read", "skill_file", "room_search", "agents_list", "agent_ask", "tool_search", "tool_call"]);
  const token = registerRun({ tools: BOT_TOOLS });
  assert.ok(runContextForToken(token).tools.some((tool) => tool.name === "skill_read"), "a bot's run reaches its skills");
  assert.ok(!runContextForToken(token).tools.some((tool) => tool.name === "bash"), "a bot's run has no shell");
  releaseRun(token);
  assert.equal(runContextForToken(token), undefined, "a released token opens nothing");

  // The registry lists every tool with the kinds of run that may use it: agents get every tool but the bot-only ones. Bots get the memory, skill, search, room, and agent tools, and the mail and Slack tools, and the spending reads.
  const described = describeTools();
  assert.equal(described.length, TOOLS.length);
  const botOnly = ["room_search", "agents_list", "agent_ask", "mail_list", "mail_read", "mail_send", "mail_delete", "slack_search", "slack_read", "slack_unread", "slack_send", "slack_mark_read", "finance_list", "finance_create_entry"];
  assert.ok(described.filter((tool) => !botOnly.includes(tool.name)).every((tool) => tool.agent === true));
  assert.deepEqual(described.filter((tool) => tool.bot).map((tool) => tool.name), ["skill_search", "skill_read", "memory_search", "memory_read", "memory_edit", "skill_file", "tool_search", "tool_call", "room_search", "agents_list", "agent_ask", "mail_list", "mail_read", "mail_send", "mail_delete", "slack_search", "slack_read", "slack_unread", "slack_send", "slack_mark_read", "finance_list", "finance_create_entry"]);
  assert.equal(described.find((tool) => tool.name === "skill_read").description, TOOLS.find((tool) => tool.name === "skill_read").description);

  // A folder in the registry that is not a valid skill is reported, not hidden.
  mkdirSync(join(SKILLS_DIR, "broken"), { recursive: true });
  writeFileSync(join(SKILLS_DIR, "broken", "SKILL.md"), "no header here");
  const listing = listSkills();
  assert.equal(listing.skills.length, 3);
  assert.deepEqual(listing.problems.map((problem) => problem.folder), ["broken"]);

  // Removing a skill deletes its folder, and it is no longer found or read.
  removeSkill("codeword");
  assert.equal(existsSync(join(SKILLS_DIR, "codeword")), false);
  assert.equal(searchSkills("codeword").length, 0);
  assert.equal(withSkillCommand("/codeword hi"), "/codeword hi");

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
