import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { Icon } from "./Icon";

interface ModalProps {
  // Opens or closes the dialog. The browser handles Escape, focus, and the backdrop.
  open: boolean;
  // Called when the dialog closes for any reason, including the browser's own Escape or backdrop.
  onClose?: () => void;
  // Shows the round close button in the top-right corner.
  closeButton?: boolean;
  // Extra classes for the box, such as its size.
  boxClassName?: string;
  children: ComponentChildren;
}

// The browser's modal dialog, opened and closed by the `open` prop. It closes when unmounted too.
export function Modal({ open, onClose, closeButton = false, boxClassName = "", children }: ModalProps) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialog.current!;
    if (open) el.showModal();
    return () => el.close();
  }, [open]);

  return (
    <dialog ref={dialog} className="modal" onClose={onClose}>
      <div className={`modal-box ${closeButton ? "relative" : ""} ${boxClassName}`}>
        {closeButton && (
          <form method="dialog">
            <button className="btn btn-sm btn-circle btn-ghost absolute right-3 top-3" aria-label="Close">
              <Icon name="close" />
            </button>
          </form>
        )}
        {children}
      </div>
      <form method="dialog" className="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>
  );
}
