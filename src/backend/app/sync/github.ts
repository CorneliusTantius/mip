import { execFile } from "node:child_process";
import { AppError, errorMessage } from "../errors.js";

// GitHub access for sync. The account is the one the GitHub CLI (gh) is signed in to on this machine. Each sync asks gh for
// the token and never stores it, so mip has no OAuth app, no client ID, and no token file.
export const REPO_NAME = "dotmip";
const WEB = "https://github.com";
const API = "https://api.github.com";
// A GitHub call that runs longer than this fails, so the dashboard does not wait on a dead network.
const TIMEOUT_MS = 10_000;

export interface Account {
  login: string;
  token: string;
}

// The token of the account gh is signed in to. Rejects with a message for the user when gh is missing or signed out.
export function ghToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("gh", ["auth", "token"], (err, stdout) => {
      const token = stdout.trim();
      if (err || !token) reject(new AppError(409, "Sign in with the GitHub CLI first: run `gh auth login` in a terminal."));
      else resolve(token);
    });
  });
}

// The signed-in account, with its token. Throws when gh is missing or signed out, or when GitHub does not answer.
export async function gitHubAccount(): Promise<Account> {
  const token = await ghToken();
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
