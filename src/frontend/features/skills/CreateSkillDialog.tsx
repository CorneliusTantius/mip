import { useState } from "preact/hooks";
import { api, errorText } from "../../api/client";
import { ErrorAlert } from "../../ui/ErrorAlert";
import { Modal } from "../../ui/Modal";

// Creates a skill from a form: a name, one line of description, and the instructions. The server checks the same rules an import does.
export function CreateSkillDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (name: string) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const filled = !!name.trim() && !!description.trim() && !!body.trim();

  // Clears the form for the next time, and closes the dialog.
  function close() {
    setName("");
    setDescription("");
    setBody("");
    setError(undefined);
    onClose();
  }

  async function create() {
    setBusy(true);
    setError(undefined);
    try {
      const skill = await api.post<{ name: string }>("/api/skills", {
        name: name.trim(),
        description: description.trim(),
        body: body.trim(),
      });
      close();
      onCreated(skill.name);
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(false);
  }

  return (
    <Modal open={open} onClose={close} glow="teal" boxClassName="max-w-2xl">
      <h3 className="text-lg font-semibold">Create a skill</h3>
      <p className="py-2 text-sm opacity-70">
        A skill tells the agents how to do one kind of task. Write the instructions the way you would brief a person.
      </p>

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (filled && !busy) void create();
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="opacity-70">Name</span>
          <input
            className="input input-sm w-full"
            placeholder="release-checklist"
            value={name}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
          />
          <span className="text-xs opacity-60">Lowercase letters, digits, and hyphens. It is also the folder name.</span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="opacity-70">Description</span>
          <input
            className="input input-sm w-full"
            placeholder="When to use it, in one line"
            value={description}
            onInput={(e) => setDescription((e.target as HTMLInputElement).value)}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="opacity-70">Instructions</span>
          <textarea
            className="textarea w-full font-mono text-xs"
            rows={10}
            placeholder="Steps, rules, and what good looks like."
            value={body}
            onInput={(e) => setBody((e.target as HTMLTextAreaElement).value)}
          />
        </label>

        <div className="modal-action">
          <button type="button" className="btn btn-sm" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={!filled || busy}>
            {busy && <span className="loading loading-spinner loading-xs" />}
            Create skill
          </button>
        </div>
      </form>

      <ErrorAlert message={error} className="mt-3" />
    </Modal>
  );
}
