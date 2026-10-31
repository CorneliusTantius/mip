import type { NoteDetail } from "../../api/types";

// One note: its text, the notes it links to and the notes that link to it, and its tags. Each link opens its note.
export function NoteView({
  note,
  onEdit,
  onDelete,
  onOpen,
}: {
  note: NoteDetail;
  onEdit: () => void;
  onDelete: () => void;
  onOpen: (title: string) => void;
}) {
  return (
    <>
      <div className="flex items-center gap-2">
        <h3 className="mr-auto truncate text-base font-medium">{note.title}</h3>
        <button className="btn btn-sm" onClick={onEdit}>
          Edit
        </button>
        <button className="btn btn-sm btn-ghost" onClick={onDelete}>
          Delete
        </button>
      </div>
      <p className="whitespace-pre-wrap text-sm">{note.body}</p>

      <div className="flex flex-col gap-2 text-sm">
        <LinkRow label="Links to" titles={note.links} onOpen={onOpen} />
        <LinkRow label="Linked from" titles={note.backlinks} onOpen={onOpen} />
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
  );
}

// A labelled row of note titles. Each title opens its note.
function LinkRow({ label, titles, onOpen }: { label: string; titles: string[]; onOpen: (title: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="opacity-60">{label}</span>
      {titles.length === 0 && <span className="opacity-60">none</span>}
      {titles.map((title) => (
        <button key={title} className="btn btn-xs btn-outline" onClick={() => onOpen(title)}>
          {title}
        </button>
      ))}
    </div>
  );
}
