import { useState } from "preact/hooks";
import type { Persona, ProviderInfo, Agent } from "../../api/types";
import { Icon } from "../../ui/Icon";

// The agent list is a card over the agent on a phone, and a column beside the agent on a desktop. It stays mounted,
// so opening and closing both animate: it slides and fades on a phone, and folds its width on a desktop.
const BACKDROP = "absolute inset-0 z-10 cursor-default bg-black/40 transition-[opacity,visibility] duration-300 md:hidden";
const BACKDROP_OPEN = "visible opacity-100";
const BACKDROP_CLOSED = "invisible pointer-events-none opacity-0";
const AGENTS =
  "absolute inset-y-3 left-3 z-20 flex w-72 max-w-[calc(100%-1.5rem)] flex-col gap-2 overflow-y-auto rounded-box border border-base-300 bg-base-200 p-4 shadow-2xl transition-[translate,opacity,visibility,width,margin,padding,border-color] duration-300 ease-out md:static md:inset-auto md:z-auto md:max-w-none md:shrink-0 md:rounded-none md:bg-transparent md:shadow-none";
const AGENTS_OPEN = "translate-x-0 opacity-100 visible md:mr-4 md:w-56 md:border-0 md:border-r md:border-base-300 md:p-0 md:pr-4";
const AGENTS_CLOSED = "-translate-x-[120%] opacity-0 invisible md:translate-x-0 md:mr-0 md:w-0 md:overflow-hidden md:border-0 md:p-0 md:opacity-0 md:invisible";

interface AgentListProps {
  open: boolean;
  onClose: () => void;
  agents: Agent[];
  currentId?: string;
  providers: ProviderInfo[];
  personas: Persona[];
  newProviderId: string;
  newPersonaId: string;
  onNewProviderId: (id: string) => void;
  onNewPersonaId: (id: string) => void;
  onCreate: () => void;
  onManagePersonas: () => void;
  onOpen: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (agent: Agent) => void;
}

// The new-agent form, and the list of agents. Renaming happens in place: the row becomes a text box.
export function AgentList({
  open,
  onClose,
  agents,
  currentId,
  providers,
  personas,
  newProviderId,
  newPersonaId,
  onNewProviderId,
  onNewPersonaId,
  onCreate,
  onManagePersonas,
  onOpen,
  onRename,
  onDelete,
}: AgentListProps) {
  const [renamingId, setRenamingId] = useState<string>();
  const [titleDraft, setTitleDraft] = useState("");

  function startRename(agent: Agent) {
    setTitleDraft(agent.title);
    setRenamingId(agent.id);
  }

  function commitRename(id: string) {
    const title = titleDraft.trim();
    setRenamingId(undefined);
    if (title) onRename(id, title);
  }

  return (
    <>
      {/* On a phone the list is a card over the agent, so the agent keeps its full width. Tapping outside closes it. */}
      <button className={`${BACKDROP} ${open ? BACKDROP_OPEN : BACKDROP_CLOSED}`} aria-label="Close agents" tabIndex={open ? 0 : -1} onClick={onClose} />

      <aside className={`${AGENTS} ${open ? AGENTS_OPEN : AGENTS_CLOSED}`}>
        <select className="select select-sm w-full" value={newProviderId} onChange={(e) => onNewProviderId(e.currentTarget.value)}>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select className="select select-sm w-full" value={newPersonaId} onChange={(e) => onNewPersonaId(e.currentTarget.value)}>
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button className="btn btn-primary btn-sm" disabled={providers.length === 0} onClick={onCreate}>
          + New agent
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onManagePersonas}>
          Manage personas
        </button>

        <ul className="flex flex-col gap-1">
          {agents.map((s) =>
            renamingId === s.id ? (
              <li key={s.id}>
                <input
                  className="input input-sm w-full"
                  autoFocus
                  value={titleDraft}
                  onInput={(e) => setTitleDraft(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename(s.id);
                    if (e.key === "Escape") setRenamingId(undefined);
                  }}
                  onBlur={() => setRenamingId(undefined)}
                />
              </li>
            ) : (
              <li key={s.id} className="flex items-center">
                <button
                  className={"btn btn-ghost btn-sm min-w-0 flex-1 justify-start truncate font-normal " + (s.id === currentId ? "btn-active" : "")}
                  onClick={() => onOpen(s.id)}
                >
                  {s.title || "New agent"}
                </button>
                <button className="btn btn-ghost btn-xs btn-square" aria-label="Rename" onClick={() => startRename(s)}>
                  <Icon name="edit" />
                </button>
                <button className="btn btn-ghost btn-xs btn-square" aria-label="Delete" onClick={() => onDelete(s)}>
                  <Icon name="trash" />
                </button>
              </li>
            ),
          )}
        </ul>
      </aside>
    </>
  );
}
