import { ImapFlow } from "imapflow";
import { type ParsedMail, simpleParser } from "mailparser";
import { type MailAccount } from "./accounts.js";
import { type MailHeader, headerOf } from "./messages.js";

// How many of the newest messages the card lists.
export const LIST_LIMIT = 25;

// The IMAP client for one account. Each read signs in, does its work, and signs out, so nothing stays connected between reads. Automatic
// IDLE is off, since an IDLE connection would outlive the read. The password is sent only to the account's own server.
function clientFor(account: MailAccount): ImapFlow {
  return new ImapFlow({
    host: account.host,
    port: account.port,
    secure: account.secure,
    auth: { user: account.user, pass: account.password },
    logger: false,
    disableAutoIdle: true,
  });
}

// Signs out. A session the server already dropped is closed instead, so the caller never waits on a dead socket.
async function endSession(client: ImapFlow): Promise<void> {
  try {
    await client.logout();
  } catch {
    client.close();
  }
}

// Signs in and counts the mailbox's messages and unread ones. Used to check an account before it is saved, and by its test button.
export async function checkAccount(account: MailAccount): Promise<{ messages: number; unseen: number }> {
  const client = clientFor(account);
  try {
    await client.connect();
    const status = await client.status(account.mailbox, { messages: true, unseen: true });
    if (!status) throw new Error(`there is no mailbox called ${account.mailbox}`);
    return { messages: status.messages ?? 0, unseen: status.unseen ?? 0 };
  } finally {
    await endSession(client);
  }
}

// The newest messages of the account's mailbox, newest first. Read-only, so the server keeps every message's read state.
export async function recentHeaders(account: MailAccount, limit = LIST_LIMIT): Promise<MailHeader[]> {
  const client = clientFor(account);
  try {
    await client.connect();
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
  } finally {
    await endSession(client);
  }
}

// One message by its UID, parsed. The body is fetched with BODY.PEEK, so reading it does not mark it as read. Returns nothing when the
// mailbox has no message with that UID.
export async function fetchMessage(account: MailAccount, uid: number): Promise<{ header: MailHeader; parsed: ParsedMail } | undefined> {
  const client = clientFor(account);
  try {
    await client.connect();
    const lock = await client.getMailboxLock(account.mailbox, { readOnly: true });
    try {
      const message = await client.fetchOne(String(uid), { uid: true, flags: true, envelope: true, source: true }, { uid: true });
      if (!message || !message.source) return undefined;
      return { header: headerOf(message), parsed: await simpleParser(message.source) };
    } finally {
      lock.release();
    }
  } finally {
    await endSession(client);
  }
}
