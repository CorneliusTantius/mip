// Checks the skill rules: the SKILL.md header, names, file types, and safe paths. Run after a build:
//   node src/backend/app/skills/format.test.mjs
import assert from "node:assert/strict";
import { isSafeRelativePath, isTextFile, isValidName, parseSkill } from "../../../../dist/backend/app/skills/format.js";

// A valid header parses, and quotes around a value are removed. The body is what follows the header.
{
  const skill = parseSkill(`---\nname: pdf-tools\ndescription: "Work with PDFs: merge and split."\n---\n\n# Body\nText`);
  assert.equal(skill.name, "pdf-tools");
  assert.equal(skill.description, "Work with PDFs: merge and split.");
  assert.equal(skill.body, "# Body\nText");
}

// A header is required, with a name and a description.
{
  assert.throws(() => parseSkill("# No header"), /must start with a --- header/);
  assert.throws(() => parseSkill("---\ndescription: x\n---\n"), /needs a name/);
  assert.throws(() => parseSkill("---\nname: good-one\n---\n"), /needs a description/);
  assert.throws(() => parseSkill(`---\nname: good-one\ndescription: ${"x".repeat(1025)}\n---\n`), /1024 characters/);
}

// Names are lowercase with single hyphens, up to 64 characters. The routes' word "imports" is reserved.
{
  for (const good of ["a", "a1", "pdf-tools", "a-b-c"]) assert.equal(isValidName(good), true, good);
  for (const bad of ["-a", "a-", "a--b", "A", "a_b", "imports", "a".repeat(65), ""]) assert.equal(isValidName(bad), false, bad);
  assert.throws(() => parseSkill("---\nname: Bad_Name\ndescription: x\n---\n"), /lowercase letters/);
}

// Only text files are allowed. Scripts and binaries are not skill content.
{
  assert.equal(isTextFile("notes/history.md"), true);
  assert.equal(isTextFile("data.CSV"), true);
  assert.equal(isTextFile("run.sh"), false);
  assert.equal(isTextFile("script.py"), false);
  assert.equal(isTextFile("image.png"), false);
  assert.equal(isTextFile("README"), false);
  assert.equal(isTextFile(".md"), false);
}

// Paths inside a skill are relative, and never climb out or start with a dot.
{
  assert.equal(isSafeRelativePath("notes/history.md"), true);
  assert.equal(isSafeRelativePath("../secret.md"), false);
  assert.equal(isSafeRelativePath("notes/../../secret.md"), false);
  assert.equal(isSafeRelativePath("/etc/passwd"), false);
  assert.equal(isSafeRelativePath("a\\b.md"), false);
  assert.equal(isSafeRelativePath(".hidden.md"), false);
  assert.equal(isSafeRelativePath(""), false);
}

console.log("skill format tests passed");
