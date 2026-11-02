import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { SLACK_CONFIG_FILE } from "../../storage/paths.js";
import { AppError, errorMessage } from "../errors.js";

// The Slack connection, kept in MIP_HOME/data/slack.json: the Slack app's client ID and secret, and one account for each connected user.
// An account holds that user's token, which acts as the user, so the file is readable only by this user. Sync carries it to the private
// dotmip repo, as it does mail.json. A file with a problem stops the sync, so an account is not deleted there by mistake.

export interface SlackApp {
  clientId: string;
  clientSecret: string;
}

export interface SlackAccount {
  // The workspace and the user, as "<team id>.<user id>". The same user in two workspaces is two accounts.
  id: string;
  teamId: string;
  teamName: string;
  userId: string;
  userName: string;
  // A user token (xoxp-). It is never returned by the API.
  token: string;
}

export type SlackAccountView = Omit<SlackAccount, "token">;

export interface SlackConfigProblem {
  account: string;
  error: string;
}

export interface SlackConfig {
  app?: SlackApp;
  accounts: SlackAccount[];
  problems: SlackConfigProblem[];
}

// Reads a slack.json text. A part that does not load is reported by name, and the rest still loads.
export function parseSlackConfig(text: string): SlackConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { accounts: [], problems: [{ account: "slack.json", error: `not valid JSON: ${errorMessage(err)}` }] };
  }
  if (!isRecord(parsed)) return { accounts: [], problems: [{ account: "slack.json", error: "expected an object" }] };

  const config: SlackConfig = { accounts: [], problems: [] };
  if (parsed.app !== undefined) {
    try {
      config.app = parseApp(parsed.app);
    } catch (err) {
      config.problems.push({ account: "app", error: errorMessage(err) });
    }
  }
  if (parsed.accounts !== undefined && !isRecord(parsed.accounts)) {
    config.problems.push({ account: "slack.json", error: '"accounts" must be an object' });
    return config;
  }
  for (const [id, entry] of Object.entries(isRecord(parsed.accounts) ? parsed.accounts : {})) {
    try {
      config.accounts.push(parseAccount(id, entry));
    } catch (err) {
      config.problems.push({ account: id, error: errorMessage(err) });
    }
  }
  return config;
}

// The Slack connection in slack.json. A missing file means nothing is connected.
export function readSlackConfig(): SlackConfig {
  if (!existsSync(SLACK_CONFIG_FILE)) return { accounts: [], problems: [] };
  return parseSlackConfig(readFileSync(SLACK_CONFIG_FILE, "utf8"));
}

export function viewOf(account: SlackAccount): SlackAccountView {
  const { token: _token, ...view } = account;
  return view;
}

// Saves the app's client ID and secret. The accounts and the other fields of the file are kept.
export function saveSlackApp(app: SlackApp): void {
  editSlackFile((file) => {
    file.app = { clientId: app.clientId, clientSecret: app.clientSecret };
  });
}

// Adds an account, or replaces the one with its id.
export function saveSlackAccount(account: SlackAccount): void {
  editSlackFile((file) => {
    const accounts = accountsOf(file);
    accounts[account.id] = entryOf(account);
    file.accounts = accounts;
  });
}

// Removes an account. An id that is not connected is refused.
export function removeSlackAccount(id: string): void {
  editSlackFile((file) => {
    const accounts = accountsOf(file);
    if (!Object.prototype.hasOwnProperty.call(accounts, id)) throw new AppError(404, "No Slack account with that id.");
    delete accounts[id];
    file.accounts = accounts;
  });
}

// Replaces the app and the accounts with the synced ones. The new state is checked first, so one that would not load leaves the file as it was.
export function writeSlackState(app: SlackApp | undefined, accounts: SlackAccount[]): void {
  const entries = Object.fromEntries(accounts.map((account) => [account.id, entryOf(account)]));
  const { problems } = parseSlackConfig(JSON.stringify({ app, accounts: entries }));
  if (problems.length > 0) {
    const first = problems[0];
    throw new AppError(409, `a synced Slack ${first.account === "app" ? "app" : "account"} cannot be used: "${first.account}": ${first.error}. Nothing was changed.`);
  }
  editSlackFile((file) => {
    if (app) file.app = { clientId: app.clientId, clientSecret: app.clientSecret };
    else delete file.app;
    file.accounts = entries;
  });
}

function parseApp(value: unknown): SlackApp {
  if (!isRecord(value)) throw new Error("the app must be an object");
  return { clientId: text(value.clientId, "clientId"), clientSecret: text(value.clientSecret, "clientSecret") };
}

function parseAccount(id: string, entry: unknown): SlackAccount {
  if (!isRecord(entry)) throw new Error("the entry must be an object");
  const token = text(entry.token, "token");
  if (!token.startsWith("xoxp-")) throw new Error('"token" must be a Slack user token, which starts with xoxp-');
  return {
    id,
    teamId: text(entry.teamId, "teamId"),
    teamName: text(entry.teamName, "teamName"),
    userId: text(entry.userId, "userId"),
    userName: text(entry.userName, "userName"),
    token,
  };
}

function entryOf(account: SlackAccount): Record<string, unknown> {
  return {
    teamId: account.teamId,
    teamName: account.teamName,
    userId: account.userId,
    userName: account.userName,
    token: account.token,
  };
}

function accountsOf(file: Record<string, unknown>): Record<string, unknown> {
  return isRecord(file.accounts) ? { ...file.accounts } : {};
}

// Changes slack.json. Every field the app does not own is kept, and the file is written readable only by this user.
function editSlackFile(change: (file: Record<string, unknown>) => void): void {
  const file = existsSync(SLACK_CONFIG_FILE) ? parseFile(readFileSync(SLACK_CONFIG_FILE, "utf8")) : {};
  change(file);
  writeFileSync(SLACK_CONFIG_FILE, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
  chmodSync(SLACK_CONFIG_FILE, 0o600);
}

function parseFile(textOfFile: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(textOfFile);
    if (isRecord(parsed)) return parsed;
  } catch {
    // Reported below, with the same message for a file that is not an object.
  }
  throw new AppError(409, "slack.json is not valid JSON. Fix it, then try again.");
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`"${field}" must be text`);
  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
