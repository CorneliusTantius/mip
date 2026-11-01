import { createHash } from "node:crypto";
import { ImapFlow } from "imapflow";
import type { MailAccount } from "./accounts.js";

// One IMAP connection per account, kept between reads. A read signs in only when the account has no open connection, so the card's poll
// costs a mailbox check, not a new sign-in. Reads on one account run one at a time, since they share its connection. A connection that is
// unused for idleCloseMs is closed. A connection the server dropped is replaced, and a read that failed on it runs once more on a new one.

// Gmail closes an idle IMAP connection after about 15 minutes, so a connection that is not used for five minutes is closed first.
export const DEFAULT_IDLE_CLOSE_MS = 5 * 60 * 1000;
let idleCloseMs = DEFAULT_IDLE_CLOSE_MS;

interface Session {
  id: string;
  // A hash of the account's settings. A connection made with other settings is not reused.
  fingerprint: string;
  client: ImapFlow | undefined;
  // The reads, one after another. Each starts when the one before it has finished.
  queue: Promise<unknown>;
  timer: NodeJS.Timeout | undefined;
  // Set when the connection is closed for good. A read that was waiting then starts a new session.
  ended: boolean;
}

const sessions = new Map<string, Session>();

// A new IMAP client for an account, with its error listener set. A dropped connection reports an error, and without a listener that would
// stop the process. The password is sent only to the account's own server.
export function newConnection(account: MailAccount): ImapFlow {
  const client = new ImapFlow({
    host: account.host,
    port: account.port,
    secure: account.secure,
    auth: { user: account.user, pass: account.password },
    logger: false,
    disableAutoIdle: true,
  });
  client.on("error", () => {});
  return client;
}

// Runs one read on the account's connection, and returns what the read returns. The connection is opened for the first read, and a read
// that finds it closed opens a new one.
export function inSession<T>(account: MailAccount, work: (client: ImapFlow) => Promise<T>): Promise<T> {
  const session = sessionFor(account);
  const run = session.queue.then(() => {
    if (session.ended) return inSession(account, work);
    return attempt(session, account, work);
  });
  session.queue = run.catch(() => undefined);
  return run.finally(() => armIdle(session));
}

// Closes an account's connection once its reads have finished, for example when the account is removed.
export async function closeMailSession(id: string): Promise<void> {
  const session = sessions.get(id);
  if (!session) return;
  await session.queue;
  endSession(session);
}

// Closes every connection. Used when the tests finish, since an open connection keeps the process running.
export async function closeAllMailSessions(): Promise<void> {
  for (const session of [...sessions.values()]) {
    await session.queue;
    endSession(session);
  }
}

// How many accounts have a session open, for the tests.
export function sessionCount(): number {
  return sessions.size;
}

// Sets how long an unused connection is kept, for the tests.
export function setIdleCloseMs(ms: number): void {
  idleCloseMs = ms;
}

// The session of an account. A session made with other settings is closed, and a new one takes its place.
function sessionFor(account: MailAccount): Session {
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([account.host, account.port, account.secure, account.user, account.password]))
    .digest("hex");
  const existing = sessions.get(account.id);
  if (existing && existing.fingerprint === fingerprint) return existing;
  if (existing) endSession(existing);
  const session: Session = { id: account.id, fingerprint, client: undefined, queue: Promise.resolve(), timer: undefined, ended: false };
  sessions.set(account.id, session);
  return session;
}

// Runs the read on the open connection, or on a new one when there is none. A read that fails on a connection that was already open may
// have failed because the server dropped it, so it runs once more on a new connection. A read that fails on a new connection is a real
// failure, and it is thrown.
async function attempt<T>(session: Session, account: MailAccount, work: (client: ImapFlow) => Promise<T>): Promise<T> {
  const open = session.client;
  if (open === undefined || !open.usable) return work(await connectTo(session, account));
  try {
    return await work(open);
  } catch {
    dropClient(session);
    return work(await connectTo(session, account));
  }
}

// Opens a connection for the session, replacing any closed one. A connection the server closes later is forgotten, so the next read opens a
// new one.
async function connectTo(session: Session, account: MailAccount): Promise<ImapFlow> {
  dropClient(session);
  const client = newConnection(account);
  client.on("close", () => {
    if (session.client === client) session.client = undefined;
  });
  try {
    await client.connect();
  } catch (err) {
    client.close();
    throw err;
  }
  session.client = client;
  return client;
}

// Closes the session's connection at once, for a connection that failed.
function dropClient(session: Session): void {
  const client = session.client;
  session.client = undefined;
  try {
    client?.close();
  } catch {
    // The connection was already closed.
  }
}

// Starts the idle timer after a read. Reads that are queued before it fires finish first, so no read is cut off.
function armIdle(session: Session): void {
  if (session.ended) return;
  clearTimeout(session.timer);
  session.timer = setTimeout(() => {
    void session.queue.then(() => endSession(session));
  }, idleCloseMs);
  session.timer.unref();
}

// Signs out of the connection, and forgets the session. A session already replaced is left in place.
function endSession(session: Session): void {
  if (session.ended) return;
  session.ended = true;
  clearTimeout(session.timer);
  const client = session.client;
  session.client = undefined;
  if (client) {
    client.logout().catch(() => client.close());
  }
  if (sessions.get(session.id) === session) sessions.delete(session.id);
}
