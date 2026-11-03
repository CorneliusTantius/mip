// Checks sending and deleting mail against fake servers. A message goes out from the account's address through its SMTP server, with the
// account's own login, and a message that is not usable is refused before the server is asked. A server that refuses the login is a 502 that
// never shows the password. Deleting moves a message to the Trash, where it can be taken back, and is refused when the account has no Trash.
// An account with no "smtp" in mail.json sends through the SMTP server worked out from its IMAP host. Run after a build:
// node src/backend/app/mail/mail-write.test.mjs
// It sets MIP_HOME to a temporary folder before the modules load, so no real config is touched.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeImap } from "./fake-imap.test-support.mjs";
import { startFakeSmtp } from "./fake-smtp.test-support.mjs";

const DIST = pathToFileURL(fileURLToPath(new URL("../../../../dist/backend/", import.meta.url))).href;
const root = mkdtempSync(join(tmpdir(), "mip-mail-write-"));
process.env.MIP_HOME = join(root, "mip-home");

const USER = "ann@example.test";
const messages = [
  { uid: 11, from: "Ann <ann@example.test>", to: "me@example.test", subject: "Older", date: "Mon, 1 Jun 2026 10:00:00 +0000", body: "Older body" },
  { uid: 12, from: "bob@example.test", to: "me@example.test", subject: "Newer", date: "Tue, 2 Jun 2026 10:00:00 +0000", body: "Newer body" },
];
const imap = await startFakeImap({ user: USER, password: "apppw", messages });
const imapNoTrash = await startFakeImap({ user: USER, password: "apppw", messages, trash: false });
const smtp = await startFakeSmtp({ user: USER, password: "apppw" });

const paths = await import(`${DIST}storage/paths.js`);
const mail = await import(`${DIST}app/mail/mail.js`);
const accounts = await import(`${DIST}app/mail/accounts.js`);
const sessions = await import(`${DIST}app/mail/sessions.js`);
const { AppError } = await import(`${DIST}app/errors.js`);

