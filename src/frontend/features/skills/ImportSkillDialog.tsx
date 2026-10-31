import { useState } from "preact/hooks";
import { api, errorText } from "../../api/client";
import type { SkillImport } from "../../api/types";
import { ErrorAlert } from "../../ui/ErrorAlert";
import { Modal } from "../../ui/Modal";

// Imports a skill folder in two steps. The folder is checked and shown first, and it is installed only when the user confirms.
export function ImportSkillDialog({ open, onClose, onInstalled }: { open: boolean; onClose: () => void; onInstalled: (name: string) => void }) {
  const [path, setPath] = useState("");
  const [preview, setPreview] = useState<SkillImport>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  // Leaves the dialog empty. An import that was not confirmed is dropped from staging.
  function close() {
    if (preview) void api.del(`/api/skills/imports/${preview.id}`).catch(() => {});
    setPreview(undefined);
    setPath("");
    setError(undefined);
    onClose();
  }

  async function review() {
    setBusy(true);
    setError(undefined);
    try {
      setPreview(await api.post<SkillImport>("/api/skills/imports", { path: path.trim() }));
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(false);
  }

  async function install() {
    if (!preview) return;
    setBusy(true);
    setError(undefined);
    try {
      const skill = await api.post<{ name: string }>(`/api/skills/imports/${preview.id}/confirm`, {});
      setPreview(undefined);
      setPath("");
      onInstalled(skill.name);
      onClose();
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(false);
  }

  return (
    <Modal open={open} onClose={close} glow="teal" boxClassName="max-w-2xl">
      <h3 className="text-lg font-semibold">Import a skill</h3>
      <p className="py-2 text-sm opacity-70">
        Give the full path of a folder that has a SKILL.md at its top level. Only text files are accepted. Nothing is installed until you confirm.
      </p>

      {!preview ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void review();
          }}
        >
          <input
            className="input input-sm w-full"
            placeholder="/home/you/skills/my-skill"
            value={path}
            onInput={(e) => setPath((e.target as HTMLInputElement).value)}
          />
          <div className="modal-action">
            <button type="button" className="btn btn-sm" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !path.trim()}>
              {busy && <span className="loading loading-spinner loading-xs" />}
              Review
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          <p>
            <strong>{preview.name}</strong>: {preview.description}
          </p>
          <p className="opacity-70">Files: {preview.files.join(", ")}</p>
          {preview.replaces !== null && (
            <p className="text-warning">A skill named {preview.name} is installed. Installing replaces it. Chats that had it enabled keep it enabled.</p>
          )}
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-box bg-base-300/60 p-3 text-xs">{preview.skillMd}</pre>
          <div className="modal-action">
            <button type="button" className="btn btn-sm" onClick={close}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={install}>
              {busy && <span className="loading loading-spinner loading-xs" />}
              Install skill
            </button>
          </div>
        </div>
      )}

      <ErrorAlert message={error} className="mt-3" />
    </Modal>
  );
}
