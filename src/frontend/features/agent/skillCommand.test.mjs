// Checks the "/" skill list: which text opens it, and which skills it offers, a name that starts with the text first.
// Run after a build: node src/frontend/features/agent/skillCommand.test.mjs
import assert from "node:assert/strict";
import { matchingSkills, skillCommandQuery } from "./skillCommand.ts";

// 1. A message that starts with "/" opens the list with the text typed after it, and a space after the name closes it.
assert.equal(skillCommandQuery("/"), "");
assert.equal(skillCommandQuery("/rep"), "rep");
assert.equal(skillCommandQuery("/weekly-report"), "weekly-report");
assert.equal(skillCommandQuery("/weekly-report for the team"), undefined);
assert.equal(skillCommandQuery("/rep "), undefined);
assert.equal(skillCommandQuery("hi /rep"), undefined);
assert.equal(skillCommandQuery(""), undefined);

// 2. The skills offered are the ones whose name holds the text, ignoring case. A name that starts with the text comes first.
const skills = [
  { name: "weekly-report", description: "Summarise the week.", files: [] },
  { name: "report-writer", description: "Write reports.", files: [] },
  { name: "daily-report", description: "Daily notes.", files: [] },
  { name: "meeting-notes", description: "Notes after a meeting.", files: [] },
];
assert.deepEqual(matchingSkills(skills, "report").map((skill) => skill.name), ["report-writer", "daily-report", "weekly-report"]);
assert.deepEqual(matchingSkills(skills, "WEEK").map((skill) => skill.name), ["weekly-report"]);

// 3. An empty query offers every skill, sorted by name. A text no name holds offers none.
assert.deepEqual(matchingSkills(skills, "").map((skill) => skill.name), ["daily-report", "meeting-notes", "report-writer", "weekly-report"]);
assert.deepEqual(matchingSkills(skills, "zebra"), []);

console.log("skill command tests passed");
