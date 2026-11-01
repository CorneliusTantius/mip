// Checks Pi's credential and model stores: reads, writes, the order of writes for one provider, and the one-time import of Pi's auth file.
// Run after a build: node src/backend/app/pi/pi-store.test.mjs. It sets MIP_HOME to a temporary folder before the modules load, and
// writes the auth file to a temporary folder, so the real ~/.pi is never read.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIST = pathToFileURL(fileURLToPath(new URL("../../../../dist/backend/", import.meta.url))).href;
const root = mkdtempSync(join(tmpdir(), "mip-pi-store-"));
process.env.MIP_HOME = join(root, "mip-home");

try {
  const store = await import(`${DIST}app/pi/store.js`);
  const rows = await import(`${DIST}storage/pi.js`);
  const credentials = new store.DbCredentialStore();
  const models = new store.DbModelsStore();

  // 1. The one-time import copies a Pi auth file into the table, and reads the same credential back. A later start does not import again,
  // even when the table is empty, so a credential removed on purpose stays removed.
  const authPath = join(root, "auth.json");
  writeFileSync(authPath, JSON.stringify({ openrouter: { type: "api_key", key: "sk-test-openrouter" }, broken: { nothing: true } }));
  assert.equal(store.importLegacyPiAuth(authPath), 1, "only valid entries are imported");
  assert.deepEqual(await credentials.read("openrouter"), { type: "api_key", key: "sk-test-openrouter" });
  assert.equal(await credentials.read("broken"), undefined);
  assert.equal(store.importLegacyPiAuth(authPath), 0, "the import runs once");
  await credentials.delete("openrouter");
  assert.equal(store.importLegacyPiAuth(authPath), 0, "a credential removed on purpose is not imported again");
  assert.deepEqual(await credentials.list(), []);

  // 2. modify is the write path. It sees the current credential, and an undefined result leaves it unchanged.
  const created = await credentials.modify("anthropic", async (current) => current ?? { type: "api_key", key: "k1" });
  assert.deepEqual(created, { type: "api_key", key: "k1" });
  assert.equal(await credentials.modify("anthropic", async () => undefined).then((value) => value.key), "k1");
  assert.deepEqual(await credentials.list(), [{ providerId: "anthropic", type: "api_key" }]);
  assert.equal(rows.readPiCredentialRow("anthropic").updatedAt > 0, true, "each write records its change time");

  // 3. Two writes to one provider that overlap run one after the other, so neither is lost. The counter goes to 2, not 1.
  await credentials.modify("counter", async () => ({ type: "oauth", refresh: "r", access: "0", expires: 1 }));
  const bump = () =>
    credentials.modify("counter", async (current) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { ...current, access: String(Number(current.access) + 1) };
    });
  await Promise.all([bump(), bump()]);
  assert.equal((await credentials.read("counter")).access, "2", "overlapping writes to one provider run in order");

  // 4. A failed write does not stop the writes after it.
  await assert.rejects(credentials.modify("counter", async () => { throw new Error("refresh failed"); }), /refresh failed/);
  await credentials.modify("counter", async (current) => ({ ...current, access: "9" }));
  assert.equal((await credentials.read("counter")).access, "9");

  // 5. The model store keeps one catalog per provider.
  await models.write("openrouter", { models: [], checkedAt: 5 });
  assert.deepEqual(await models.read("openrouter"), { models: [], checkedAt: 5 });
  assert.equal(rows.readPiModelRow("openrouter").updatedAt > 0, true);
  await models.delete("openrouter");
  assert.equal(await models.read("openrouter"), undefined);

  // 6. Only the Pi config files this app knows are read and written.
  assert.equal(rows.readPiConfigFile("settings.json"), undefined, "no settings file yet");
  rows.writePiConfigFile("settings.json", "{}\n");
  assert.equal(rows.readPiConfigFile("settings.json"), "{}\n");
  rows.removePiConfigFile("settings.json");
  assert.equal(rows.readPiConfigFile("settings.json"), undefined);
  assert.deepEqual([...rows.PI_CONFIG_FILES], ["settings.json", "models.json"]);

  console.log("pi store tests passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}
