import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { REPOS_DIR } from "../storage/paths.js";
import {
  deleteRepo,
  getRepo,
  getRepoByName,
  getSession,
  insertRepo,
  listRepos,
  listSessions,
  type Repo,
  setRepoStatus,
} from "../storage/store.js";
import { AppError } from "./errors.js";
import { runGit } from "./git.js";
import { workspaceFor, workspacePath } from "./tools/workspace.js";

// Links git accepts: web, ssh, git and file URLs, and the user@host:path form.
const CLONE_LINK = /^(https?|ssh|git|file):\/\/\S+$|^[\w.-]+@[\w.-]+:\S+$/;
// A folder name: letters, digits, dots, dashes and underscores, not starting with a dot.
const FOLDER_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
// A link with no scheme, such as github.com/owner/repo. It is taken as https.
const HOST_LINK = /^[\w.-]+\.[a-z]{2,}\/\S+$/i;

function withScheme(link: string): string {
  return HOST_LINK.test(link) ? `https://${link}` : link;
}

// The folder name for a clone, taken from the end of the link: "https://github.com/me/mip.git" gives "mip".
function repoNameFromUrl(url: string): string {
  const last = url.replace(/[/\\]+$/, "").split(/[/:]/).pop() ?? "";
  return last.replace(/\.git$/, "");
}

function requireRepo(id: string): Repo {
  const repo = getRepo(id);
  if (!repo) throw new AppError(404, "no such repository");
  return repo;
}

// The branch a ready repository has checked out. "detached" when it isn't on a branch.
async function branchOf(repo: Repo): Promise<string | null> {
  if (repo.status !== "ready") return null;
  try {
    const branch = await runGit(["-C", join(REPOS_DIR, repo.name), "rev-parse", "--abbrev-ref", "HEAD"]);
    return branch === "HEAD" ? "detached" : branch;
  } catch {
    return null;
  }
}

// Every repository, with its branch, and the chats that have their own copy of it.
export async function listRepoCards() {
  const chats = listSessions();
  return Promise.all(
    listRepos().map(async (repo) => ({
      ...repo,
      branch: await branchOf(repo),
      copies: chats
        .filter((chat) => existsSync(join(workspacePath(chat.id), repo.name, ".git")))
        .map((chat) => ({ sessionId: chat.id, title: chat.title })),
    })),
  );
}

// Brings every ready repository up to date with its upstream. Fast-forward only, so no merge commits appear.
// Chats' copies are separate clones and are not pulled. Returns one result per repository.
export async function pullAllRepos(): Promise<{ id: string; name: string; ok: boolean; message: string }[]> {
  const results = [];
  for (const repo of listRepos().filter((r) => r.status === "ready")) {
    const dir = join(REPOS_DIR, repo.name);
    try {
      const before = await runGit(["-C", dir, "rev-parse", "HEAD"]);
      await runGit(["-C", dir, "pull", "--ff-only"]);
      const after = await runGit(["-C", dir, "rev-parse", "HEAD"]);
      results.push({ id: repo.id, name: repo.name, ok: true, message: before === after ? "already up to date" : "updated to the latest commit" });
    } catch (err) {
      results.push({ id: repo.id, name: repo.name, ok: false, message: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}

// Starts a clone in the background, into the repos folder. The repository shows as "cloning" until git finishes.
export function addRepo(urlInput: unknown): Repo {
  const url = withScheme(String(urlInput ?? "").trim());
  if (!CLONE_LINK.test(url)) throw new AppError(400, "paste a git clone link, such as github.com/owner/repo");
  const name = repoNameFromUrl(url);
  if (!FOLDER_NAME.test(name)) throw new AppError(400, `can't use "${name}" as a folder name`);

  const dir = join(REPOS_DIR, name);
  if (getRepoByName(name) || existsSync(dir)) throw new AppError(409, `a repository called "${name}" is already here`);

  const repo: Repo = { id: randomUUID(), name, url, status: "cloning", error: null };
  insertRepo(repo);
  runGit(["clone", "--", url, dir]).then(
    () => setRepoStatus(repo.id, "ready", null),
    (err: unknown) => {
      // The folder only exists because of this clone, so it is safe to remove the partial copy.
      rmSync(dir, { recursive: true, force: true });
      setRepoStatus(repo.id, "error", err instanceof Error ? err.message : String(err));
    },
  );
  return repo;
}

// Gives a chat its own copy of a ready repository: a separate clone in the chat's workspace.
// The copy's origin is the real link, so pushing from it goes to that remote, not to the master clone.
export async function copyRepoToChat(repoId: string, sessionIdInput: unknown): Promise<void> {
  const repo = requireRepo(repoId);
  if (repo.status !== "ready") throw new AppError(409, `${repo.name} isn't ready yet`);
  const sessionId = String(sessionIdInput ?? "");
  if (!getSession(sessionId)) throw new AppError(404, "no such chat");

  const dest = join(workspaceFor(sessionId), repo.name);
  if (existsSync(dest)) throw new AppError(409, `this chat already has ${repo.name}`);
  try {
    await runGit(["clone", "--", join(REPOS_DIR, repo.name), dest]);
    await runGit(["-C", dest, "remote", "set-url", "origin", repo.url]);
  } catch (err) {
    rmSync(dest, { recursive: true, force: true });
    throw new AppError(500, err instanceof Error ? err.message : String(err));
  }
}

// Removes a master clone. Chats' copies are separate clones, so they keep working.
export function removeRepo(repoId: string): void {
  const repo = requireRepo(repoId);
  if (repo.status === "cloning") throw new AppError(409, `${repo.name} is still cloning`);
  rmSync(join(REPOS_DIR, repo.name), { recursive: true, force: true });
  deleteRepo(repo.id);
}

// Tells the agent which repositories are in its workspace, so it knows where to look. Empty when there are none.
export function repoNote(workspace: string): string {
  if (!existsSync(workspace)) return "";
  const names = readdirSync(workspace, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(workspace, entry.name, ".git")))
    .map((entry) => entry.name);
  return names.length ? `Git repositories in your workspace, each in its own folder: ${names.join(", ")}.` : "";
}
