// Checks that the mail list keeps what it has read: a reload reads only new messages and read states, Load more reads only older ones, and a
// message the server removed leaves the list. Run after a build: node src/backend/app/mail/mail-sync.test.mjs
// It sets MIP_HOME to a temporary folder before the modules load, so no real config is touched.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeImap } from "./fake-imap.test-support.mjs";

const DIST = pathToFileURL(fileURLToPath(new URL("../../../../dist/backend/", import.meta.url))).href;
const root = mkdtempSync(join(tmpdir(), "mip-mail-sync-"));
process.env.MIP_HOME = join(root, "mip-home");

const message = (uid) => ({
  uid,
  from: "bob@example.test",
  to: "me@example.test",
  subject: `Message ${uid}`,
  date: `Tue, ${String(uid).padStart(2, "0")} Jun 2026 10:00:00 +0000`,
  body: `Body ${uid}`,
});

const fake = await startFakeImap({ user: "ann@example.test", password: "apppw", messages: [11, 12, 13, 14, 15].map(message) });

try {
  const paths = await import(`${DIST}storage/paths.js`);
  const mail = await import(`${DIST}app/mail/mail.js`);
  const cache = await import(`${DIST}app/mail/cache.js`);
  paths.ensureMipDirs();
  const uids = (reply) => reply.messages.map((m) => m.uid);
  const added = await mail.addMailAccount({ preset: "other", host: "127.0.0.1", port: fake.port, secure: false, address: "ann@example.test", password: "apppw" });
  fake.takeRanges();

  // 1. The first list reads the newest two headers, and nothing older.
  assert.deepEqual(uids(await mail.listMailMessages(added.id, 2)), [15, 14]);
  assert.deepEqual(fake.takeRanges(), ["14,15", "15,14"], "the first list reads the newest headers, then their read states");
  assert.deepEqual(cache.readMailCache()[added.id].messages.map((m) => m.uid), [15, 14], "the headers are kept");

  // 2. A reload after new mail reads only the new message, and keeps the rest.
  fake.add(message(16));
  assert.deepEqual(uids(await mail.listMailMessages(added.id, 2)), [16, 15]);
  assert.deepEqual(fake.takeRanges(), ["16", "16,15,14"], "only the new message's headers are read");
  assert.deepEqual(cache.readMailCache()[added.id].messages.map((m) => m.uid), [16, 15, 14], "older messages stay kept");

  // 3. Load more reads only the one older header that is missing.
  assert.deepEqual(uids(await mail.listMailMessages(added.id, 4)), [16, 15, 14, 13]);
  assert.deepEqual(fake.takeRanges(), ["13", "16,15,14,13"], "only the older header is read");

  // 4. A message the server removed leaves the list and the cache, and the list fills from the older messages.
  fake.remove(15);
  assert.deepEqual(uids(await mail.listMailMessages(added.id, 4)), [16, 14, 13, 12]);
  assert.ok(!cache.readMailCache()[added.id].messages.some((m) => m.uid === 15), "a removed message is dropped from the cache");

  // 5. Load more past what was kept reads the rest down to the start of the mailbox, and no further.
  assert.deepEqual(uids(await mail.listMailMessages(added.id, 10)), [16, 14, 13, 12, 11]);

  console.log("mail sync tests passed");
} finally {
  await fake.stop();
  rmSync(root, { recursive: true, force: true });
}
