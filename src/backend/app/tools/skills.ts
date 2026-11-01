import type { ToolSpec } from "../../adapters/contract.js";
import { loadSkill, readSkillFile, searchSkills } from "../skills/registry.js";
import { ok } from "./result.js";

// Finds installed skills by the words in their names and descriptions. Read the best match with skill_read.
export const skillSearchTool: ToolSpec = {
  name: "skill_search",
  guide: "Searches the installed skills by the words in their names and descriptions. When a task may be covered by a skill, search first, then read the best match with skill_read.",
  description: "Search the installed skills by words in their names or descriptions. Returns the matching skill names and descriptions.",
  inputSchema: {
    type: "object",
    properties: { query: { type: "string", description: "Words that describe the task, for example: report, invoice." } },
    required: ["query"],
  },
  async run(input) {
    const found = searchSkills(String(input.query ?? ""));
    if (found.length === 0) return ok("No installed skill matches that.");
    return ok(found.map((skill) => `- ${skill.name}: ${skill.description}`).join("\n"));
  },
};

// Reads an installed skill: its instructions, and the files it names.
export const skillReadTool: ToolSpec = {
  name: "skill_read",
  guide: "Reads an installed skill: its instructions and the files it names. When a task matches a skill, call this with the skill's name before you start, and follow what it says.",
  description: "Read an installed skill: its instructions and the files it names. Call this before a task that a skill covers.",
  inputSchema: {
    type: "object",
    properties: { name: { type: "string", description: "The skill's name, as skill_search listed it." } },
    required: ["name"],
  },
  async run(input) {
    const skill = loadSkill(String(input.name ?? ""));
    const files = skill.files.length > 0 ? `\n\nFiles in this skill (read them with skill_file): ${skill.files.join(", ")}` : "";
    return ok(`# ${skill.name}\n\n${skill.body}${files}`);
  },
};

// Reads one text file that a skill lists.
export const skillFileTool: ToolSpec = {
  name: "skill_file",
  guide: "Reads one text file that a skill names, using the path that skill_read listed. Only the files a skill lists can be read.",
  description: "Read one text file that a skill lists, as skill_read named it.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "The skill's name." },
      path: { type: "string", description: "The file's path inside the skill." },
    },
    required: ["name", "path"],
  },
  async run(input) {
    return ok(readSkillFile(String(input.name ?? ""), String(input.path ?? "")));
  },
};
