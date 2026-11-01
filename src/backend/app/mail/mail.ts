import { AppError, errorMessage } from "../errors.js";
import {
  MAIL_PRESETS,
  type MailAccount,
  type MailAccountView,
  type MailAccountProblem,
  type MailPreset,
  idFor,
  readMailAccounts,
  removeMailAccount,
  saveMailAccount,
  viewOf,
} from "./accounts.js";
import { checkAccount, fetchMessage, recentHeaders, signInOnce } from "./imap.js";
import { type MailHeader, type MailMessage, messageOf } from "./messages.js";
import { closeMailSession } from "./sessions.js";

// The mail accounts as the card and the API use them: adding, removing, testing, and reading. A saved account keeps one connection to its
// server between reads, opened when it is first needed. A failure to reach the server is a 502 that says why.

const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface MailAccountsReply {
  accounts: MailAccountView[];
  presets: MailPreset[];
  problems: MailAccountProblem[];
}

// The accounts, the providers the add form offers, and any account that could not be read.
export function mailAccountsReply(): MailAccountsReply {
  const { accounts, problems } = readMailAccounts();
  return { accounts: accounts.map(viewOf), presets: MAIL_PRESETS, problems };
}

// Adds an account. The server is asked to sign in first, so a wrong address or password is never saved. Spaces in the password are
// dropped, since providers show app passwords in groups of four.
export async function addMailAccount(input: unknown): Promise<MailAccountView> {
  const body = asRecord(input);
  const preset = MAIL_PRESETS.find((candidate) => candidate.id === body.preset);
  if (!preset) throw new AppError(400, `The provider must be one of ${MAIL_PRESETS.map((candidate) => candidate.id).join(", ")}.`);
  const address = String(body.address ?? "").trim().toLowerCase();
  if (!ADDRESS.test(address)) throw new AppError(400, "Enter the email address.");
  const password = String(body.password ?? "").replace(/\s+/g, "");
  if (!password) throw new AppError(400, "Enter the app password.");

  const custom = preset.id === "other";
  const host = custom ? String(body.host ?? "").trim() : preset.host;
  if (!host) throw new AppError(400, "Enter the IMAP server.");
  const port = custom ? Number(body.port ?? preset.port) : preset.port;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new AppError(400, "The port must be a number from 1 to 65535.");
  const secure = custom ? body.secure !== false : preset.secure;

  const { accounts } = readMailAccounts();
  if (accounts.some((account) => account.user === address && account.host.toLowerCase() === host.toLowerCase())) {
    throw new AppError(409, `${address} is already added.`);
  }
  const account: MailAccount = {
    id: idFor(address, new Set(accounts.map((candidate) => candidate.id))),
    label: address,
    host,
    port,
    secure,
    user: address,
    password,
    mailbox: "INBOX",
    watch: { mode: "auto", pollSeconds: 60 },
    maxBytes: 20_000,
  };
  try {
    await signInOnce(account);
  } catch (err) {
    throw new AppError(400, `Could not sign in to ${host}: ${reasonOf(err)}`);
  }
  saveMailAccount(account);
  return viewOf(account);
}

// Removes an account from mail.json, and closes its connection. Nothing is sent to the server.
export async function deleteMailAccount(id: string): Promise<MailAccountsReply> {
  removeMailAccount(id);
  await closeMailSession(id);
  return mailAccountsReply();
}

// Signs in to an account and counts its mailbox. A failure is a 502 with the reason.
export async function testMailAccount(id: string): Promise<{ messages: number; unseen: number }> {
  const account = findAccount(id);
  return reading(account, () => checkAccount(account));
}

// The newest messages in an account's mailbox, newest first.
export async function listMailMessages(id: string): Promise<{ mailbox: string; messages: MailHeader[] }> {
  const account = findAccount(id);
  const messages = await reading(account, () => recentHeaders(account));
  return { mailbox: account.mailbox, messages };
}

// One message, with its text cut to the account's limit. A UID the mailbox does not have is a 404.
export async function openMailMessage(id: string, uidText: string): Promise<MailMessage> {
  const account = findAccount(id);
  const uid = Number(uidText);
  if (!Number.isInteger(uid) || uid < 1) throw new AppError(400, "The message id must be a positive whole number.");
  const found = await reading(account, () => fetchMessage(account, uid));
  if (!found) throw new AppError(404, `No message ${uid} in ${account.label}.`);
  return messageOf(found.header, found.parsed, account.maxBytes);
}

function findAccount(id: string): MailAccount {
  const account = readMailAccounts().accounts.find((candidate) => candidate.id === id);
  if (!account) throw new AppError(404, `No mail account called "${id}".`);
  return account;
}

// Runs one read against an account's server. A failure is reported with the account's label, never with its password.
async function reading<T>(account: MailAccount, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(502, `Could not read ${account.label}: ${reasonOf(err)}`);
  }
}

// The server's own reason when it gave one, such as "Invalid credentials". Otherwise the error's message.
export function reasonOf(err: unknown): string {
  const response = (err as { responseText?: unknown } | null)?.responseText;
  return typeof response === "string" && response ? response : errorMessage(err);
}

function asRecord(input: unknown): Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}
