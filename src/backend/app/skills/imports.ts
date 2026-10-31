import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { SKILLS_DIR } from "../../storage/paths.js";
import { AppError, errorMessage } from "../errors.js";
import { isTextFile, MAX_SKILL_BYTES, MAX_SKILL_FILES, MAX_SKILL_MD_BYTES, parseSkill } from "./format.js";
import { loadSkill, skillFolder, type SkillDetail } from "./registry.js";

// An import is staged first. The folder is copied and checked there, and the registry does not change until the user confirms.
// Staging lives in a dot folder, so the registry never lists it as a skill.
const STAGING = join(SKILLS_DIR, ".staging");
// Written next to a staged or installed skill, so the source and its hash are kept. Dot files are not listed as skill files.
const SOURCE_FILE = ".mip-source.json";
const STALE_MS = 24 * 60 * 60 * 1000;
const ID = /^[0-9a-f-]{36}$/;

export interface ImportPreview {
  id: string;
  name: string;
  description: string;
  // Every file that would be installed, SKILL.md first.
  files: string[];
  source: string;
  skillMd: string;
  // The SKILL.md that would be replaced, when a skill with this name is already installed.
  replaces: string | null;
}

// Copies a folder into staging and checks it. Symbolic links, scripts, binaries, and oversized folders are refused.
export function stageImport(source: string): ImportPreview {
  const folder = source.trim();
  if (!isAbsolute(folder)) throw new AppError(400, "give the full path of the skill folder");
  const info = lstatSync(folder, { throwIfNoEntry: false });
  if (!info?.isDirectory()) throw new AppError(400, "that path is not a folder");
  clearStale();

  const id = randomUUID();
  const dir = join(STAGING, id);
  mkdirSync(dir, { recursive: true });
  try {
    const files = copyTree(folder, dir);
    if (!files.includes("SKILL.md")) throw new AppError(400, "the folder has no SKILL.md at its top level");
    const skillMd = readFileSync(join(dir, "SKILL.md"), "utf8");
    if (Buffer.byteLength(skillMd) > MAX_SKILL_MD_BYTES) throw new AppError(400, "SKILL.md is too large");
    const header = parseSkill(skillMd);
    writeFileSync(join(dir, SOURCE_FILE), JSON.stringify({ source: folder, sha256: sha256(skillMd), stagedAt: Date.now() }));

    const installed = join(skillFolder(header.name), "SKILL.md");
    return {
      id,
      name: header.name,
      description: header.description,
      files: ["SKILL.md", ...files.filter((file) => file !== "SKILL.md")],
      source: folder,
      skillMd,
      replaces: existsSync(installed) ? readFileSync(installed, "utf8") : null,
    };
  } catch (err) {
    rmSync(dir, { recursive: true, force: true });
    throw err instanceof AppError ? err : new AppError(400, errorMessage(err));
  }
}

// Installs a staged skill. A skill with the same name is replaced. Chats that had it enabled keep it enabled.
export function confirmImport(id: string): SkillDetail {
  const dir = stagingDir(id);
  const header = parseSkill(readFileSync(join(dir, "SKILL.md"), "utf8"));
  rmSync(skillFolder(header.name), { recursive: true, force: true });
  renameSync(dir, skillFolder(header.name));
  return loadSkill(header.name);
}

// Drops a staged import. Missing imports are not an error, so a second click does no harm.
export function discardImport(id: string): void {
  if (ID.test(id)) rmSync(join(STAGING, id), { recursive: true, force: true });
}

function stagingDir(id: string): string {
  if (!ID.test(id) || !existsSync(join(STAGING, id, "SKILL.md"))) throw new AppError(404, "no such import");
  return join(STAGING, id);
}

// Copies the text files of a folder into dest, and returns their paths. Dot entries are skipped: .git and .DS_Store are not skill content.
function copyTree(source: string, dest: string): string[] {
  const files: string[] = [];
  let bytes = 0;
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      const from = join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new AppError(400, `symbolic links are not allowed: ${path}`);
      if (entry.isDirectory()) {
        walk(from, path);
        continue;
      }
      if (!entry.isFile()) throw new AppError(400, `not a regular file: ${path}`);
      if (!isTextFile(path)) throw new AppError(400, `${path}: skills take text files only (.md, .txt, .json, .yaml, .yml, .csv)`);
      bytes += statSync(from).size;
      files.push(path);
      if (files.length > MAX_SKILL_FILES) throw new AppError(400, `a skill has at most ${MAX_SKILL_FILES} files`);
      if (bytes > MAX_SKILL_BYTES) throw new AppError(400, `a skill is at most ${MAX_SKILL_BYTES / 1024} KB in total`);
      mkdirSync(dirname(join(dest, path)), { recursive: true });
      copyFileSync(from, join(dest, path));
    }
  };
  walk(source, "");
  return files.sort();
}

// Drops staged imports left over for a day, such as from a dialog that was closed.
function clearStale(): void {
  if (!existsSync(STAGING)) return;
  for (const entry of readdirSync(STAGING)) {
    const dir = join(STAGING, entry);
    if (Date.now() - statSync(dir).mtimeMs > STALE_MS) rmSync(dir, { recursive: true, force: true });
  }
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
