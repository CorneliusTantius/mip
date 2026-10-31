import { useEffect, useState } from "preact/hooks";
import { api, errorText } from "../../api/client";
import { DEFAULT_PERSONA_ID } from "../../api/constants";
import { announce, PERSONAS_CHANGED } from "../../api/events";
import type { Persona } from "../../api/types";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { ErrorAlert } from "../../ui/ErrorAlert";
import { Modal } from "../../ui/Modal";

// Chosen in the dropdown when the user wants a new persona. It is the last option of the list.
const ADD_NEW = "add-new";

// Manage the personas from the chat card: pick one to read or edit, set the default for new chats, or delete one.
// Saving, making a default, or deleting announces the change, so the new-chat dropdown follows.
export function PersonasDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selected, setSelected] = useState(ADD_NEW);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string>();
  const [askingDelete, setAskingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();
  const isNew = selected === ADD_NEW;
  const current = personas.find((p) => p.id === selected);

  async function load(): Promise<Persona[]> {
    const data = await api.get<{ personas: Persona[] }>("/api/personas");
    setPersonas(data.personas);
    return data.personas;
  }

  // Shows a persona in the form. `list` is the freshest list, so a persona that was just saved is found.
  function pick(id: string, list = personas) {
    const persona = list.find((p) => p.id === id);
    setSelected(id);
    setName(persona?.name ?? "");
    setPrompt(persona?.systemPrompt ?? "");
    setError(undefined);
  }

  // Each time the dialog opens, show the first persona.
  useEffect(() => {
    if (!open) return;
    load().then((list) => pick(list[0]?.id ?? ADD_NEW, list));
  }, [open]);

  async function save() {
    let saved: Persona;
    try {
      const body = { name, systemPrompt: prompt };
      saved = isNew ? await api.post<Persona>("/api/personas", body) : await api.put<Persona>(`/api/personas/${selected}`, body);
    } catch (err) {
      return setError(errorText(err));
    }
    const list = await load();
    pick(saved.id, list);
    announce(PERSONAS_CHANGED);
  }

  async function makeDefault() {
    try {
      await api.post(`/api/personas/${selected}/default`);
    } catch (err) {
      return setError(errorText(err));
    }
    await load();
    announce(PERSONAS_CHANGED);
  }

  async function remove() {
    try {
      await api.del(`/api/personas/${selected}`);
    } catch (err) {
      return setDeleteError(errorText(err));
    }
    setAskingDelete(false);
    const list = await load();
    pick(list[0]?.id ?? ADD_NEW, list);
    announce(PERSONAS_CHANGED);
  }

  return (
    <>
      <Modal open={open} onClose={onClose} closeButton glow="frost" boxClassName="flex h-[min(40rem,80vh)] max-w-2xl flex-col">
        <h2 className="mb-4 pr-10 text-lg font-semibold">Personas</h2>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-3">
            <fieldset className="fieldset">
              <legend className="fieldset-legend">Persona</legend>
              <select className="select w-full" value={selected} onChange={(e) => pick(e.currentTarget.value)}>
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.isDefault ? " (default)" : ""}
                  </option>
                ))}
                <option value={ADD_NEW}>+ Add new persona</option>
              </select>
            </fieldset>

            <fieldset className="fieldset">
              <legend className="fieldset-legend">Name</legend>
              <input className="input w-full" placeholder="For example: Code reviewer" value={name} onInput={(e) => setName(e.currentTarget.value)} />
            </fieldset>
            <fieldset className="fieldset">
              <legend className="fieldset-legend">System prompt</legend>
              <textarea className="textarea h-56 w-full font-mono text-sm" value={prompt} onInput={(e) => setPrompt(e.currentTarget.value)} />
            </fieldset>
            <ErrorAlert message={error} />
            <p className="text-sm opacity-70">A chat keeps the persona it was started with. Changes apply to its next message.</p>

            <div className="flex justify-end gap-2">
              {current?.isDefault && <span className="badge badge-success mr-auto">Default for new chats</span>}
              {!isNew && !current?.isDefault && (
                <button className="btn btn-ghost" onClick={makeDefault}>
                  Set as default
                </button>
              )}
              {!isNew && !current?.isDefault && selected !== DEFAULT_PERSONA_ID && (
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setDeleteError(undefined);
                    setAskingDelete(true);
                  }}
                >
                  Delete
                </button>
              )}
              <button className="btn btn-primary" disabled={!name.trim() || !prompt.trim()} onClick={save}>
                {isNew ? "Create" : "Save"}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={askingDelete}
        title="Delete this persona?"
        message={`"${current?.name ?? name}" is removed from mip.`}
        error={deleteError}
        onConfirm={remove}
        onCancel={() => {
          setAskingDelete(false);
          setDeleteError(undefined);
        }}
      />
    </>
  );
}
