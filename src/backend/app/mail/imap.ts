import { ImapFlow } from "imapflow";
import { type ParsedMail, simpleParser } from "mailparser";
import { type MailAccount } from "./accounts.js";
import { type CachedMailbox } from "./cache.js";
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

// The cached headers of the account's mailbox, brought up to date with the server. It returns at least count of the newest messages, or all
// of them when there are fewer. A sync reads only what changed: the UIDs the cache lacks (new mail, or older mail when the list is short),
// the read state of the cached messages, and the messages the server removed. Bodies are not read. Read-only, so nothing is marked read.
export function syncMailbox(account: MailAccount, cached: CachedMailbox | undefined, count: number): Promise<CachedMailbox> {
  return inSession(account, async (client) => {
    const lock = await client.getMailboxLock(account.mailbox, { readOnly: true });
    try {
      const uidValidity = Number(client.mailbox ? client.mailbox.uidValidity : 0);
      // A new UIDVALIDITY means the server renumbered the mailbox, so nothing cached can be trusted.
      let messages = cached && cached.uidValidity === uidValidity ? cached.messages : [];
      const uids = ((await client.search({ all: true }, { uid: true })) || []).sort((a, b) => a - b);
      const present = new Set(uids);
      messages = messages.filter((message) => present.has(message.uid));

      // New mail: every UID above the newest cached one. An empty cache starts with the newest count.
      const newest = messages[0]?.uid ?? 0;
      const fresh = messages.length ? uids.filter((uid) => uid > newest) : uids.slice(-count);
      messages = [...(await headersOf(client, fresh)), ...messages];

      // Older mail, only while the list is shorter than count.
      while (messages.length < count) {
        const oldest = messages[messages.length - 1]?.uid ?? Infinity;
        const older = uids.filter((uid) => uid < oldest).slice(-(count - messages.length));
        if (older.length === 0) break;
        messages = [...messages, ...(await headersOf(client, older))];
      }

      // The read state can change on the server, so the cached messages' flags are read again.
      const seen = await seenFlags(client, messages.map((message) => message.uid));
      messages = messages.map((message) => ({ ...message, seen: seen.get(message.uid) ?? message.seen }));
      return { uidValidity, messages };
    } finally {
      lock.release();
    }
  });
}

// The headers of these UIDs, newest first.
async function headersOf(client: ImapFlow, uids: number[]): Promise<MailHeader[]> {
  if (uids.length === 0) return [];
  const headers: MailHeader[] = [];
  for await (const message of client.fetch(uids.join(","), { uid: true, flags: true, envelope: true }, { uid: true })) {
    headers.push(headerOf(message));
  }
  return headers.sort((a, b) => b.uid - a.uid);
}

// Whether each of these UIDs is read, by UID.
async function seenFlags(client: ImapFlow, uids: number[]): Promise<Map<number, boolean>> {
  const seen = new Map<number, boolean>();
  if (uids.length === 0) return seen;
  for await (const message of client.fetch(uids.join(","), { uid: true, flags: true }, { uid: true })) {
    seen.set(message.uid, message.flags?.has("\\Seen") === true);
  }
  return seen;
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
