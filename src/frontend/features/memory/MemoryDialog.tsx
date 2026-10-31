import { useEffect, useState } from "preact/hooks";
import { api, ApiError, errorText } from "../../api/client";
import type { NoteDetail, NoteItem } from "../../api/types";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { ErrorAlert } from "../../ui/ErrorAlert";
import { Modal } from "../../ui/Modal";
import { NoteEditor } from "./NoteEditor";
import { NoteList } from "./NoteList";
import { NoteView } from "./NoteView";

// The note editor's state. `id` changes for each new edit, so the editor starts with fresh fields.
interface EditorState {
  id: number;
  title: string;
  body: string;
  // An existing note keeps its title, which is its identity.
  locked: boolean;
}

let editorIds = 0;

// The memory screen: search, read, create, edit, and delete the shared notes.
// `initial` is a note to show when the screen opens, such as a dot the user clicked on the graph.
export function MemoryDialog({ open, initial, onClose, onChange }: { open: boolean; initial?: string; onClose: () => void; onChange?: () => void }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<NoteItem[]>([]);
  const [note, setNote] = useState<NoteDetail>();
  // A title that is linked to but has no note yet.
  const [missing, setMissing] = useState<string>();
  const [selected, setSelected] = useState<string>();
  const [editor, setEditor] = useState<EditorState>();
  const [askingDelete, setAskingDelete] = useState(false);
  const [error, setError] = useState<string>();

  const loadItems = (search: string) =>
    api.get<{ notes: NoteItem[] }>(`/api/memory?q=${encodeURIComponent(search)}`).then((data) => setItems(data.notes));

  // Each time the screen opens, it shows the requested note, or starts empty.
  useEffect(() => {
    if (!open) return;
    if (initial) {
      openNote(initial);
    } else {
      setEditor(undefined);
      setSelected(undefined);
      setNote(undefined);
      setMissing(undefined);
    }
  }, [open]);

  // Search as you type. The list waits briefly after each keystroke.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => loadItems(query), 200);
    return () => clearTimeout(timer);
  }, [open, query]);

  function openNote(title: string) {
    setEditor(undefined);
    setError(undefined);
    setSelected(title);
    setMissing(undefined);
    api.get<NoteDetail>(`/api/memory/${encodeURIComponent(title)}`).then(
      (data) => setNote(data),
      (err: unknown) => {
        if (err instanceof ApiError && err.status === 404) {
          setNote(undefined);
          setMissing(title);
        }
      },
    );
  }

  function startNew(title = "") {
    setSelected(undefined);
    setNote(undefined);
    setMissing(undefined);
    setError(undefined);
    setEditor({ id: ++editorIds, title, body: "", locked: false });
  }

  function startEdit() {
    if (!note) return;
    setError(undefined);
    setEditor({ id: ++editorIds, title: note.title, body: note.body, locked: true });
  }

  async function save(title: string, body: string) {
    setError(undefined);
    let saved: { title: string };
    try {
      saved = await api.post("/api/memory", { title, body });
    } catch (err) {
      return setError(errorText(err));
    }
    loadItems(query);
    onChange?.();
    openNote(saved.title);
  }

  async function forget() {
    if (!note) return;
    setAskingDelete(false);
    try {
      await api.del(`/api/memory/${encodeURIComponent(note.title)}`);
    } catch (err) {
      return setError(errorText(err));
    }
    setNote(undefined);
    setSelected(undefined);
    loadItems(query);
    onChange?.();
  }

  return (
    <>
      <Modal open={open} onClose={onClose} closeButton boxClassName="flex h-[min(36rem,80vh)] max-w-4xl flex-col">
        <div className="mb-4 flex items-center gap-2 pr-10">
          <h2 className="mr-auto text-lg font-semibold">Memory</h2>
          <button className="btn btn-primary btn-sm" onClick={() => startNew()}>
            + New note
          </button>
        </div>

        <div className="flex min-h-0 flex-1 gap-4">
          <NoteList items={items} selected={selected} query={query} onQuery={setQuery} onOpen={openNote} />

          <div key={selected ?? "none"} className="mip-fade flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto">
            <ErrorAlert message={error} />

            {editor && (
              <NoteEditor
                key={editor.id}
                title={editor.title}
                body={editor.body}
                titleLocked={editor.locked}
                onSave={save}
                onCancel={() => setEditor(undefined)}
              />
            )}

            {!editor && note && <NoteView note={note} onEdit={startEdit} onDelete={() => setAskingDelete(true)} onOpen={openNote} />}

            {!editor && !note && missing && (
              <div className="flex flex-col items-start gap-2">
                <p className="text-sm opacity-70">No note called "{missing}" yet.</p>
                <button className="btn btn-sm" onClick={() => startNew(missing)}>
                  Create it
                </button>
              </div>
            )}

            {!editor && !note && !missing && <p className="m-auto text-sm opacity-60">Pick a note, or create one.</p>}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={askingDelete}
        title="Delete this note?"
        message={`"${note?.title ?? ""}" is removed. Notes that link to it keep their links.`}
        onConfirm={forget}
        onCancel={() => setAskingDelete(false)}
      />
    </>
  );
}
