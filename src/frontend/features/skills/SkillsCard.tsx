import { useEffect, useState } from "preact/hooks";
import { api, errorText } from "../../api/client";
import type { Bot, Session, SkillDetail, SkillSummary } from "../../api/types";
import { Card, CardBody, ExpandButton, useCardExpansion } from "../../ui/Card";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { ErrorAlert } from "../../ui/ErrorAlert";
import { CreateSkillDialog } from "./CreateSkillDialog";
import { ImportSkillDialog } from "./ImportSkillDialog";
import { useSkills } from "./useSkills";

// The skills mip's agents can use. Each chat picks its own from its Skills button, and the pill here shows who has what.
export function SkillsCard() {
  return (
    <Card glow="teal">
      <SkillsBody />
    </Card>
  );
}

// Which view the card shows: the installed skills, the skills each chat has, or the skills each bot has.
type Scope = "all" | "chat" | "bot";
const SCOPES: [Scope, string][] = [
  ["all", "All"],
  ["chat", "Chat"],
  ["bot", "Bot"],
];

// The installed skills, with the view pill. Expanded, the All view also shows the selected skill's instructions, with remove.
function SkillsBody() {
  const { expanded } = useCardExpansion();
  const { skills, problems, error, setError, load } = useSkills();
  const [scope, setScope] = useState<Scope>("all");
  const [selected, setSelected] = useState<string>();
  const [detail, setDetail] = useState<SkillDetail>();
  const [importing, setImporting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<SkillSummary>();
  const [removeError, setRemoveError] = useState<string>();
  // The skill shown: the one picked, or the first one.
  const current = selected ?? skills[0]?.name;

  useEffect(() => {
    if (!current) return setDetail(undefined);
    api.get<SkillDetail>(`/api/skills/${current}`).then(setDetail, (err) => setError(errorText(err)));
  }, [current, skills]);

  async function remove() {
    if (!removing) return;
    setRemoveError(undefined);
    try {
      await api.del(`/api/skills/${removing.name}`);
    } catch (err) {
      return setRemoveError(errorText(err));
    }
    setRemoving(undefined);
    setSelected(undefined);
    load();
  }

  return (
    <CardBody
      title="Skills"
      className={expanded ? "min-h-0 flex-1" : ""}
      actions={
        <>
          <button className="btn btn-ghost btn-sm" onClick={() => setCreating(true)}>
            Create
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setImporting(true)}>
            Import
          </button>
          <ExpandButton />
        </>
      }
    >
      <div className="join self-start">
        {SCOPES.map(([key, label]) => (
          <button key={key} className={`join-item btn btn-xs ${scope === key ? "btn-active" : ""}`} onClick={() => setScope(key)}>
            {label}
          </button>
        ))}
      </div>

      {scope === "all" &&
        (skills.length === 0 ? (
          <p className="py-6 text-center opacity-60">No skills yet. Create one, or import a skill folder.</p>
        ) : (
          <div className={expanded ? "flex min-h-0 flex-1 gap-4" : "flex flex-col gap-1"}>
            <ul className={expanded ? "menu w-48 shrink-0 gap-1 overflow-y-auto p-0" : "menu gap-1 p-0"}>
              {skills.map((skill) => (
                <li key={skill.name}>
                  <button className={skill.name === current ? "menu-active" : ""} onClick={() => setSelected(skill.name)} title={skill.description}>
                    {skill.name}
                  </button>
                </li>
              ))}
            </ul>
            {expanded && detail && (
              <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto">
                <p className="text-sm opacity-80">{detail.description}</p>
                <pre className="whitespace-pre-wrap break-words rounded-box bg-base-300/60 p-3 text-xs">{detail.body}</pre>
                {detail.files.length > 0 && <p className="text-xs opacity-60">Files: {detail.files.join(", ")}</p>}
                <div>
                  <button className="btn btn-error btn-outline btn-sm" onClick={() => setRemoving(detail)}>
                    Remove skill
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

      {scope === "chat" && <ChatSkills />}
      {scope === "bot" && <BotSkills />}

      {problems.length > 0 && (
        <p className="text-xs text-warning">
          {problems.length} skill folder{problems.length > 1 ? "s" : ""} could not be read: {problems.map((p) => p.folder).join(", ")}
        </p>
      )}
      <ErrorAlert message={error} />

      <CreateSkillDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(name) => {
          setSelected(name);
          load();
        }}
      />
      <ImportSkillDialog
        open={importing}
        onClose={() => setImporting(false)}
        onInstalled={(name) => {
          setSelected(name);
          load();
        }}
      />
      <ConfirmDialog
        open={!!removing}
        title="Remove this skill?"
        message={`"${removing?.name}" is deleted from mip. Chats stop using it.`}
        error={removeError}
        onConfirm={remove}
        onCancel={() => setRemoving(undefined)}
      />
    </CardBody>
  );
}

// Each chat with the skills it has enabled. Reads the chat list each time the view opens.
function ChatSkills() {
  const [chats, setChats] = useState<Session[]>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    api.get<{ sessions: Session[] }>("/api/sessions").then((data) => setChats(data.sessions), (err) => setError(errorText(err)));
  }, []);

  if (error) return <ErrorAlert message={error} />;
  if (!chats) return <p className="py-4 text-center text-sm opacity-60">Loading chats…</p>;
  if (chats.length === 0) return <p className="py-4 text-center text-sm opacity-60">No chats yet.</p>;
  return (
    <table className="table table-xs">
      <thead>
        <tr>
          <th>Chat</th>
          <th>Skills</th>
        </tr>
      </thead>
      <tbody>
        {chats.map((chat) => (
          <tr key={chat.id}>
            <td className="truncate">{chat.title || "New session"}</td>
            <td>{chat.skills && chat.skills.length > 0 ? chat.skills.join(", ") : <span className="opacity-50">none</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Each bot with its skills. Bots have no skill access yet, so every row says none.
function BotSkills() {
  const [bots, setBots] = useState<Bot[]>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    api.get<{ bots: Bot[] }>("/api/bots").then((data) => setBots(data.bots), (err) => setError(errorText(err)));
  }, []);

  if (error) return <ErrorAlert message={error} />;
  if (!bots) return <p className="py-4 text-center text-sm opacity-60">Loading bots…</p>;
  if (bots.length === 0) return <p className="py-4 text-center text-sm opacity-60">No bots yet.</p>;
  return (
    <div className="flex flex-col gap-2">
      <table className="table table-xs">
        <thead>
          <tr>
            <th>Bot</th>
            <th>Skills</th>
          </tr>
        </thead>
        <tbody>
          {bots.map((bot) => (
            <tr key={bot.id}>
              <td className="truncate">{bot.name}</td>
              <td className="opacity-50">none</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs opacity-60">Bots can't use skills yet. Their room turns have no skill access.</p>
    </div>
  );
}
