import { chmodSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { SYNC_DIR } from "../../storage/paths.js";
import { AppError } from "../errors.js";

// GitHub sign-in with the device flow, and the dotmip repo. The OAuth app's client ID is public, so no secret is kept.
// The token is kept in a file only this user can read.
export const REPO_NAME = "dotmip";
const WEB = "https://github.com";
const API = "https://api.github.com";
const CONFIG_FILE = join(SYNC_DIR, "github.json");

export interface GithubConfig {
  clientId: string | null;
  token: string | null;
  login: string | null;
}

export interface DeviceCode {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  interval: number;
  expiresIn: number;
}

export function readConfig(): GithubConfig {
  if (!existsSync(CONFIG_FILE)) return { clientId: null, token: null, login: null };
  const data = JSON.parse(readFileSync(CONFIG_FILE, "utf8")) as Partial<GithubConfig>;
  return { clientId: data.clientId ?? null, token: data.token ?? null, login: data.login ?? null };
}

// Saves the config. The file is readable by this user only, because it holds the token.
export function writeConfig(config: GithubConfig): void {
  mkdirSync(SYNC_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  chmodSync(CONFIG_FILE, 0o600);
}

// Asks GitHub for a code. The user enters the code at verificationUri to approve mip.
export async function requestDeviceCode(clientId: string): Promise<DeviceCode> {
  const data = await postForm(`${WEB}/login/device/code`, { client_id: clientId, scope: "repo" });
  if (!data.device_code) throw new AppError(502, String(data.error_description ?? "GitHub did not start the sign-in. Check the client ID."));
  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    interval: data.interval ?? 5,
    expiresIn: data.expires_in,
  };
}

// Waits until the user approves the code on GitHub, then returns the token. Follows GitHub's requests to slow down.
export async function pollForToken(clientId: string, code: DeviceCode): Promise<string> {
  let interval = code.interval;
  const deadline = Date.now() + code.expiresIn * 1000;
  while (Date.now() < deadline) {
    await sleep(interval * 1000);
    const data = await postForm(`${WEB}/login/oauth/access_token`, {
      client_id: clientId,
      device_code: code.deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    });
    if (data.access_token) return data.access_token;
    if (data.error === "authorization_pending") continue;
    if (data.error === "slow_down") {
      interval = data.interval ?? interval + 5;
      continue;
    }
    if (data.error === "access_denied") throw new Error("Sign-in was cancelled on GitHub.");
    if (data.error === "expired_token") break;
    throw new Error(String(data.error_description ?? "GitHub sign-in failed."));
  }
  throw new Error("The GitHub code expired. Connect again.");
}

export async function githubLogin(token: string): Promise<string> {
  const res = await api("GET", "/user", token);
  if (!res.ok) throw new AppError(502, await githubError(res));
  return (await res.json()).login;
}

// Makes sure the user's dotmip repo exists and is private. Creates it when it is missing. A public repo is refused, since
// the synced data is private.
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

// The URL git uses for the repo. The token is not in it. authEnv carries it, for this call only.
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

async function postForm(url: string, fields: Record<string, string>): Promise<Record<string, any>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
  });
  return res.json();
}

async function api(method: string, path: string, token: string, body?: unknown): Promise<Response> {
  return fetch(`${API}${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function githubError(res: Response): Promise<string> {
  const data = await res.json().catch(() => ({}));
  return String(data.message ?? `GitHub answered ${res.status}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