try {
  paths.ensureMipDirs();

  // 1. The SMTP server comes from the IMAP server for a known provider, and from its imap. name for another. A mail.json entry that names
  // one keeps it, and its port defaults by encryption.
  assert.deepEqual(accounts.smtpFor("imap.gmail.com"), { host: "smtp.gmail.com", port: 465, secure: true });
  assert.deepEqual(accounts.smtpFor("imap.example.test"), { host: "smtp.example.test", port: 465, secure: true });
  const derived = accounts.parseMailAccounts(JSON.stringify({ accounts: { ann: { user: USER, host: "imap.example.test", password: "p" } } }));
  assert.deepEqual(derived.accounts[0].smtp, { host: "smtp.example.test", port: 465, secure: true });
  const named = accounts.parseMailAccounts(
    JSON.stringify({ accounts: { ann: { user: USER, host: "imap.example.test", password: "p", smtp: { host: "mail.example.test", secure: false } } } }),
  );
  assert.deepEqual(named.accounts[0].smtp, { host: "mail.example.test", port: 587, secure: false });
  assert.equal(named.problems.length, 0);

  // The test accounts reach the fake servers.
  const base = {
    label: USER,
    host: "127.0.0.1",
    port: imap.port,
    secure: false,
    user: USER,
    password: "apppw",
    mailbox: "INBOX",
    watch: { mode: "auto", pollSeconds: 60 },
    maxBytes: 20_000,
  };
  const smtpAt = { host: "127.0.0.1", port: smtp.port, secure: false };
  accounts.saveMailAccount({ ...base, id: "ann", smtp: smtpAt });

  // 2. A message goes out from the account's address, through its SMTP server with its own login. Recipients may come as a list or as text.
  // A line break in the subject is read as a space, so it cannot start a header.
  const sent = await mail.sendMailMessage("ann", {
    to: ["bob@example.test"],
    cc: "carl@example.test, ",
    subject: "Hello\r\nBcc: hidden@example.test",
    text: "Line one\n\nLine two",
  });
  assert.match(sent.messageId, /@/);
  assert.equal(smtp.sent.length, 1);
  const [mailed] = smtp.sent;
  assert.equal(mailed.from, USER);
  assert.deepEqual([...mailed.to].sort(), ["bob@example.test", "carl@example.test"]);
  assert.match(mailed.data, /^Subject: Hello Bcc: hidden@example\.test\r?$/m);
  assert.doesNotMatch(mailed.data, /^Bcc:/m);
  assert.match(mailed.data, /^Cc: carl@example\.test/m);
  assert.match(mailed.data, /Line one/);

  // 3. A message that is not usable is refused before the server is asked, so nothing is sent.
  const refused = [
    [{ to: [], subject: "Hi", text: "Body" }, /Name at least one recipient/],
    [{ to: "bob at example", subject: "Hi", text: "Body" }, /is not an email address/],
    [{ to: ["bob@example.test"], subject: "  ", text: "Body" }, /Write a subject/],
    [{ to: ["bob@example.test"], subject: "Hi", text: "" }, /Write the message/],
    [{ to: Array.from({ length: 21 }, (_, i) => `user${i}@example.test`), subject: "Hi", text: "Body" }, /addresses at most/],
  ];
  for (const [input, reason] of refused) {
    const err = await mail.sendMailMessage("ann", input).catch((caught) => caught);
    assert.ok(err instanceof AppError && err.status === 400 && reason.test(err.message), `refused: ${err?.message}`);
  }
  assert.equal(smtp.sent.length, 1, "a refused message is not sent");

  // 4. A server that refuses the login is a 502 that gives the reason, and never the password.
  accounts.saveMailAccount({ ...base, id: "wrong", label: "wrong@example.test", password: "nope-secret", smtp: smtpAt });
  const refusal = await mail.sendMailMessage("wrong", { to: ["bob@example.test"], subject: "Hi", text: "Body" }).catch((err) => err);
  assert.equal(refusal.status, 502);
  assert.match(refusal.message, /^Could not send from wrong@example\.test: /);
  assert.ok(!refusal.message.includes("nope-secret"), "the password is not shown");
  assert.equal(smtp.sent.length, 1);

  // 5. A message is moved to the Trash, where it can be taken back. It leaves the list at once.
  assert.deepEqual((await mail.listMailMessages("ann")).messages.map((m) => m.uid), [12, 11]);
  assert.deepEqual(await mail.trashMailMessage("ann", "11"), { uid: 11 });
  assert.deepEqual(imap.moved(), [{ uid: 11, to: "Trash" }]);
  assert.deepEqual(imap.uids(), [12], "the message is out of INBOX, and nothing is erased");
  assert.deepEqual((await mail.listMailMessages("ann")).messages.map((m) => m.uid), [12]);

  // 6. A UID the mailbox does not have is a 404, and nothing else is moved.
  const missing = await mail.trashMailMessage("ann", "11").catch((err) => err);
  assert.equal(missing.status, 404);
  assert.equal(imap.moved().length, 1);

  // 7. An account with no Trash folder is refused, and its message stays in INBOX.
  accounts.saveMailAccount({ ...base, id: "plain", port: imapNoTrash.port, smtp: smtpAt });
  const noTrash = await mail.trashMailMessage("plain", "12").catch((err) => err);
  assert.equal(noTrash.status, 409);
  assert.match(noTrash.message, /has no Trash folder, so nothing was deleted/);
  assert.deepEqual(imapNoTrash.uids(), [11, 12]);
  assert.deepEqual(imapNoTrash.moved(), []);

  console.log("mail write tests passed");
} finally {
  await sessions.closeAllMailSessions();
  await imap.stop();
  await imapNoTrash.stop();
  await smtp.stop();
  rmSync(root, { recursive: true, force: true });
}
