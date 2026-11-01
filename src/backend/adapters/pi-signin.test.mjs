// Checks that a Pi sign-in is given this installation's device ID, which OpenAI's ChatGPT sign-in needs. The Pi runtime is a fake here, so
// no sign-in starts and no browser opens. Run after a build: node src/backend/adapters/pi-signin.test.mjs
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { InMemoryCredentialStore, InMemoryModelsStore } from "@earendil-works/pi-ai";

const DIST = pathToFileURL(fileURLToPath(new URL("../../../dist/backend/", import.meta.url))).href;
const { PiProvider } = await import(`${DIST}adapters/pi.js`);

const DEVICE_ID = "3f1c6f0e-8b1a-4c2d-9e7f-5a6b7c8d9e0f";
const provider = new PiProvider({
  sessionDir: tmpdir(),
  installationId: () => DEVICE_ID,
  agentDir: tmpdir(),
  credentials: new InMemoryCredentialStore(),
  modelsStore: new InMemoryModelsStore(),
});

// A fake runtime. Its login records the arguments it was given, and returns at once.
const logins = [];
provider.runtimePromise = Promise.resolve({
  login: async (providerId, type, _interaction, options) => {
    logins.push({ providerId, type, deviceId: options?.getDeviceId?.() });
  },
});

provider.startSignIn("openai-codex", "subscription");
for (let i = 0; i < 100 && provider.signInProgress("openai-codex").running; i++) {
  await new Promise((resolve) => setTimeout(resolve, 10));
}

assert.deepEqual(logins, [{ providerId: "openai-codex", type: "oauth", deviceId: DEVICE_ID }], "the sign-in gets the installation's device ID");
console.log("pi sign-in tests passed");
