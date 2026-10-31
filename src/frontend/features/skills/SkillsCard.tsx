import { useEffect, useState } from "preact/hooks";
import { api, errorText } from "../../api/client";
import type { SkillDetail, SkillSummary } from "../../api/types";
import { Card, CardBody, ExpandButton, useCardExpansion } from "../../ui/Card";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { ErrorAlert } from "../../ui/ErrorAlert";
import { CreateSkillDialog } from "./CreateSkillDialog";
import { ImportSkillDialog } from "./ImportSkillDialog";
import { useSkills } from "./useSkills";

// The skills mip's agents can use. Only the skills a chat enables are offered to it, from the chat's Skills button.
export function SkillsCard() {
  return (
    <Card glow="teal">
      <SkillsBody />
    </Card>
  );
}

// The list of installed skills. Expanded, the card also shows the selected skill's instructions, with remove and import.
function SkillsBody() {
  const { expanded } = useCardExpansion();
  const { skills, problems, error, setError, load } = useSkills();
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
      {skills.length === 0 ? (
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
      )}

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
