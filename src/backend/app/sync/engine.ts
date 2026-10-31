import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SYNC_DIR } from "../../storage/paths.js";
import { AppError, errorMessage } from "../errors.js";
import { countChanges, emptySnapshot, isEmptySnapshot, mergeSnapshots, type Snapshot } from "./merge.js";
import { authEnv, ensureRepo, gitHubAccount, listAccounts, pickAccount, REPO_NAME, repoUrl, type Account } from "./github.js";
import { commitAndPush, fetchRepo, readTree, writeTree } from "./repo.js";
import { applySnapshot, readLocal } from "./snapshot.js";

// Each run fetches the dotmip repo, merges it with this machine's data, and pushes the result. The merge base (the state both
// sides last agreed on) is kept with the repo it came from. A base from another repo is ignored, so switching accounts cannot
// read the old repo's records as deletions.
const BASE_FILE = join(SYNC_DIR, "base.json");
// The chosen account and the last run. The account is a login name, not a secret.
const STATE_FILE = join(SYNC_DIR, "state.json");
// A push is rejected when another machine pushed first. The run then fetches and merges again.
const MAX_ATTEMPTS = 3;

export interface SyncRun {
  at: number;
  ok: boolean;
  message: string;
  pulled: number;
  pushed: number;
  notes: string[];
}

export interface SyncStatus {
  // Every account gh is signed in to, and the one sync uses (null when there is none).
  accounts: string[];
  login: string | null;
  repo: string | null;
  running: boolean;
  error: string | null;
  lastSync: SyncRun | null;
}

const saved = readState();
let chosen = saved.account;
let lastSync = saved.lastSync;
let running = false;

// The accounts gh has, the one sync uses, and the last run. gh is asked on each call, so a sign-in shows on the next load.
export async function syncStatus(): Promise<SyncStatus> {
  const { accounts, error } = await listAccounts();
  const login = pickAccount(accounts, chosen);
  return {
    accounts: accounts.map((account) => account.login),
    login,
    repo: login ? `${login}/${REPO_NAME}` : null,
    running,
    error,
    lastSync,
  };
}

// Chooses the account the next sync uses. Each account has its own dotmip repo, so the next sync goes to that repo.
export async function chooseAccount(login: string): Promise<SyncStatus> {
  if (running) throw new AppError(409, "Wait for the running sync to finish before switching accounts.");
  const { accounts } = await listAccounts();
  if (!accounts.some((account) => account.login === login)) throw new AppError(400, `gh is not signed in to ${login}.`);
  chosen = login;
  writeState();
  return syncStatus();
}

// Starts a sync in the background. The dashboard polls the status until running is false.
export async function startSync(): Promise<SyncStatus> {
  if (running) throw new AppError(409, "A sync is already running.");
  // Set before the first await, so a second request cannot start a sync alongside this one.
  running = true;
  let account: Account;
  try {
    const { accounts } = await listAccounts();
    const login = pickAccount(accounts, chosen);
    if (!login) throw new AppError(409, "Sign in with the GitHub CLI first: run `gh auth login` in a terminal.");
    account = await gitHubAccount(login);
  } catch (err) {
    running = false;
    throw err;
  }
  void runInBackground(account);
  return syncStatus();
}

async function runInBackground(account: Account): Promise<void> {
  try {
    await ensureRepo(account.token, account.login);
    lastSync = await syncWith({
      url: repoUrl(account.login),
      env: authEnv(account.token),
      repo: `${account.login}/${REPO_NAME}`,
    });
  } catch (err) {
    lastSync = { at: Date.now(), ok: false, message: errorMessage(err), pulled: 0, pushed: 0, notes: [] };
  } finally {
    running = false;
    writeState();
  }
}

// One sync against a repo. Exported so the tests can run it against a local repo. The repo must exist.
export async function syncWith(remote: { url: string; env: NodeJS.ProcessEnv; repo: string }): Promise<SyncRun> {
  const before = readLocal();
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await fetchRepo(remote.url, remote.env);
    const remoteState = readTree();
    const base = readBase(remote.repo);
    const local = readLocal();
    // A database that is empty while the last sync had data is probably a wrong MIP_HOME. Refuse rather than delete everything on GitHub.
    if (isEmptySnapshot(local) && !isEmptySnapshot(base)) {
      throw new AppError(409, "This database is empty, but the last sync had data. Nothing was changed. Check MIP_HOME first.");
    }
    const { merged, notes } = mergeSnapshots(base, local, remoteState);
    applySnapshot(local, merged);
    const final = readLocal();
    writeTree(final);
    const result = await commitAndPush(remote.env, `Sync from mip ${new Date().toISOString()}`);
    if (result === "rejected") continue;
    writeBase(final, remote.repo);
    const pulled = countChanges(before, final);
    const pushed = countChanges(remoteState, final);
    return { at: Date.now(), ok: true, message: summarize(pulled, pushed, notes.length), pulled, pushed, notes };
  }
  throw new AppError(409, "GitHub changed during the sync. Sync again.");
}

function summarize(pulled: number, pushed: number, merged: number): string {
  if (pulled + pushed === 0 && merged === 0) return "Already in sync.";
  return `Pulled ${pulled}, pushed ${pushed}${merged ? `, ${merged} merged` : ""}.`;
}

function readBase(repo: string): Snapshot {
  if (!existsSync(BASE_FILE)) return emptySnapshot();
  const saved = JSON.parse(readFileSync(BASE_FILE, "utf8")) as { repo?: string; snapshot?: Snapshot };
  return saved.repo === repo && saved.snapshot ? saved.snapshot : emptySnapshot();
}

function writeBase(snapshot: Snapshot, repo: string): void {
  mkdirSync(SYNC_DIR, { recursive: true });
  writeFileSync(BASE_FILE, JSON.stringify({ repo, snapshot }));
}

function readState(): { account: string | null; lastSync: SyncRun | null } {
  if (!existsSync(STATE_FILE)) return { account: null, lastSync: null };
  const data = JSON.parse(readFileSync(STATE_FILE, "utf8")) as { account?: string | null; lastSync?: SyncRun | null };
  return { account: data.account ?? null, lastSync: data.lastSync ?? null };
}

function writeState(): void {
  mkdirSync(SYNC_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify({ account: chosen, lastSync }));
}
