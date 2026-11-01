import { join } from "node:path";
import { ClaudeCliProvider } from "../adapters/claude-cli.js";
import { PiProvider } from "../adapters/pi.js";
import type { AgentProvider, SignInMethod } from "../adapters/contract.js";
import { SESSIONS_DIR } from "../storage/paths.js";
import { AppError, errorMessage } from "./errors.js";
import { installationId } from "./installation.js";

// The one place that decides which providers the app offers, and where each keeps its files.
const providers: AgentProvider[] = [
  new ClaudeCliProvider({ configDir: join(SESSIONS_DIR, "claude") }),
  new PiProvider({ sessionDir: join(SESSIONS_DIR, "pi"), installationId }),
];

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
