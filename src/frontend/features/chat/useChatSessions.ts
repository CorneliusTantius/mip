import { useEffect, useState } from "preact/hooks";
import { api } from "../../api/client";
import { DEFAULT_PERSONA_ID, DEFAULT_PROVIDER_ID } from "../../api/constants";
import { announce, CHATS_CHANGED, PERSONAS_CHANGED } from "../../api/events";
import type { ModelOption, Persona, ProviderInfo, Session } from "../../api/types";
import { useAnnouncement } from "../../ui/hooks";

// The chat list, the providers and personas that a new chat can use, and which chat is open.
// Every change goes to the server first, then the list is reloaded from it.
export function useChatSessions() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentId, setCurrentId] = useState<string>();
  const [newProviderId, setNewProviderId] = useState(DEFAULT_PROVIDER_ID);
  const [newPersonaId, setNewPersonaId] = useState(DEFAULT_PERSONA_ID);

  const current = sessions.find((s) => s.id === currentId);
  const currentProvider = providers.find((p) => p.id === current?.providerId);
  const models: ModelOption[] = currentProvider?.models ?? [];

  const providerName = (id: string) => providers.find((p) => p.id === id)?.name ?? id;
  const personaName = (id: string) => personas.find((p) => p.id === id)?.name ?? id;

  // Reloads the chat list, and announces it so the repositories card stays in step.
  async function refresh(): Promise<void> {
    const data = await api.get<{ sessions: Session[] }>("/api/sessions");
    setSessions(data.sessions);
    announce(CHATS_CHANGED);
  }

  async function loadPersonas(): Promise<void> {
    const data = await api.get<{ personas: Persona[] }>("/api/personas");
    setPersonas(data.personas);
    // New chats start with the default persona.
    setNewPersonaId(data.personas.find((p) => p.isDefault)?.id ?? DEFAULT_PERSONA_ID);
  }

  useEffect(() => {
    api.get<{ providers: ProviderInfo[] }>("/api/providers").then((data) => setProviders(data.providers));
    refresh();
    loadPersonas();
  }, []);

  // Settings saves personas, so this list follows.
  useAnnouncement(PERSONAS_CHANGED, loadPersonas);

  // Creates a chat with the chosen provider and persona. Returns its id so the caller can open it.
  async function create(): Promise<string> {
    const session = await api.post<Session>("/api/sessions", { providerId: newProviderId, personaId: newPersonaId });
    await refresh();
    return session.id;
  }

  // Renames a chat. An empty title is ignored by the caller.
  async function rename(id: string, title: string): Promise<void> {
    await api.patch(`/api/sessions/${id}`, { title });
    await refresh();
  }

  // Saves the model or thinking level on the open chat. It applies to the next message.
  async function changeSettings(changes: { model?: string; thinking?: string }): Promise<void> {
    if (!currentId) return;
    await api.patch(`/api/sessions/${currentId}`, changes);
    await refresh();
  }

  // Deletes a chat. If it was the open one, nothing is open afterwards.
  async function remove(id: string): Promise<void> {
    await api.del(`/api/sessions/${id}`);
    if (id === currentId) setCurrentId(undefined);
    await refresh();
  }

  return {
    providers,
    personas,
    sessions,
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
