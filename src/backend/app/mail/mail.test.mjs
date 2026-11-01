// Checks the mail accounts against a fake IMAP server: adding one signs in first, a wrong password is refused and saves nothing, the newest
// messages come first, reading a message does not mark it read, a server that cannot be reached is a 502 that never shows the password,
// and removing takes an account out. Run after a build: node src/backend/app/mail/mail.test.mjs
// It sets MIP_HOME to a temporary folder before the modules load, so no real config is touched.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeImap } from "./fake-imap.test-support.mjs";

const DIST = pathToFileURL(fileURLToPath(new URL("../../../../dist/backend/", import.meta.url))).href;
const root = mkdtempSync(join(tmpdir(), "mip-mail-"));
process.env.MIP_HOME = join(root, "mip-home");

const fake = await startFakeImap({
  user: "ann@example.test",
  password: "apppw",
  messages: [
    { uid: 11, from: "Ann <ann@example.test>", to: "me@example.test", subject: "Older", date: "Mon, 1 Jun 2026 10:00:00 +0000", body: "Older body" },
    { uid: 12, from: "bob@example.test", to: "me@example.test", subject: "Newer", date: "Tue, 2 Jun 2026 10:00:00 +0000", body: "Newer body" },
  ],
});

try {
  const paths = await import(`${DIST}storage/paths.js`);
  const mail = await import(`${DIST}app/mail/mail.js`);
  const accounts = await import(`${DIST}app/mail/accounts.js`);
  const { AppError } = await import(`${DIST}app/errors.js`);
  paths.ensureMipDirs();
  const local = { preset: "other", host: "127.0.0.1", port: fake.port, secure: false };

  // 1. A wrong password is refused with the server's reason, and nothing is saved.
  await assert.rejects(
    mail.addMailAccount({ ...local, address: "ann@example.test", password: "nope" }),
    (err) => err instanceof AppError && err.status === 400 && /Could not sign in to 127\.0\.0\.1: Invalid credentials/.test(err.message),
  );
  assert.equal(mail.mailAccountsReply().accounts.length, 0, "a refused account is not saved");

  // 2. The right password signs in and saves the account. Spaces in the password are dropped. The file is readable only by this user,
  // and the reply has no password.
  const added = await mail.addMailAccount({ ...local, address: "Ann@Example.test", password: "app pw" });
  assert.equal(added.id, "ann-example-test");
  assert.equal(added.user, "ann@example.test");
  assert.equal("password" in added, false);
  assert.equal((statSync(paths.MAIL_CONFIG_FILE).mode & 0o777).toString(8), "600");
  assert.match(readFileSync(paths.MAIL_CONFIG_FILE, "utf8"), /"password": "apppw"/, "the password is kept in mail.json");

  // 3. The same address on the same server is refused.
  await assert.rejects(mail.addMailAccount({ ...local, address: "ann@example.test", password: "apppw" }), (err) => err.status === 409);

  // 4. A test counts the mailbox.
  assert.deepEqual(await mail.testMailAccount(added.id), { messages: 2, unseen: 2 });

  // 5. The newest messages come first, with their senders and read state.
  const listed = await mail.listMailMessages(added.id);
  assert.equal(listed.mailbox, "INBOX");
  assert.deepEqual(listed.messages.map((message) => [message.uid, message.subject, message.seen]), [
    [12, "Newer", false],
    [11, "Older", false],
  ]);
  assert.equal(listed.messages[0].from, "bob@example.test");

  // 6. Opening a message returns its text, and does not mark it read.
  const opened = await mail.openMailMessage(added.id, "12");
  assert.equal(opened.text.trim(), "Newer body");
  assert.equal(opened.to, "me@example.test");
  assert.equal(opened.truncated, false);
  assert.deepEqual(fake.flagsOf(12), [], "opening does not mark the message read");
  assert.ok(fake.fetches.length > 0 && fake.fetches.every((fetch) => fetch.peek), "every body fetch peeks");

  // 7. A message the mailbox does not have is a 404, and a bad id is a 400.
  await assert.rejects(mail.openMailMessage(added.id, "99"), (err) => err.status === 404);
  await assert.rejects(mail.openMailMessage(added.id, "x"), (err) => err.status === 400);

  // 8. An account that is not listed is a 404.
  await assert.rejects(mail.listMailMessages("nobody"), (err) => err.status === 404);

  // 9. A server that cannot be reached is a 502 that names the account, and the password is never in the message.
  accounts.saveMailAccount({
    id: "dead",
    label: "dead@example.test",
    host: "127.0.0.1",
    port: 1,
    secure: false,
    user: "dead@example.test",
    password: "secret-pw",
    mailbox: "INBOX",
    watch: { mode: "auto", pollSeconds: 60 },
    maxBytes: 20000,
  });
  await assert.rejects(
    mail.listMailMessages("dead"),
    (err) => err instanceof AppError && err.status === 502 && /Could not read dead@example\.test/.test(err.message) && !err.message.includes("secret-pw"),
  );

  // 10. Removing an account takes it out and keeps the others. Removing it again is a 404.
  const remaining = mail.deleteMailAccount("dead");
  assert.deepEqual(remaining.accounts.map((account) => account.id), ["ann-example-test"]);
  assert.throws(() => mail.deleteMailAccount("dead"), (err) => err.status === 404);

  console.log("mail account tests passed");
} finally {
  await fake.stop();
  rmSync(root, { recursive: true, force: true });
}
