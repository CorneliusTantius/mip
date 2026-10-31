import { useEffect, useState } from "preact/hooks";
import { errorText } from "../../api/client";
import type { Agent } from "../../api/types";
import { Card, ExpandButton } from "../../ui/Card";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { AgentSkillsDialog } from "./AgentSkillsDialog";
import { PersonasDialog } from "./PersonasDialog";
import { AgentHeader } from "./AgentHeader";
import { Composer } from "./Composer";
import { AgentList } from "./AgentList";
import { Transcript } from "./Transcript";
import { useAgents } from "./useAgents";
import { useTranscript } from "./useTranscript";

// Phones start with the agent list closed, so the agent has the full width. Desktops start with it open.
const isDesktop = () => window.matchMedia("(min-width: 768px)").matches;

// The agent card. It holds the agent list, the open agent's messages, and the box for the next message.
// This component wires the pieces together. The state lives in useAgents and useTranscript.
export function AgentCard() {
  const agents = useAgents();
  const transcript = useTranscript(() => agents.refresh());
  const [sidebarOpen, setSidebarOpen] = useState(isDesktop);
  const [pendingDelete, setPendingDelete] = useState<Agent>();
  const [managingPersonas, setManagingPersonas] = useState(false);
  const [choosingSkills, setChoosingSkills] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();

  // Opens the newest agent on first load.
  useEffect(() => {
    if (!agents.currentId && agents.agents[0]) openAgent(agents.agents[0].id);
  }, [agents.agents]);

  // Opens an agent. On a phone the list closes, so the agent is what the user sees.
  function openAgent(id: string) {
    if (!isDesktop()) setSidebarOpen(false);
    agents.select(id);
    transcript.load(id);
  }

  async function createAgent() {
    openAgent(await agents.create());
  }

  function askDelete(agent: Agent) {
    setDeleteError(undefined);
    setPendingDelete(agent);
  }

  async function confirmDelete() {
    const agent = pendingDelete;
    if (!agent) return;
    const wasOpen = agent.id === agents.currentId;
    try {
      await agents.remove(agent.id);
    } catch (err) {
      return setDeleteError(errorText(err));
    }
    setPendingDelete(undefined);
    if (wasOpen) transcript.clear();
  }

  const agent = agents.current;

  return (
    <Card glow="frost" className="flex h-full shrink-0">
      <div className="card-body min-h-0 flex-1 gap-3 p-4">
        <div className="flex min-h-0 flex-1">
          <AgentList
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            agents={agents.agents}
            currentId={agents.currentId}
            providers={agents.providers}
            personas={agents.personas}
            newProviderId={agents.newProviderId}
            newPersonaId={agents.newPersonaId}
            onNewProviderId={agents.setNewProviderId}
            onNewPersonaId={agents.setNewPersonaId}
            onCreate={createAgent}
            onManagePersonas={() => setManagingPersonas(true)}
            onOpen={openAgent}
            onRename={agents.rename}
            onDelete={askDelete}
          />

          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            <AgentHeader
              title={agent?.title || "Agent"}
              badges={agent && [agents.personaName(agent.personaId), agents.providerName(agent.providerId)]}
              onToggleAgents={() => setSidebarOpen(!sidebarOpen)}
              trailing={
                <>
                  <button className="btn btn-ghost btn-sm" disabled={!agent} onClick={() => setChoosingSkills(true)}>
                    Skills
                  </button>
                  <ExpandButton />
                </>
              }
            />
            <Transcript
              key={agents.currentId}
              messages={transcript.messages}
              busy={transcript.busy}
              emptyText={agents.currentId ? "Ask something to start." : "Create an agent to start."}
            />
            <Composer
              agent={agent}
              models={agents.models}
              busy={transcript.busy}
              onSend={(prompt) => agent && transcript.send(agent.id, prompt)}
              onChangeSettings={agents.changeSettings}
            />
          </div>
        </div>
      </div>

      <PersonasDialog open={managingPersonas} onClose={() => setManagingPersonas(false)} />
      {agent && <AgentSkillsDialog open={choosingSkills} agentId={agent.id} onClose={() => setChoosingSkills(false)} />}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete this agent?"
        message={`"${pendingDelete?.title || "New agent"}" and its messages are removed from mip.`}
        error={deleteError}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(undefined)}
      />
    </Card>
  );
}
