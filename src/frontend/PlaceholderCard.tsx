import { useRef } from "preact/hooks";

interface PlaceholderCardProps {
  title: string;
  summary: string;
}

// A card for a feature that is not built yet. It says what the feature will hold, and its button opens a dialog with the same note.
export function PlaceholderCard({ title, summary }: PlaceholderCardProps) {
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <section className="card bg-base-200/80">
      <div className="card-body">
        <h2 className="card-title">{title}</h2>
        <p className="py-6 text-center opacity-60">{summary}</p>
        <div className="card-actions justify-end">
          <button className="btn btn-sm" onClick={() => dialog.current?.showModal()}>
            Open
          </button>
        </div>
      </div>

      <dialog ref={dialog} className="modal">
        <div className="modal-box">
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="py-4 opacity-70">{summary} This is a placeholder, so nothing here works yet.</p>
          <div className="modal-action">
            <form method="dialog">
              <button className="btn">Close</button>
            </form>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>
    </section>
  );
}
