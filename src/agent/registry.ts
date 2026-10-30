import { ClaudeCliProvider } from "./providers/claude-cli.js";
import { PiProvider } from "./providers/pi.js";
import type { AgentProvider } from "./types.js";

// The one place that decides which providers the app offers.
export function createProviders(): AgentProvider[] {
  return [new ClaudeCliProvider(), new PiProvider()];
}

export function findProvider(providers: AgentProvider[], id: string): AgentProvider {
  const provider = providers.find((candidate) => candidate.id === id);
  if (!provider) throw new Error(`unknown provider "${id}"`);
  return provider;
}
