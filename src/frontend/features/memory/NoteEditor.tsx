import { useState } from "preact/hooks";

// The form to write or change a note. The title can't change once the note exists, because the title is its identity.
export function NoteEditor({
  title: initialTitle,
  body: initialBody,
  titleLocked,
  onSave,
  onCancel,
}: {
  title: string;
  body: string;
  titleLocked: boolean;
  onSave: (title: string, body: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);

  return (
    <>
      <fieldset className="fieldset">
        <legend className="fieldset-legend">Title</legend>
        <input
          className="input w-full"
          value={title}
          disabled={titleLocked}
          placeholder="For example: Sphinx"
          onInput={(e) => setTitle(e.currentTarget.value)}
        />
      </fieldset>
      <fieldset className="fieldset min-h-0 flex-1">
        <legend className="fieldset-legend">Text</legend>
        <textarea
          className="textarea h-full min-h-48 w-full font-mono text-sm"
          placeholder="Link notes with [[Title]] and tag with #tag"
          value={body}
          onInput={(e) => setBody(e.currentTarget.value)}
        />
      </fieldset>
      <div className="flex justify-end gap-2">
        <button className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={!title.trim() || !body.trim()} onClick={() => onSave(title, body)}>
          Save
        </button>
      </div>
    </>
  );
}
