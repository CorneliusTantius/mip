import { join } from "node:path";
import { ClaudeCliProvider } from "../adapters/claude-cli.js";
import { PiProvider } from "../adapters/pi.js";
import type { AgentProvider, SignInMethod } from "../adapters/contract.js";
import { PI_AGENT_DIR, SESSIONS_DIR } from "../storage/paths.js";
import { AppError, errorMessage } from "./errors.js";
import { installationId } from "./installation.js";
import { DbCredentialStore, DbModelsStore } from "./pi/store.js";

// The one place that decides which providers the app offers, and where each keeps its files.
const pi = new PiProvider({
  sessionDir: join(SESSIONS_DIR, "pi"),
  installationId,
  agentDir: PI_AGENT_DIR,
  credentials: new DbCredentialStore(),
  modelsStore: new DbModelsStore(),
});
const providers: AgentProvider[] = [new ClaudeCliProvider({ configDir: join(SESSIONS_DIR, "claude") }), pi];

// Pi's custom models file is read when its runtime is made, so a sync that changes it makes the next Pi call read it again.
export function reloadPiConfig(): void {
  pi.reloadConfig();
}

export function hasProvider(id: string): boolean {
  return providers.some((p) => p.id === id);
}

export function findProvider(id: string): AgentProvider {
  const provider = providers.find((p) => p.id === id);
  if (!provider) throw new AppError(404, `unknown provider "${id}"`);
  return provider;
}

// Settings data: each provider, its sign-in targets, and any sign-in in progress. Also the models an agent can use.
export async function listProviders() {
  return Promise.all(
    providers.map(async (provider) => {
      const base = {
        id: provider.id,
        name: provider.name,
        capabilities: provider.capabilities,
        models: await provider.models().catch(() => []),
      };
      try {
        const targets = await provider.targets();
        return {
          ...base,
          targets: targets.map((target) => ({
            ...target,
            progress: provider.signInProgress?.(target.id) ?? { running: false, output: [] },
          })),
        };
      } catch (err) {
        return { ...base, targets: [], error: errorMessage(err) };
      }
    }),
  );
}

export function signIn(providerId: string, targetId: string, method: SignInMethod): void {
  findProvider(providerId).startSignIn?.(targetId, method);
}

export function answerSignIn(providerId: string, targetId: string, answer: string): void {
  findProvider(providerId).answerSignIn?.(targetId, answer);
}

export async function signOut(providerId: string, targetId: string): Promise<void> {
  await findProvider(providerId).signOut?.(targetId);
}
