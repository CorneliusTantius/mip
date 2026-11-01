import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { MAIL_CONFIG_FILE } from "../../storage/paths.js";
import { AppError, errorMessage } from "../errors.js";

// The mail accounts mip reads over IMAP, kept in MIP_HOME/data/mail.json. The shape follows OpenClaw's IMAP plugin: an "accounts" map from
// an id to one account, with its server, login, mailbox, and watch settings. The file holds app passwords, so it is readable only by this
// user, and sync never carries it. An account the app cannot load is reported by name, and the app keeps it when it edits the file.

// The shortest time between two reads of a mailbox, and the default. A card re-reads its mailbox on this timer while it is open.
const MIN_POLL_SECONDS = 15;
const DEFAULT_POLL_SECONDS = 60;
// The largest message body the app returns, in bytes. A longer body is cut, and the reply says so.
const DEFAULT_MAX_BYTES = 20_000;
const DEFAULT_PORT = 993;

export type MailWatchMode = "auto" | "idle" | "interval";

export interface MailAccount {
  id: string;
  label: string;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  mailbox: string;
  watch: { mode: MailWatchMode; pollSeconds: number };
  maxBytes: number;
}

// An account as the API returns it. The password is never included.
export type MailAccountView = Omit<MailAccount, "password">;

export interface MailAccountProblem {
  account: string;
  error: string;
}

// A provider the add form offers. "other" takes the server from the form. Each help line says what the provider wants as the password.
export interface MailPreset {
  id: string;
  label: string;
  host: string;
  port: number;
  secure: boolean;
  help: string;
}

export const MAIL_PRESETS: MailPreset[] = [
  {
    id: "gmail",
    label: "Gmail",
    host: "imap.gmail.com",
    port: DEFAULT_PORT,
    secure: true,
    help: "Gmail needs 2-Step Verification before it makes an app password. Use that password here, not your Google password.",
  },
  {
    id: "icloud",
    label: "iCloud",
    host: "imap.mail.me.com",
    port: DEFAULT_PORT,
    secure: true,
    help: "Use an app-specific password from your Apple Account.",
  },
  {
    id: "fastmail",
    label: "Fastmail",
    host: "imap.fastmail.com",
    port: DEFAULT_PORT,
    secure: true,
    help: "Use an app password from Fastmail's settings.",
  },
  {
    id: "outlook",
    label: "Outlook",
    host: "outlook.office365.com",
    port: DEFAULT_PORT,
    secure: true,
    help: "Use an app password if your account asks for one.",
  },
  {
    id: "other",
    label: "Other",
    host: "",
    port: DEFAULT_PORT,
    secure: true,
    help: "Enter the IMAP server, port, and encryption that your mail provider gives you.",
  },
];

// An account id: a letter or digit, then letters, digits, dashes, or underscores, up to 32 characters. OpenClaw uses the same rule, since
// the id becomes part of URLs and file names.
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;

// Reads a mail.json text. An account that does not load is reported by name, and the others still load.
export function parseMailAccounts(text: string): { accounts: MailAccount[]; problems: MailAccountProblem[] } {
  const accounts: MailAccount[] = [];
  const problems: MailAccountProblem[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { accounts, problems: [{ account: "mail.json", error: `not valid JSON: ${errorMessage(err)}` }] };
  }
  const map = isRecord(parsed) && isRecord(parsed.accounts) ? parsed.accounts : undefined;
  if (!map) return { accounts, problems: [{ account: "mail.json", error: 'expected an object with an "accounts" map' }] };
  for (const [id, entry] of Object.entries(map)) {
    try {
      accounts.push(parseAccount(id, entry));
    } catch (err) {
      problems.push({ account: id, error: errorMessage(err) });
    }
  }
  return { accounts, problems };
}

// The accounts in mail.json. A missing file means no accounts.
export function readMailAccounts(): { accounts: MailAccount[]; problems: MailAccountProblem[] } {
  if (!existsSync(MAIL_CONFIG_FILE)) return { accounts: [], problems: [] };
  return parseMailAccounts(readFileSync(MAIL_CONFIG_FILE, "utf8"));
}

// An account as the API returns it: every field but the password.
export function viewOf(account: MailAccount): MailAccountView {
  const { password: _password, ...view } = account;
  return view;
}

