import type { Glow } from "./Card";
import { ErrorAlert } from "./ErrorAlert";
import { Modal } from "./Modal";

// A yes-or-no question inside the page. The browser's own confirm() box can be blocked, and then a delete button seems dead.
// It takes the glow of the card it belongs to, so it matches that card's dialogs.
export function ConfirmDialog({
  open,
  title,
  message,
  error,
  glow,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  error?: string;
  glow?: Glow;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} glow={glow}>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="py-4 text-sm opacity-80">{message}</p>
      <ErrorAlert message={error} className="mb-4" />
      <div className="modal-action">
        <button className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-error" onClick={onConfirm}>
          Delete
        </button>
      </div>
    </Modal>
  );
}
