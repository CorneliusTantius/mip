import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SYNC_DIR } from "../../storage/paths.js";
import { AppError, errorMessage } from "../errors.js";
import { applySnapshot, readLocal } from "./snapshot.js";
import { countChanges, emptySnapshot, isEmptySnapshot, mergeSnapshots, type Snapshot } from "./merge.js";
import { authEnv, ensureRepo, githubLogin, pollForToken, readConfig, REPO_NAME, repoUrl, requestDeviceCode, writeConfig, type DeviceCode } from "./github.js";
import { commitAndPush, fetchRepo, readTree, writeTree } from "./repo.js";

// Sync runs on GitHub's dotmip repo. Each run fetches it, merges it with this machine's data, and pushes the result.
// The merge's base (what both sides last agreed on) is kept in base.json, so deletes can be told from new records.
const BASE_FILE = join(SYNC_DIR, "base.json");
const STATE_FILE = join(SYNC_DIR, "state.json");
// A push can be rejected when another machine pushed first. The run then fetches and merges again.
const MAX_ATTEMPTS = 3;

export interface SyncRun {
  at: number;
  ok: boolean;
  message: string;
  pulled: number;
  pushed: number;
  notes: string[];
}

export interface DeviceState {
  userCode: string;
  verificationUri: string;
  expiresAt: number;
}

export interface SyncStatus {
  clientId: string | null;
  connected: boolean;
  login: string | null;
  repo: string | null;
  device: DeviceState | null;
  running: boolean;
  error: string | null;
  lastSync: SyncRun | null;
}

let running = false;
let device: DeviceState | null = null;
let error: string | null = null;
let lastSync: SyncRun | null = readState();

// What the dashboard shows: the connection, the code while a sign-in waits, and the last run.
export function syncStatus(): SyncStatus {
  const config = readConfig();
  return {
    clientId: config.clientId,
    connected: !!config.token && !!config.login,
    login: config.login,
    repo: config.login ? `${config.login}/${REPO_NAME}` : null,
    device,
    running,
    error,
    lastSync,
  };
}

// The OAuth app's client ID. Device flow needs no secret, so this is all the setup there is.
export function saveClientId(clientId: string): void {
  const trimmed = clientId.trim();
  if (!trimmed) throw new AppError(400, "Enter the GitHub OAuth client ID.");
  if (!/^[\w.-]{1,64}$/.test(trimmed)) throw new AppError(400, "That does not look like a GitHub client ID.");
  writeConfig({ ...readConfig(), clientId: trimmed });
}

// Starts the GitHub sign-in. Returns the code at once. The token is saved in the background, once the user approves it.
export async function connect(): Promise<SyncStatus> {
  const config = readConfig();
  if (!config.clientId) throw new AppError(400, "Enter the GitHub OAuth client ID first.");
  if (device) throw new AppError(409, "A GitHub sign-in is already waiting for approval.");
  let code: DeviceCode;
  try {
    code = await requestDeviceCode(config.clientId);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(502, `Could not reach GitHub: ${errorMessage(err)}`);
  }
  device = { userCode: code.userCode, verificationUri: code.verificationUri, expiresAt: Date.now() + code.expiresIn * 1000 };
  error = null;
  void finishConnect(config.clientId, code);
  return syncStatus();
}

async function finishConnect(clientId: string, code: DeviceCode): Promise<void> {
  try {
    const token = await pollForToken(clientId, code);
    const login = await githubLogin(token);
    writeConfig({ ...readConfig(), token, login });
    // A base from another account would not match this one's repo, so the next sync starts from GitHub's copy.
    rmSync(BASE_FILE, { force: true });
  } catch (err) {
    error = errorMessage(err);
  } finally {
    device = null;
  }
}

// Forgets the token. Local data stays. The next sync after connecting again starts from GitHub's copy.
export function disconnect(): void {
  writeConfig({ ...readConfig(), token: null, login: null });
  rmSync(BASE_FILE, { force: true });
  device = null;
  error = null;
}

// Starts a sync in the background. The dashboard polls the status until running is false.
export function startSync(): SyncStatus {
  const config = readConfig();
  if (!config.token || !config.login) throw new AppError(409, "Connect GitHub first.");
  if (running) throw new AppError(409, "A sync is already running.");
  running = true;
  error = null;
  void runInBackground();
  return syncStatus();
}

async function runInBackground(): Promise<void> {
  try {
    const config = readConfig();
    const token = config.token!;
    const login = config.login!;
    await ensureRepo(token, login);
    lastSync = await syncWith({ url: repoUrl(login), env: authEnv(token) });
  } catch (err) {
    lastSync = { at: Date.now(), ok: false, message: errorMessage(err), pulled: 0, pushed: 0, notes: [] };
  } finally {
    running = false;
    writeState();
  }
}

// One sync against a remote repo. Exported so the tests can run it against a local repo. The repo must exist.
export async function syncWith(remote: { url: string; env: NodeJS.ProcessEnv }): Promise<SyncRun> {
  const before = readLocal();
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await fetchRepo(remote.url, remote.env);
    const remoteState = readTree();
    const base = readBase();
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
    writeBase(final);
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

function readBase(): Snapshot {
  if (!existsSync(BASE_FILE)) return emptySnapshot();
  return JSON.parse(readFileSync(BASE_FILE, "utf8")) as Snapshot;
}

function writeBase(snapshot: Snapshot): void {
  mkdirSync(SYNC_DIR, { recursive: true });
  writeFileSync(BASE_FILE, JSON.stringify(snapshot));
}

function readState(): SyncRun | null {
  if (!existsSync(STATE_FILE)) return null;
  return (JSON.parse(readFileSync(STATE_FILE, "utf8")) as { lastSync: SyncRun | null }).lastSync;
}

function writeState(): void {
  mkdirSync(SYNC_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify({ lastSync }));
}
