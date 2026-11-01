import { useEffect, useState } from "preact/hooks";
import { api } from "../../api/client";
import { DEFAULT_PERSONA_ID, DEFAULT_PROVIDER_ID } from "../../api/constants";
import { announce, AGENTS_CHANGED, PERSONAS_CHANGED, PROVIDERS_CHANGED } from "../../api/events";
import type { ModelOption, Persona, ProviderInfo, Agent } from "../../api/types";
import { useAnnouncement } from "../../ui/hooks";

// The agent list, the providers and personas that a new agent can use, and which agent is open.
// Every change goes to the server first, then the list is reloaded from it.
export function useAgents() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [currentId, setCurrentId] = useState<string>();
  const [newProviderId, setNewProviderId] = useState(DEFAULT_PROVIDER_ID);
  const [newPersonaId, setNewPersonaId] = useState(DEFAULT_PERSONA_ID);

  const current = agents.find((s) => s.id === currentId);
  const currentProvider = providers.find((p) => p.id === current?.providerId);
  const models: ModelOption[] = currentProvider?.models ?? [];

  const providerName = (id: string) => providers.find((p) => p.id === id)?.name ?? id;
  const personaName = (id: string) => personas.find((p) => p.id === id)?.name ?? id;

  // Reloads the agent list, and announces it so the repositories card stays in step.
  async function refresh(): Promise<void> {
    const data = await api.get<{ agents: Agent[] }>("/api/agents");
    setAgents(data.agents);
    announce(AGENTS_CHANGED);
  }

  async function loadPersonas(): Promise<void> {
    const data = await api.get<{ personas: Persona[] }>("/api/personas");
    setPersonas(data.personas);
    // New agents start with the default persona.
    setNewPersonaId(data.personas.find((p) => p.isDefault)?.id ?? DEFAULT_PERSONA_ID);
  }

  // The providers, and each one's models. Settings signs providers in and out, so this is loaded again when that changes.
  const loadProviders = () => api.get<{ providers: ProviderInfo[] }>("/api/providers").then((data) => setProviders(data.providers));

  useEffect(() => {
    loadProviders();
    refresh();
    loadPersonas();
  }, []);

  // Settings saves personas, so this list follows.
  useAnnouncement(PERSONAS_CHANGED, loadPersonas);
  // A sign-in changes which models the agent can use, so the providers are loaded again.
  useAnnouncement(PROVIDERS_CHANGED, loadProviders);

  // Creates an agent with the chosen provider and persona. Returns its id so the caller can open it.
  async function create(): Promise<string> {
    const agent = await api.post<Agent>("/api/agents", { providerId: newProviderId, personaId: newPersonaId });
    await refresh();
    return agent.id;
  }

  // Renames an agent. An empty title is ignored by the caller.
  async function rename(id: string, title: string): Promise<void> {
    await api.patch(`/api/agents/${id}`, { title });
    await refresh();
  }

  // Saves the model, thinking level, or the bots' switch on the open agent. The model and thinking level apply to the next message.
  async function changeSettings(changes: { model?: string; thinking?: string; openToBots?: boolean }): Promise<void> {
    if (!currentId) return;
    await api.patch(`/api/agents/${currentId}`, changes);
    await refresh();
  }

  // Deletes an agent. If it was the open one, nothing is open afterwards.
  async function remove(id: string): Promise<void> {
    await api.del(`/api/agents/${id}`);
    if (id === currentId) setCurrentId(undefined);
    await refresh();
  }

  return {
    providers,
    personas,
    agents,
    currentId,
    current,
    currentProvider,
    models,
    providerName,
    personaName,
    newProviderId,
    setNewProviderId,
    newPersonaId,
    setNewPersonaId,
    select: setCurrentId,
    refresh,
    create,
    rename,
    changeSettings,
    remove,
  };
}
