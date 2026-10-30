import { useEffect, useRef } from "preact/hooks";

// A yes-or-no question inside the page. The browser's own confirm() box can be blocked, and then a delete button seems dead.
export function ConfirmDialog({
  open,
  title,
  message,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);

  return (
    <dialog ref={dialog} className="modal" onClose={onCancel}>
      <div className="modal-box">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="py-4 text-sm opacity-80">{message}</p>
        {error && (
          <div role="alert" className="alert alert-error mb-4">
            <span>{error}</span>
          </div>
        )}
        <div className="modal-action">
          <button className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-error" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>
  );
}