// The id of a new account, from its address: the address with each run of other characters as a dash, so it reads as the address does.
// An id already taken gets a number after it.
export function idFor(address: string, taken: Set<string>): string {
  const slug = address
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28);
  const base = slug || "mail";
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

// Adds an account to mail.json. An id already listed is refused.
export function saveMailAccount(account: MailAccount): void {
  editMailFile((accounts) => {
    if (Object.prototype.hasOwnProperty.call(accounts, account.id)) {
      throw new AppError(409, `An account called "${account.id}" is already listed.`);
    }
    accounts[account.id] = entryOf(account);
  });
}

// Removes an account from mail.json. An id that is not listed is refused.
export function removeMailAccount(id: string): void {
  editMailFile((accounts) => {
    if (!Object.prototype.hasOwnProperty.call(accounts, id)) throw new AppError(404, `No mail account called "${id}".`);
    delete accounts[id];
  });
}

function parseAccount(id: string, entry: unknown): MailAccount {
  if (!ID.test(id)) throw new Error("the id must start with a letter or digit, then letters, digits, - or _, up to 32 characters");
  if (!isRecord(entry)) throw new Error("the entry must be an object");
  const user = text(entry.user, "user");
  const watch = entry.watch === undefined ? {} : entry.watch;
  if (!isRecord(watch)) throw new Error('"watch" must be an object');
  return {
    id,
    label: entry.label === undefined ? user : text(entry.label, "label"),
    host: text(entry.host, "host"),
    port: integer(entry.port, "port", DEFAULT_PORT, 1, 65535),
    secure: entry.secure === undefined ? true : bool(entry.secure, "secure"),
    user,
    password: text(entry.password, "password"),
    mailbox: entry.mailbox === undefined ? "INBOX" : text(entry.mailbox, "mailbox"),
    watch: {
      mode: watchMode(watch.mode),
      pollSeconds: Math.max(MIN_POLL_SECONDS, integer(watch.pollSeconds, "pollSeconds", DEFAULT_POLL_SECONDS, 1, 86_400)),
    },
    maxBytes: integer(entry.maxBytes, "maxBytes", DEFAULT_MAX_BYTES, 1000, 1_000_000),
  };
}

// The mail.json entry of an account, in the shape parseMailAccounts reads.
function entryOf(account: MailAccount): Record<string, unknown> {
  return {
    label: account.label,
    host: account.host,
    port: account.port,
    secure: account.secure,
    user: account.user,
    password: account.password,
    mailbox: account.mailbox,
    watch: account.watch,
    maxBytes: account.maxBytes,
  };
}

// Changes the accounts in mail.json by id. The file is read as JSON and written back with every other entry as it was, so an account the
// app does not load is kept.
function editMailFile(change: (accounts: Record<string, unknown>) => void): void {
  const file = existsSync(MAIL_CONFIG_FILE) ? parseFile(readFileSync(MAIL_CONFIG_FILE, "utf8")) : {};
  if (file.accounts !== undefined && !isRecord(file.accounts)) {
    throw new AppError(409, 'mail.json has no "accounts" map. Fix it, then try again.');
  }
  const accounts = isRecord(file.accounts) ? { ...file.accounts } : {};
  change(accounts);
  writeMailFile(`${JSON.stringify({ ...file, accounts }, null, 2)}\n`);
}

// Writes the file readable only by this user, since it holds app passwords.
function writeMailFile(text: string): void {
  writeFileSync(MAIL_CONFIG_FILE, text, { mode: 0o600 });
  chmodSync(MAIL_CONFIG_FILE, 0o600);
}

function parseFile(textOfFile: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(textOfFile);
    if (isRecord(parsed)) return parsed;
  } catch {
    // Reported below, with the same message for a file that is not an object.
  }
  throw new AppError(409, "mail.json is not valid JSON. Fix it, then try again.");
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`"${field}" must be text`);
  return value.trim();
}

function integer(value: unknown, field: string, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`"${field}" must be a whole number from ${min} to ${max}`);
  }
  return value;
}

function bool(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new Error(`"${field}" must be true or false`);
  return value;
}

function watchMode(value: unknown): MailWatchMode {
  if (value === undefined) return "auto";
  if (value === "auto" || value === "idle" || value === "interval") return value;
  throw new Error('"watch.mode" must be "auto", "idle", or "interval"');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
