import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { SYNC_DIR } from "../../storage/paths.js";
import { errorMessage } from "../errors.js";
import { runGit } from "../git.js";
import { indexBy, keyOf, sortKeys, type BotRecord, type AgentRecord, type NoteRecord, type PersonaRecord, type RoomRecord, type Snapshot } from "./merge.js";

// The local copy of the dotmip repo. Sync reads its files, writes the merged state, and commits and pushes. Edits made
// here by hand are overwritten by the next sync.
export const REPO_DIR = join(SYNC_DIR, "dotmip");
// One folder per part. The room is one file, a list in order, since its messages are only ever added.
const FOLDERS = ["personas", "bots", "notes", "chats"] as const;
const ROOM_FILE = "room.json";
const README = `# dotmip

Data synced from mip. mip writes this repo; edits made here are overwritten by the next sync.

- personas/: personas, one file each
- bots/: bots, one file each
- notes/: memory notes, one file each
- chats/: chats with their messages, one file each
- room.json: the messages from the bots room, in order

Not stored here: provider logins, repository clones, and agent workspaces.
`;

// Brings the local copy to the remote's main branch. The copy is made again when the URL changes (another GitHub account),
// so refs from the old remote cannot be read as this one's. Local changes are discarded, since the sync rewrites every file.
export async function fetchRepo(url: string, env: NodeJS.ProcessEnv): Promise<void> {
  const current = existsSync(join(REPO_DIR, ".git")) ? await runGit(["-C", REPO_DIR, "remote", "get-url", "origin"]).catch(() => null) : null;
  if (current === url) {
    await runGit(["-C", REPO_DIR, "fetch", "--prune", "origin"], env);
  } else {
    rmSync(REPO_DIR, { recursive: true, force: true });
    mkdirSync(dirname(REPO_DIR), { recursive: true });
    await runGit(["clone", url, REPO_DIR], env);
  }
  if (await hasRemoteMain(env)) {
    await runGit(["-C", REPO_DIR, "checkout", "-f", "-B", "main", "origin/main"], env);
  } else {
    // An empty remote has no main yet. The first push creates it.
    await runGit(["-C", REPO_DIR, "symbolic-ref", "HEAD", "refs/heads/main"]);
  }
}

async function hasRemoteMain(env: NodeJS.ProcessEnv): Promise<boolean> {
  try {
    await runGit(["-C", REPO_DIR, "rev-parse", "--verify", "--quiet", "refs/remotes/origin/main"], env);
    return true;
  } catch {
    return false;
  }
}

// Reads the repo's files as a snapshot. A file that is not valid JSON stops the sync, so nothing is overwritten by mistake.
export function readTree(): Snapshot {
  return {
    personas: indexBy(readFolder<PersonaRecord>("personas"), keyOf.persona),
    bots: indexBy(readFolder<BotRecord>("bots"), keyOf.bot),
    notes: indexBy(readFolder<NoteRecord>("notes"), keyOf.note),
    chats: indexBy(readFolder<AgentRecord>("chats"), keyOf.agent),
    room: indexBy(existsSync(join(REPO_DIR, ROOM_FILE)) ? readJson<RoomRecord[]>(ROOM_FILE) : [], keyOf.room),
  };
}

// Replaces the repo's data files with the snapshot. Files the snapshot no longer has are removed.
export function writeTree(snapshot: Snapshot): void {
  for (const folder of FOLDERS) rmSync(join(REPO_DIR, folder), { recursive: true, force: true });
  rmSync(join(REPO_DIR, ROOM_FILE), { force: true });
  writeRecords("personas", snapshot.personas);
  writeRecords("bots", snapshot.bots);
  writeRecords("notes", snapshot.notes);
  writeRecords("chats", snapshot.chats);
  writeJson(ROOM_FILE, Object.keys(snapshot.room).sort().map((key) => snapshot.room[key]));
  writeFileSync(join(REPO_DIR, "README.md"), README);
}

// Commits every change in the local copy and pushes it to main. Returns "rejected" when GitHub's main moved first, so the
// caller can fetch and merge again.
export async function commitAndPush(env: NodeJS.ProcessEnv, message: string): Promise<"pushed" | "unchanged" | "rejected"> {
  await runGit(["-C", REPO_DIR, "add", "-A"]);
  if (!(await runGit(["-C", REPO_DIR, "status", "--porcelain"]))) return "unchanged";
  await runGit(["-C", REPO_DIR, "-c", "user.name=mip", "-c", "user.email=mip@localhost", "commit", "-m", message]);
  try {
    await runGit(["-C", REPO_DIR, "push", "origin", "HEAD:refs/heads/main"], env);
    return "pushed";
  } catch (err) {
    if (/failed to push some refs|non-fast-forward|fetch first|rejected/.test(errorMessage(err))) return "rejected";
    throw err;
  }
}

function readFolder<T>(folder: string): T[] {
  const dir = join(REPO_DIR, folder);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => readJson<T>(join(folder, file)));
}

function readJson<T>(path: string): T {
  try {
    return JSON.parse(readFileSync(join(REPO_DIR, path), "utf8")) as T;
  } catch {
    throw new Error(`${path} in the dotmip repo is not valid JSON. Fix or delete it, then sync again.`);
  }
}

function writeRecords(folder: string, records: Record<string, unknown>): void {
  mkdirSync(join(REPO_DIR, folder), { recursive: true });
  for (const key of Object.keys(records)) writeJson(join(folder, `${encodeURIComponent(key)}.json`), records[key]);
}

// Keys are sorted and the text is indented, so a change shows up as a small diff.
function writeJson(path: string, data: unknown): void {
  writeFileSync(join(REPO_DIR, path), `${JSON.stringify(sortKeys(data), null, 2)}\n`);
}
