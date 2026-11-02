// Checks the Slack answer cache: a value inside its time to live is not loaded again, a forced read loads again, a failed load keeps nothing, and
// forgetting drops a prefix. Run after a build: node src/backend/app/slack/cache.test.mjs
// It sets MIP_HOME to a temporary folder before the modules load, so no real cache is touched.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIST = pathToFileURL(fileURLToPath(new URL("../../../../dist/backend/", import.meta.url))).href;
const root = mkdtempSync(join(tmpdir(), "mip-slack-cache-"));
process.env.MIP_HOME = join(root, "mip-home");

try {
  const paths = await import(`${DIST}storage/paths.js`);
  const cache = await import(`${DIST}app/slack/cache.js`);
  paths.ensureMipDirs();

  let loads = 0;
  const load = async () => `value ${++loads}`;

  // 1. Inside the time to live, the stored value is returned and nothing is loaded.
  assert.equal(await cache.cached("a", 60_000, load), "value 1");
  assert.equal(await cache.cached("a", 60_000, load), "value 1");
  assert.equal(loads, 1);

  // 2. A forced read loads again and keeps the new value.
  assert.equal(await cache.cached("a", 60_000, load, true), "value 2");
  assert.equal(await cache.cached("a", 60_000, load), "value 2");

  // 3. Past the time to live, the value is loaded again.
  assert.equal(await cache.cached("b", 0, load), "value 3");
  assert.equal(await cache.cached("b", 0, load), "value 4");

  // 4. A failed load keeps nothing, so the error reaches the caller and the next read loads again.
  await assert.rejects(cache.cached("c", 60_000, async () => Promise.reject(new Error("slack down"))), /slack down/);
  assert.equal(await cache.cached("c", 60_000, load), "value 5");

  // 5. Forgetting drops entries under a prefix and keeps the rest.
  await cache.cached("conversations:T1.U1", 60_000, load);
  await cache.cached("messages:T1.U1:C1", 60_000, load);
  await cache.cached("messages:T1.U2:C1", 60_000, load);
  cache.forgetCache(["conversations:T1.U1", "messages:T1.U1:"]);
  const before = loads;
  await cache.cached("conversations:T1.U1", 60_000, load);
  await cache.cached("messages:T1.U1:C1", 60_000, load);
  await cache.cached("messages:T1.U2:C1", 60_000, load);
  assert.equal(loads, before + 2, "the forgotten entries load again, the other one does not");

  console.log("slack cache tests passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}
