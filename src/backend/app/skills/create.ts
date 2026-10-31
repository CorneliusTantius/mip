import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AppError } from "../errors.js";
import { isValidName, MAX_DESCRIPTION, MAX_SKILL_MD_BYTES } from "./format.js";
import { loadSkill, skillFolder, type SkillDetail } from "./registry.js";

// Creates a skill from a form: a name, a one-line description, and the instructions. The header is written the same way an
// import's is, so a created skill reads back the same. A skill that is already installed is never replaced.
export function createSkill(input: Record<string, unknown>): SkillDetail {
  const name = text(input.name);
  const description = text(input.description);
  const body = text(input.body);
  if (!isValidName(name)) {
    throw new AppError(400, "the name must be lowercase letters, digits, and single hyphens, up to 64 characters");
  }
  if (!description) throw new AppError(400, "a description is required");
  if (/[\r\n]/.test(description)) throw new AppError(400, "the description must be one line");
  if (description.length > MAX_DESCRIPTION) throw new AppError(400, `the description must be ${MAX_DESCRIPTION} characters or fewer`);
  if (!body) throw new AppError(400, "the instructions are required");

  const markdown = `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`;
  if (Buffer.byteLength(markdown) > MAX_SKILL_MD_BYTES) throw new AppError(400, "the instructions are too long");
  if (existsSync(skillFolder(name))) throw new AppError(409, `a skill named ${name} is already installed`);

  mkdirSync(skillFolder(name), { recursive: true });
  try {
    writeFileSync(join(skillFolder(name), "SKILL.md"), markdown);
  } catch (err) {
    rmSync(skillFolder(name), { recursive: true, force: true });
    throw err;
  }
  return loadSkill(name);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
