import { useEffect, useState } from "preact/hooks";
import { errorText } from "../../api/client";
import type { Session } from "../../api/types";
import { Card, ExpandButton } from "../../ui/Card";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { ChatHeader } from "./ChatHeader";
import { Composer } from "./Composer";
import { SessionList } from "./SessionList";
import { Transcript } from "./Transcript";
import { useChatSessions } from "./useChatSessions";
import { useTranscript } from "./useTranscript";

// Phones start with the chat list closed, so the chat has the full width. Desktops start with it open.
const isDesktop = () => window.matchMedia("(min-width: 768px)").matches;

// The chat card. It holds the chat list, the open chat's messages, and the box for the next message.
// This component wires the pieces together. The state lives in useChatSessions and useTranscript.
export function ChatCard() {
  const chats = useChatSessions();
  const transcript = useTranscript(() => chats.refresh());
  const [sidebarOpen, setSidebarOpen] = useState(isDesktop);
  const [pendingDelete, setPendingDelete] = useState<Session>();
  const [deleteError, setDeleteError] = useState<string>();
  const [expanded, setExpanded] = useState(false);

  // Opens the newest chat on first load.
  useEffect(() => {
    if (!chats.currentId && chats.sessions[0]) openChat(chats.sessions[0].id);
  }, [chats.sessions]);

  // Opens a chat. On a phone the list closes, so the chat is what the user sees.
  function openChat(id: string) {
    if (!isDesktop()) setSidebarOpen(false);
    chats.select(id);
    transcript.load(id);
  }

  async function createChat() {
    openChat(await chats.create());
  }

  function askDelete(session: Session) {
    setDeleteError(undefined);
    setPendingDelete(session);
  }

  async function confirmDelete() {
    const session = pendingDelete;
    if (!session) return;
    const wasOpen = session.id === chats.currentId;
    try {
      await chats.remove(session.id);
    } catch (err) {
      return setDeleteError(errorText(err));
    }
    setPendingDelete(undefined);
    if (wasOpen) transcript.clear();
  }

  const session = chats.current;

  return (
    <Card glow="frost" className="flex h-full shrink-0" expanded={expanded} onCollapse={() => setExpanded(false)}>
      <div className="card-body min-h-0 flex-1 gap-3 p-4">
        <div className="flex min-h-0 flex-1">
          <SessionList
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            sessions={chats.sessions}
            currentId={chats.currentId}
            providers={chats.providers}
            personas={chats.personas}
            newProviderId={chats.newProviderId}
            newPersonaId={chats.newPersonaId}
            onNewProviderId={chats.setNewProviderId}
            onNewPersonaId={chats.setNewPersonaId}
            onCreate={createChat}
            onOpen={openChat}
            onRename={chats.rename}
            onDelete={askDelete}
          />

          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            <ChatHeader
              title={session?.title || "Chat"}
              badges={session && [chats.personaName(session.personaId), chats.providerName(session.providerId)]}
              onToggleSessions={() => setSidebarOpen(!sidebarOpen)}
              trailing={<ExpandButton expanded={expanded} onToggle={() => setExpanded(!expanded)} />}
            />
            <Transcript
              key={chats.currentId}
              messages={transcript.messages}
              busy={transcript.busy}
              emptyText={chats.currentId ? "Ask something to start." : "Create a session to start."}
            />
            <Composer
              session={session}
              models={chats.models}
              busy={transcript.busy}
              onSend={(prompt) => session && transcript.send(session.id, prompt)}
              onChangeSettings={chats.changeSettings}
            />
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete this chat?"
        message={`"${pendingDelete?.title || "New session"}" and its messages are removed from mip.`}
        error={deleteError}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(undefined)}
      />
    </Card>
  );
}
