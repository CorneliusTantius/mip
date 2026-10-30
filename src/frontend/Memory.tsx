import { useEffect, useRef, useState } from "preact/hooks";
import { ConfirmDialog } from "./ConfirmDialog";

// A row in the list. Search results also carry a snippet.
interface NoteItem {
  id: string;
  title: string;
  snippet?: string;
}

// One note with what it links to, what links to it, and its tags.
interface Note {
  title: string;
  body: string;
  links: string[];
  backlinks: string[];
  tags: string[];
}

const JSON_HEADERS = { "Content-Type": "application/json" };

// The shared memory: every agent's notes. Search, read, write, and delete them here.
// `initial` is a note to show when the screen opens, such as a node the user clicked on the graph.
export function Memory({ open, initial, onClose, onChange }: { open: boolean; initial?: string; onClose: () => void; onChange?: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<NoteItem[]>([]);
  const [note, setNote] = useState<Note>();
  // A title that is linked but has no note yet.
  const [missing, setMissing] = useState<string>();
  const [selected, setSelected] = useState<string>();
  const [editing, setEditing] = useState(false);
  const [askingDelete, setAskingDelete] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [error, setError] = useState<string>();

  const loadItems = (search: string) =>
    fetch(`/api/memory?q=${encodeURIComponent(search)}`)
      .then((res) => res.json())
      .then((data) => setItems(data.notes));

  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    if (initial) {
      openNote(initial);
    } else {
      setEditing(false);
      setSelected(undefined);
      setNote(undefined);
      setMissing(undefined);
    }
    return () => dialog.current?.close();
  }, [open]);

  // Search as you type.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => loadItems(query), 200);
    return () => clearTimeout(timer);
  }, [open, query]);

  function openNote(title: string) {
    setEditing(false);
    setError(undefined);
    setSelected(title);
    setMissing(undefined);
    fetch(`/api/memory/${encodeURIComponent(title)}`).then(async (res) => {
      if (res.status === 404) {
        setNote(undefined);
        setMissing(title);
      } else {
        setNote(await res.json());
      }
    });
  }

  function startNew(title = "") {
    setSelected(undefined);
    setNote(undefined);
    setMissing(undefined);
    setDraftTitle(title);
    setDraftBody("");
    setError(undefined);
    setEditing(true);
  }

  function startEdit() {
    if (!note) return;
    setDraftTitle(note.title);
    setDraftBody(note.body);
    setError(undefined);
    setEditing(true);
  }

  async function save() {
    const res = await fetch("/api/memory", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ title: draftTitle, body: draftBody }) });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    loadItems(query);
    onChange?.();
    openNote(data.title);
  }

  async function forget() {
    if (!note) return;
    setAskingDelete(false);
    await fetch(`/api/memory/${encodeURIComponent(note.title)}`, { method: "DELETE" });
    setNote(undefined);
    setSelected(undefined);
    loadItems(query);
    onChange?.();
  }

  // A link or backlink. Opens the note, or offers to create it when it doesn't exist yet.
  const LinkButton = ({ title }: { title: string }) => (
    <button className="btn btn-xs btn-outline" onClick={() => openNote(title)}>
      {title}
    </button>
  );

  return (
    <dialog ref={dialog} className="modal" onClose={onClose}>
      <div className="modal-box relative flex h-[min(36rem,80vh)] max-w-4xl flex-col">
        <form method="dialog">
          <button className="btn btn-sm btn-circle btn-ghost absolute right-3 top-3" aria-label="Close">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </form>
        <div className="mb-4 flex items-center gap-2 pr-10">
          <h2 className="mr-auto text-lg font-semibold">Memory</h2>
          <button className="btn btn-primary btn-sm" onClick={() => startNew()}>
            + New note
          </button>
        </div>

        <div className="flex min-h-0 flex-1 gap-4">
          <div className="flex w-60 shrink-0 flex-col gap-2 border-r border-base-300 pr-4">
            <input className="input input-sm w-full" placeholder="Search notes" value={query} onInput={(e) => setQuery(e.currentTarget.value)} />
            <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
              {items.map((item) => (
                <li key={item.id}>
                  <button className={"btn btn-ghost btn-sm h-auto w-full min-w-0 justify-start py-1 text-left font-normal " + (item.title === selected ? "btn-active" : "")} onClick={() => openNote(item.title)}>
                    <span className="min-w-0">
                      <span className="block truncate">{item.title}</span>
                      {item.snippet && <span className="block truncate text-xs opacity-60">{item.snippet.replace(/\[|\]/g, "")}</span>}
                    </span>
                  </button>
                </li>
              ))}
              {items.length === 0 && <li className="text-sm opacity-60">{query ? "No notes match." : "No notes yet."}</li>}
            </ul>
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto">
            {error && <div role="alert" className="alert alert-error"><span>{error}</span></div>}

            {editing && (
              <>
                <fieldset className="fieldset">
                  <legend className="fieldset-legend">Title</legend>
                  <input className="input w-full" value={draftTitle} disabled={!!note} placeholder="For example: Sphinx" onInput={(e) => setDraftTitle(e.currentTarget.value)} />
                </fieldset>
                <fieldset className="fieldset min-h-0 flex-1">
                  <legend className="fieldset-legend">Text</legend>
                  <textarea
                    className="textarea h-full min-h-48 w-full font-mono text-sm"
                    placeholder="Link notes with [[Title]] and tag with #tag"
                    value={draftBody}
                    onInput={(e) => setDraftBody(e.currentTarget.value)}
                  />
                </fieldset>
                <div className="flex justify-end gap-2">
                  <button className="btn btn-ghost" onClick={() => setEditing(false)}>
                    Cancel
                  </button>
                  <button className="btn btn-primary" disabled={!draftTitle.trim() || !draftBody.trim()} onClick={save}>
                    Save
                  </button>
                </div>
              </>
            )}

            {!editing && note && (
              <>
                <div className="flex items-center gap-2">
                  <h3 className="mr-auto truncate text-base font-medium">{note.title}</h3>
                  <button className="btn btn-sm" onClick={startEdit}>
                    Edit
                  </button>
                  <button className="btn btn-sm btn-ghost" onClick={() => setAskingDelete(true)}>
                    Delete
                  </button>
                </div>
                <p className="whitespace-pre-wrap text-sm">{note.body}</p>
                <div className="flex flex-col gap-2 text-sm">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="opacity-60">Links to</span>
                    {note.links.length === 0 && <span className="opacity-60">none</span>}
                    {note.links.map((title) => <LinkButton key={title} title={title} />)}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="opacity-60">Linked from</span>
                    {note.backlinks.length === 0 && <span className="opacity-60">none</span>}
                    {note.backlinks.map((title) => <LinkButton key={title} title={title} />)}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="opacity-60">Tags</span>
                    {note.tags.length === 0 && <span className="opacity-60">none</span>}
                    {note.tags.map((tag) => (
                      <span key={tag} className="badge badge-outline">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              </>
            )}

            {!editing && !note && missing && (
              <div className="flex flex-col items-start gap-2">
                <p className="text-sm opacity-70">No note called "{missing}" yet.</p>
                <button className="btn btn-sm" onClick={() => startNew(missing)}>
                  Create it
                </button>
              </div>
            )}

            {!editing && !note && !missing && <p className="m-auto text-sm opacity-60">Pick a note, or create one.</p>}
          </div>
        </div>
      </div>

      <form method="dialog" className="modal-backdrop">
        <button>close</button>
      </form>

      <ConfirmDialog
        open={askingDelete}
        title="Delete this note?"
        message={`"${note?.title ?? ""}" is removed. Notes that link to it keep their links.`}
        onConfirm={forget}
        onCancel={() => setAskingDelete(false)}
      />
    </dialog>
  );
}
