import { execFile } from "node:child_process";
import { AppError, errorMessage } from "../errors.js";

// GitHub access for sync. The accounts are the ones the GitHub CLI (gh) is signed in to on this machine. Each sync asks gh for
// the token and never stores it, so mip has no OAuth app, no client ID, and no token file.
export const REPO_NAME = "dotmip";
const HOST = "github.com";
const WEB = `https://${HOST}`;
const API = "https://api.github.com";
// A GitHub call that runs longer than this fails, so the dashboard does not wait on a dead network.
const TIMEOUT_MS = 10_000;

export interface GhAccount {
  login: string;
  active: boolean;
}

export interface Account {
  login: string;
  token: string;
}

// Reads gh's text output for the accounts signed in to github.com. This gh version has no JSON form for `auth status`.
// A login gh could not verify is skipped, and so is its "Active account" line.
export function parseAccounts(text: string): GhAccount[] {
  const accounts: GhAccount[] = [];
  let current: GhAccount | undefined;
  for (const line of text.split("\n")) {
    const signedIn = /Logged in to github\.com account (\S+)/.exec(line);
    if (signedIn) {
      current = { login: signedIn[1], active: false };
      accounts.push(current);
    } else if (/Failed to log in to github\.com account/.test(line)) {
      current = undefined;
    } else if (current && /Active account: true/.test(line)) {
      current.active = true;
    }
  }
  return accounts;
}

// The accounts gh is signed in to, or the reason there are none. Never rejects: the dashboard shows the reason.
export function listAccounts(): Promise<{ accounts: GhAccount[]; error: string | null }> {
  return new Promise((resolve) => {
    execFile("gh", ["auth", "status", "--hostname", HOST], (err, stdout, stderr) => {
      const accounts = parseAccounts(`${stdout}\n${stderr}`);
      if (accounts.length) resolve({ accounts, error: null });
      else if ((err as NodeJS.ErrnoException | null)?.code === "ENOENT") resolve({ accounts, error: "Install the GitHub CLI (gh) to sync." });
      else resolve({ accounts, error: "Sign in with the GitHub CLI first: run `gh auth login` in a terminal." });
    });
  });
}

// The login sync uses: the one chosen in Settings while gh still has it, otherwise gh's active account.
export function pickAccount(accounts: GhAccount[], chosen: string | null): string | null {
  const found = accounts.find((account) => account.login === chosen) ?? accounts.find((account) => account.active) ?? accounts[0];
  return found?.login ?? null;
}

// The token for one account, from gh. Rejects with a message for the user when that account has no token.
export function ghToken(login: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("gh", ["auth", "token", "--hostname", HOST, "--user", login], (err, stdout) => {
      const token = stdout.trim();
      if (err || !token) reject(new AppError(409, `gh has no token for ${login}. Run \`gh auth login\` for that account.`));
      else resolve(token);
    });
  });
}

// The account's token, checked against GitHub. Throws when the token is stale or GitHub does not answer.
export async function gitHubAccount(login: string): Promise<Account> {
  const token = await ghToken(login);
  const res = await api("GET", "/user", token);
  if (!res.ok) throw new AppError(502, await githubError(res));
  return { login: (await res.json()).login, token };
}

// Makes sure the account's dotmip repo exists and is private, and creates it when it is missing. A public repo is refused,
// since the synced data is private.
export async function ensureRepo(token: string, login: string): Promise<void> {
  const res = await api("GET", `/repos/${login}/${REPO_NAME}`, token);
  if (res.ok) {
    const repo = await res.json();
    if (!repo.private) throw new AppError(409, `${REPO_NAME} on GitHub is public. Make it private, then sync again.`);
    return;
  }
  if (res.status !== 404) throw new AppError(502, await githubError(res));
  const created = await api("POST", "/user/repos", token, {
    name: REPO_NAME,
    private: true,
    auto_init: true,
    description: "Data synced from mip",
  });
  if (created.status !== 201) throw new AppError(502, await githubError(created));
}

// The URL git uses for the repo. The token is not in it. authEnv carries the token, for one git call.
export function repoUrl(login: string): string {
  return `${WEB}/${login}/${REPO_NAME}.git`;
}

// Git environment that sends the token to github.com only, as a header. The header is not written to any config file or argv.
export function authEnv(token: string): NodeJS.ProcessEnv {
  const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
  return {
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: `http.${WEB}/.extraHeader`,
    GIT_CONFIG_VALUE_0: `Authorization: basic ${basic}`,
  };
}

async function api(method: string, path: string, token: string, body?: unknown): Promise<Response> {
  try {
    return await fetch(`${API}${path}`, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new AppError(502, `Could not reach GitHub: ${errorMessage(err)}`);
  }
}

async function githubError(res: Response): Promise<string> {
  const data = await res.json().catch(() => ({}));
  return String(data.message ?? `GitHub answered ${res.status}`);
}
