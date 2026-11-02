// Checks the mail accounts file: which entries load, their defaults and limits, the ids, that a save keeps what the app does not load, that a
// password never leaves the file, and that the file is readable only by this user. Run after a build: node src/backend/app/mail/accounts.test.mjs
// It sets MIP_HOME to a temporary folder before the modules load, so no real config is touched.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIST = pathToFileURL(fileURLToPath(new URL("../../../../dist/backend/", import.meta.url))).href;
const root = mkdtempSync(join(tmpdir(), "mip-mail-accounts-"));
process.env.MIP_HOME = join(root, "mip-home");

try {
  const paths = await import(`${DIST}storage/paths.js`);
  const accounts = await import(`${DIST}app/mail/accounts.js`);
  const { AppError } = await import(`${DIST}app/errors.js`);
  paths.ensureMipDirs();
  const readFile = () => JSON.parse(readFileSync(paths.MAIL_CONFIG_FILE, "utf8"));

  // 1. Valid entries load with their defaults. A bad entry is reported by name, and the others still load.
  const parsed = accounts.parseMailAccounts(
    JSON.stringify({
      accounts: {
        work: { host: "imap.example.test", user: "ann@example.test", password: "pw" },
        home: {
          host: "imap.home.test",
          port: 1143,
          secure: false,
          user: "ann@home.test",
          password: "pw2",
          mailbox: "Archive",
          label: "Home",
          watch: { pollSeconds: 5, mode: "interval" },
          maxBytes: 5000,
        },
        "bad id!": { host: "x", user: "x", password: "x" },
        nohost: { user: "x", password: "x" },
        badport: { host: "x", user: "x", password: "x", port: 70000 },
        badmode: { host: "x", user: "x", password: "x", watch: { mode: "poll" } },
        badsecure: { host: "x", user: "x", password: "x", secure: "yes" },
      },
    }),
  );
  assert.deepEqual(parsed.accounts.map((account) => account.id), ["work", "home"]);
  assert.deepEqual(parsed.accounts[0], {
    id: "work",
    label: "ann@example.test",
    host: "imap.example.test",
    port: 993,
    secure: true,
    user: "ann@example.test",
    password: "pw",
    mailbox: "INBOX",
    watch: { mode: "auto", pollSeconds: 60 },
    maxBytes: 20000,
  });
  assert.equal(parsed.accounts[1].watch.pollSeconds, 15, "a poll below 15 seconds is raised to 15");
  assert.equal(parsed.accounts[1].secure, false);
  assert.deepEqual(parsed.problems.map((problem) => problem.account), ["bad id!", "nohost", "badport", "badmode", "badsecure"]);
  assert.match(parsed.problems[0].error, /must start with a letter or digit/);
  assert.match(parsed.problems[1].error, /"host" must be text/);
  assert.match(parsed.problems[2].error, /"port" must be a whole number from 1 to 65535/);
  assert.match(parsed.problems[3].error, /"watch.mode"/);
  assert.match(parsed.problems[4].error, /"secure" must be true or false/);
  assert.match(accounts.parseMailAccounts("{not json").problems[0].error, /not valid JSON/);
  assert.match(accounts.parseMailAccounts("[]").problems[0].error, /"accounts" map/);
  assert.deepEqual(accounts.MAIL_PRESETS.map((preset) => preset.id), ["gmail", "icloud", "fastmail", "outlook", "other"]);

  // 2. Ids come from the address, read easily, and never repeat.
  assert.equal(accounts.idFor("Ann.Lee@Example.test", new Set()), "ann-lee-example-test");
  assert.equal(accounts.idFor("ann@example.test", new Set(["ann-example-test"])), "ann-example-test-2");
  assert.equal(accounts.idFor("@@", new Set()), "mail");
  assert.ok(accounts.idFor(`${"a".repeat(60)}@example.test`, new Set()).length <= 32);

  // 3. A save writes mail.json readable only by this user, and keeps an entry the app does not load and fields it does not own.
  writeFileSync(paths.MAIL_CONFIG_FILE, JSON.stringify({ accounts: { broken: { host: 5 } }, note: "kept" }));
  assert.deepEqual(accounts.readMailAccounts().problems.map((problem) => problem.account), ["broken"]);
  const added = { ...parsed.accounts[0], id: "added", password: "pw3" };
  accounts.saveMailAccount(added);
  const file = readFile();
  assert.ok(file.accounts.broken, "an entry the app does not load is kept");
  assert.equal(file.note, "kept", "fields the app does not own are kept");
  assert.equal(file.accounts.added.password, "pw3");
  assert.equal((statSync(paths.MAIL_CONFIG_FILE).mode & 0o777).toString(8), "600", "mail.json is readable only by this user");
  assert.throws(() => accounts.saveMailAccount(added), (err) => err instanceof AppError && err.status === 409);

  // 4. A view never carries the password.
  const view = accounts.viewOf(added);
  assert.equal("password" in view, false);
  assert.equal(view.id, "added");

  // 5. A removal takes out one account, keeps the rest, and refuses an account that is not there.
  accounts.removeMailAccount("added");
  assert.equal(readFile().accounts.added, undefined);
  assert.ok(readFile().accounts.broken, "a removal keeps the entry the app does not load");
  assert.throws(() => accounts.removeMailAccount("added"), (err) => err instanceof AppError && err.status === 404);

  // 6. A sync replaces the accounts with the synced list and keeps the other fields. An account that would not load leaves the file as it was.
  const synced = [{ ...parsed.accounts[1], id: "synced", password: "pw4" }];
  accounts.writeMailAccounts(synced);
  assert.deepEqual(Object.keys(readFile().accounts), ["synced"]);
  assert.equal(readFile().accounts.synced.password, "pw4", "the synced password is written");
  assert.equal(readFile().note, "kept", "fields the app does not own are kept on a sync");
  assert.equal((statSync(paths.MAIL_CONFIG_FILE).mode & 0o777).toString(8), "600");
  assert.throws(() => accounts.writeMailAccounts([{ ...synced[0], host: "" }]), (err) => err instanceof AppError && err.status === 409);
  assert.deepEqual(Object.keys(readFile().accounts), ["synced"], "a refused sync changes nothing");

  console.log("mail account file tests passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}
