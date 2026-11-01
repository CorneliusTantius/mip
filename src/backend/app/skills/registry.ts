import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { SKILLS_DIR } from "../../storage/paths.js";
import { AppError, errorMessage } from "../errors.js";
import { isSafeRelativePath, isTextFile, isValidName, MAX_READ_BYTES, MAX_SKILL_MD_BYTES, parseSkill } from "./format.js";

// The skill registry: the folders under MIP_HOME/skills, one per skill. Only this module reads them. Every agent and bot can use every
// installed skill, through the skill tools in app/tools/skills.ts.
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

// The installed skills that match the words, best first. A skill matches when its name or description holds one of the words, and a
// skill that holds more of them ranks higher. An empty query lists the first skills by name.
export function searchSkills(query: string, limit = 10): SkillSummary[] {
  const skills = listSkills().skills;
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return skills.slice(0, limit);
  return skills
    .map((skill) => {
      const text = `${skill.name} ${skill.description}`.toLowerCase();
      return { skill, hits: words.filter((word) => text.includes(word)).length };
    })
    .filter((match) => match.hits > 0)
    .sort((a, b) => b.hits - a.hits || a.skill.name.localeCompare(b.skill.name))
    .slice(0, limit)
    .map((match) => match.skill);
}

// A message that starts with /name asks for that installed skill with the rest of the message. The model gets the skill's
// instructions with the message. Any other message, or a /name that is not an installed skill, is sent as it is.
export function withSkillCommand(message: string): string {
  const match = /^\/([A-Za-z0-9][\w.-]*)(?:\s+([\s\S]*))?$/.exec(message);
  if (!match) return message;
  const name = match[1] ?? "";
  if (!listSkills().skills.some((skill) => skill.name === name)) return message;
  const skill = loadSkill(name);
  const files = skill.files.length > 0 ? `\n\nFiles in this skill (read them with skill_file): ${skill.files.join(", ")}` : "";
  return [
    `The user asked for the skill "${name}" with this message. Follow its instructions for the message.`,
    "",
    `# ${skill.name}`,
    "",
    `${skill.body}${files}`,
    "",
    "The user's message:",
    (match[2] ?? "").trim() || "(no further text)",
  ].join("\n");
}

// Removes an installed skill from mip.
export function removeSkill(name: string): void {
  loadSkill(name);
  rmSync(skillFolder(name), { recursive: true, force: true });
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
