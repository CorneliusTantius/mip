import { useEffect, useState } from "preact/hooks";
import { api, errorText } from "../../api/client";
import type { SkillSummary } from "../../api/types";
import { ErrorAlert } from "../../ui/ErrorAlert";
import { Modal } from "../../ui/Modal";

// Chooses which installed skills this agent may use. An agent can read only the skills checked here.
export function AgentSkillsDialog({ open, agentId, onClose }: { open: boolean; agentId: string; onClose: () => void }) {
  const [installed, setInstalled] = useState<SkillSummary[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  // Each time the dialog opens, it reads the installed skills and what this agent has enabled.
  useEffect(() => {
    if (!open) return;
    setError(undefined);
    Promise.all([api.get<{ skills: SkillSummary[] }>("/api/skills"), api.get<{ skills: string[] }>(`/api/agents/${agentId}`)]).then(
      ([list, agent]) => {
        setInstalled(list.skills);
        setChosen(agent.skills);
      },
      (err) => setError(errorText(err)),
    );
  }, [open, agentId]);

  function toggle(name: string) {
    setChosen((current) => (current.includes(name) ? current.filter((item) => item !== name) : [...current, name]));
  }

  async function save() {
    setSaving(true);
    setError(undefined);
    try {
      await api.put(`/api/agents/${agentId}/skills`, { skills: chosen });
      onClose();
    } catch (err) {
      setError(errorText(err));
    }
    setSaving(false);
  }

  return (
    <Modal open={open} onClose={onClose} glow="teal" boxClassName="max-w-lg">
      <h3 className="text-lg font-semibold">Skills for this agent</h3>
      <p className="py-2 text-sm opacity-70">
        Only the checked skills can be read in this agent. Changes apply to the next message. Skills are imported from the Skills card.
      </p>

      {installed.length === 0 ? (
        <p className="py-4 text-center text-sm opacity-60">No skills are installed yet.</p>
      ) : (
        <ul className="flex flex-col gap-2 py-2">
          {installed.map((skill) => (
            <li key={skill.name}>
              <label className="flex cursor-pointer items-start gap-3">
                <input type="checkbox" className="checkbox checkbox-sm mt-1" checked={chosen.includes(skill.name)} onChange={() => toggle(skill.name)} />
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium">{skill.name}</span>
                  <span className="text-xs opacity-70">{skill.description}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}

      <ErrorAlert message={error} className="mb-3" />
      <div className="modal-action">
        <button className="btn btn-sm" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary btn-sm" disabled={saving} onClick={save}>
          {saving && <span className="loading loading-spinner loading-xs" />}
          Save
        </button>
      </div>
    </Modal>
  );
}
