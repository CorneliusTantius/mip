// The rules a skill must follow to be used: its name, its SKILL.md header, its files, and the size limits.
// A skill is instructions, not a program, so only text files are accepted. Pure: no file or database access.

// A skill's name is its folder name: lowercase letters, digits, and single hyphens, up to 64 characters.
const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_NAME = 64;
const MAX_DESCRIPTION = 1024;
// Names that the routes use, so a skill cannot take them.
const RESERVED = new Set(["imports"]);

export const MAX_SKILL_MD_BYTES = 64 * 1024;
export const MAX_SKILL_BYTES = 512 * 1024;
export const MAX_SKILL_FILES = 50;
// The most a skill_file call returns. Longer files are refused, so the model's context is not flooded.
export const MAX_READ_BYTES = 64 * 1024;

const TEXT_EXTENSIONS = new Set([".md", ".txt", ".json", ".yaml", ".yml", ".csv"]);

export interface SkillHeader {
  name: string;
  description: string;
  body: string;
}

export function isValidName(name: string): boolean {
  return name.length <= MAX_NAME && NAME.test(name) && !RESERVED.has(name);
}

// Whether a file is one a skill may contain. Scripts, binaries, and anything else are refused.
export function isTextFile(path: string): boolean {
  const dot = path.lastIndexOf(".");
  return dot > 0 && TEXT_EXTENSIONS.has(path.slice(dot).toLowerCase());
}

// Reads SKILL.md. The header is the block between the first two --- lines. Only `key: value` lines are read, on one line each.
export function parseSkill(text: string): SkillHeader {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) throw new Error("SKILL.md must start with a --- header that has name and description");
  const fields: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = /^([A-Za-z_-]+):\s*(.*)$/.exec(line.trim());
    if (pair) fields[pair[1]] = unquote(pair[2].trim());
  }
  const name = fields.name ?? "";
  if (!name) throw new Error("the SKILL.md header needs a name");
  if (!isValidName(name)) {
    throw new Error(`the name "${name}" must be lowercase letters, digits, and single hyphens, up to 64 characters`);
  }
  const description = fields.description ?? "";
  if (!description) throw new Error("the SKILL.md header needs a description");
  if (description.length > MAX_DESCRIPTION) throw new Error(`the description must be ${MAX_DESCRIPTION} characters or fewer`);
  return { name, description, body: text.slice(match[0].length).trim() };
}

// A path inside a skill: relative, with no parent steps, and no leading dot.
export function isSafeRelativePath(path: string): boolean {
  if (!path || path.startsWith("/") || path.includes("\\")) return false;
  return path.split("/").every((part) => part !== "" && part !== "." && part !== ".." && !part.startsWith("."));
}

function unquote(value: string): string {
  const quote = value[0];
  return (quote === '"' || quote === "'") && value.length >= 2 && value.endsWith(quote) ? value.slice(1, -1) : value;
}
