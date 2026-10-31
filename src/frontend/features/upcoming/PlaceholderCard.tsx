import { useState } from "preact/hooks";
import { Card, CardBody, type Glow } from "../../ui/Card";
import { Modal } from "../../ui/Modal";

// A card for a feature that is not built yet. It says what the feature will hold, and its button opens a dialog with the same note.
export function PlaceholderCard({ title, summary, glow }: { title: string; summary: string; glow: Glow }) {
  const [open, setOpen] = useState(false);

  return (
    <Card glow={glow}>
      <CardBody title={title} className="">
        <p className="py-6 text-center opacity-60">{summary}</p>
        <div className="card-actions justify-end">
          <button className="btn btn-sm" onClick={() => setOpen(true)}>
            Open
          </button>
        </div>
      </CardBody>

      <Modal open={open} onClose={() => setOpen(false)} glow={glow}>
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="py-4 opacity-70">{summary} This is a placeholder, so nothing here works yet.</p>
        <div className="modal-action">
          <form method="dialog">
            <button className="btn">Close</button>
          </form>
        </div>
      </Modal>
    </Card>
  );
}
