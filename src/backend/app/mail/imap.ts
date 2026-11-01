import { ImapFlow } from "imapflow";
import { type ParsedMail, simpleParser } from "mailparser";
import { type MailAccount } from "./accounts.js";
import { type MailHeader, headerOf } from "./messages.js";
import { inSession, newConnection } from "./sessions.js";

// How many of the newest messages the card lists.
export const LIST_LIMIT = 25;

// Signs in to an account that is not saved yet, counts its mailbox, and signs out. Used when an account is added, so a wrong password is
// refused before anything is kept. A saved account reads on its open connection instead.
export async function signInOnce(account: MailAccount): Promise<{ messages: number; unseen: number }> {
  const client = newConnection(account);
  try {
    await client.connect();
    return await countMailbox(client, account.mailbox);
  } finally {
    await logoutQuietly(client);
  }
}

// Counts a saved account's mailbox, on its open connection. Used by the account's test button.
export function checkAccount(account: MailAccount): Promise<{ messages: number; unseen: number }> {
  return inSession(account, (client) => countMailbox(client, account.mailbox));
}

// The newest messages of the account's mailbox, newest first. Read-only, so the server keeps every message's read state.
export function recentHeaders(account: MailAccount, limit = LIST_LIMIT): Promise<MailHeader[]> {
  return inSession(account, async (client) => {
    const lock = await client.getMailboxLock(account.mailbox, { readOnly: true });
    try {
      const exists = client.mailbox ? client.mailbox.exists : 0;
      if (exists === 0) return [];
      const headers: MailHeader[] = [];
      for await (const message of client.fetch(`${Math.max(1, exists - limit + 1)}:*`, { uid: true, flags: true, envelope: true })) {
        headers.push(headerOf(message));
      }
      return headers.reverse();
    } finally {
      lock.release();
    }
  });
}

// One message by its UID, parsed. The body is fetched with BODY.PEEK, so reading it does not mark it as read. Returns nothing when the
// mailbox has no message with that UID.
export function fetchMessage(account: MailAccount, uid: number): Promise<{ header: MailHeader; parsed: ParsedMail } | undefined> {
  return inSession(account, async (client) => {
    const lock = await client.getMailboxLock(account.mailbox, { readOnly: true });
    try {
      const message = await client.fetchOne(String(uid), { uid: true, flags: true, envelope: true, source: true }, { uid: true });
      if (!message || !message.source) return undefined;
      return { header: headerOf(message), parsed: await simpleParser(message.source) };
    } finally {
      lock.release();
    }
  });
}

// Counts the mailbox's messages and unread ones on an open connection.
async function countMailbox(client: ImapFlow, mailbox: string): Promise<{ messages: number; unseen: number }> {
  const status = await client.status(mailbox, { messages: true, unseen: true });
  if (!status) throw new Error(`there is no mailbox called ${mailbox}`);
  return { messages: status.messages ?? 0, unseen: status.unseen ?? 0 };
}

// Signs out. A connection the server already dropped is closed instead, so the caller never waits on a dead socket.
async function logoutQuietly(client: ImapFlow): Promise<void> {
  try {
    await client.logout();
  } catch {
    client.close();
  }
}
