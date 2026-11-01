import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { SKILLS_DIR } from "../../storage/paths.js";
import { botSkillNames, enabledSkillNames, removeSkillEnablements, saveAgentSkills, saveBotSkills } from "../../storage/skills.js";
import { AppError, errorMessage } from "../errors.js";
import { isSafeRelativePath, isTextFile, isValidName, MAX_READ_BYTES, MAX_SKILL_MD_BYTES, parseSkill } from "./format.js";

// The skill registry: the folders under MIP_HOME/skills, one per skill. Only this module reads them. An agent or a bot can use only
// the skills it has enabled, and a skill is read only through the tools in app/tools/skills.ts.
const SKILL_FILE = "SKILL.md";

export interface SkillSummary {
  name: string;
  description: string;
  // The text files in the skill besides SKILL.md, as paths inside the skill.
  files: string[];
}

export interface SkillDetail extends SkillSummary {
  body: string;
}

export interface SkillProblem {
  folder: string;
  error: string;
}

export function skillFolder(name: string): string {
  return join(SKILLS_DIR, name);
}

// The installed skills, sorted by name. A folder that is not a valid skill is listed as a problem rather than hidden.
export function listSkills(): { skills: SkillSummary[]; problems: SkillProblem[] } {
  const skills: SkillSummary[] = [];
  const problems: SkillProblem[] = [];
  if (!existsSync(SKILLS_DIR)) return { skills, problems };
  for (const entry of readdirSync(SKILLS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    try {
      const header = parseSkill(readSkillMd(entry.name));
      if (header.name !== entry.name) throw new Error(`the name in SKILL.md ("${header.name}") must match its folder`);
      skills.push({ name: header.name, description: header.description, files: referenceFiles(entry.name) });
    } catch (err) {
      problems.push({ folder: entry.name, error: errorMessage(err) });
    }
  }
  return { skills: skills.sort((a, b) => a.name.localeCompare(b.name)), problems };
}

// One installed skill with its body. A missing or invalid skill is refused.
export function loadSkill(name: string): SkillDetail {
  if (!isValidName(name) || !existsSync(join(skillFolder(name), SKILL_FILE))) throw new AppError(404, "no such skill");
  let header;
  try {
    header = parseSkill(readSkillMd(name));
  } catch (err) {
    throw new AppError(409, `skill "${name}" is not valid: ${errorMessage(err)}`);
  }
  return { name: header.name, description: header.description, body: header.body, files: referenceFiles(name) };
}

// One text file a skill lists, read as text. Only the files the listing shows can be read, and each one has a size cap.
export function readSkillFile(name: string, path: string): string {
  const skill = loadSkill(name);
  if (!isSafeRelativePath(path) || !skill.files.includes(path)) throw new Error(`skill "${name}" has no file "${path}"`);
  const full = join(skillFolder(name), path);
  if (statSync(full).size > MAX_READ_BYTES) throw new Error(`${path} is larger than ${MAX_READ_BYTES / 1024} KB`);
  return readFileSync(full, "utf8");
}

// The skills an agent has enabled, as they are installed now. A skill that was removed is left out.
export function enabledSkills(agentId: string): SkillSummary[] {
  return installedNamed(enabledSkillNames(agentId));
}

// The skills a bot has enabled, as they are installed now. A skill that was removed is left out.
export function botSkills(botId: string): SkillSummary[] {
  return installedNamed(botSkillNames(botId));
}

// The installed skills with these names, in name order.
function installedNamed(names: string[]): SkillSummary[] {
  const wanted = new Set(names);
  return listSkills().skills.filter((skill) => wanted.has(skill.name));
}

// The skill an agent may read. Refused unless the agent has enabled it.
export function enabledSkill(agentId: string, name: string): SkillDetail {
  if (!enabledSkillNames(agentId).includes(name)) throw new Error(`skill "${name}" is not enabled for this agent`);
  return loadSkill(name);
}

// The skill a bot may read. Refused unless the bot has enabled it.
export function enabledBotSkill(botId: string, name: string): SkillDetail {
  if (!botSkillNames(botId).includes(name)) throw new Error(`skill "${name}" is not enabled for this bot`);
  return loadSkill(name);
}

// The part of the system prompt that lists an agent's skills. Empty when the agent has none enabled.
export function skillsPrompt(agentId: string): string {
  return skillListPrompt(enabledSkills(agentId), "agent");
}

// The part of a bot's system prompt that lists its skills. Empty when the bot has none enabled.
export function botSkillsPrompt(botId: string): string {
  return skillListPrompt(botSkills(botId), "bot");
}

function skillListPrompt(skills: SkillSummary[], who: "agent" | "bot"): string {
  if (skills.length === 0) return "";
  return [
    `Skills enabled for this ${who}. Each one holds instructions for a kind of task.`,
    "When a task matches a skill, call skill_read with its name first, and follow it. Call skill_file to read a file the skill names.",
    ...skills.map((skill) => `- ${skill.name}: ${skill.description}`),
  ].join("\n");
}

// Checks that every name is an installed skill, and returns the names sorted, without repeats.
export function checkSkillNames(names: string[]): string[] {
  const installed = new Set(listSkills().skills.map((skill) => skill.name));
  const unknown = names.filter((name) => !installed.has(name));
  if (unknown.length > 0) throw new AppError(400, `no such skill: ${unknown.join(", ")}`);
  return [...new Set(names)].sort();
}

// Replaces an agent's enabled skills. Every name must be an installed skill.
export function setAgentSkills(agentId: string, names: string[]): string[] {
  const unique = checkSkillNames(names);
  saveAgentSkills(agentId, unique);
  return unique;
}

// Replaces a bot's enabled skills. Every name must be an installed skill.
export function setBotSkills(botId: string, names: string[]): string[] {
  const unique = checkSkillNames(names);
  saveBotSkills(botId, unique);
  return unique;
}

// Removes an installed skill, and takes it away from every agent that had it enabled.
export function removeSkill(name: string): void {
  loadSkill(name);
  rmSync(skillFolder(name), { recursive: true, force: true });
  removeSkillEnablements(name);
}

function readSkillMd(name: string): string {
  const path = join(skillFolder(name), SKILL_FILE);
  if (!existsSync(path)) throw new Error("the folder has no SKILL.md");
  if (statSync(path).size > MAX_SKILL_MD_BYTES) throw new Error(`SKILL.md is larger than ${MAX_SKILL_MD_BYTES / 1024} KB`);
  return readFileSync(path, "utf8");
}

// The text files in a skill besides SKILL.md. Dot files and symbolic links are not listed.
function referenceFiles(name: string): string[] {
  const files: string[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(join(dir, entry.name), path);
      else if (entry.isFile() && path !== SKILL_FILE && isTextFile(path)) files.push(path);
    }
  };
  walk(skillFolder(name), "");
  return files.sort();
}
