// Checks this installation's device ID: it is made once and kept in the data folder, a new run of the app reads it back, and a saved
// value that is not a UUID is replaced. Run after a build: node src/backend/app/installation.test.mjs
// It sets HOME to a temporary folder before the modules load.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIST = pathToFileURL(fileURLToPath(new URL("../../../dist/backend/", import.meta.url))).href;
const root = mkdtempSync(join(tmpdir(), "mip-installation-"));
process.env.HOME = join(root, "home");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

try {
  const { DEVICE_ID_FILE } = await import(`${DIST}storage/paths.js`);
  const { installationId } = await import(`${DIST}app/installation.js`);

  // 1. The first call makes a UUID and saves it. Later calls in the same run give the same one.
  const first = installationId();
  assert.match(first, UUID);
  assert.equal(readFileSync(DEVICE_ID_FILE, "utf8").trim(), first);
  assert.equal(installationId(), first);

  // 2. A new run of the app reads the saved one. A fresh copy of the module stands in for the new run.
  const restarted = await import(`${DIST}app/installation.js?restart`);
  assert.equal(restarted.installationId(), first);

  // 3. A saved value that is not a UUID is replaced, and the replacement is saved.
  writeFileSync(DEVICE_ID_FILE, "not-a-uuid\n");
  const repaired = await import(`${DIST}app/installation.js?repaired`);
  const replaced = repaired.installationId();
  assert.match(replaced, UUID);
  assert.notEqual(replaced, "not-a-uuid");
  assert.equal(readFileSync(DEVICE_ID_FILE, "utf8").trim(), replaced);

  console.log("installation tests passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}
