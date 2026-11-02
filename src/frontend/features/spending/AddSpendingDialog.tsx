import { useState } from "preact/hooks";
import { errorText } from "../../api/client";
import type { NewSpendingEntry } from "../../api/types";
import { ErrorAlert } from "../../ui/ErrorAlert";
import { Modal } from "../../ui/Modal";

// The form that adds an entry: income or expense, a category, and an amount. A category typed as a new name becomes a new category.
export function AddSpendingDialog({
  open,
  categories,
  onClose,
  onAdd,
}: {
  open: boolean;
  categories: string[];
  onClose: () => void;
  onAdd: (entry: NewSpendingEntry) => Promise<void>;
}) {
  const [kind, setKind] = useState<NewSpendingEntry["kind"]>("expense");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  function close() {
    setKind("expense");
    setCategory("");
    setAmount("");
    setDescription("");
    setError(undefined);
    onClose();
  }

  async function submit(e: Event) {
    e.preventDefault();
    setError(undefined);
    setBusy(true);
    try {
      await onAdd({ kind, category, amount: Number(amount), description });
      close();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={close} glow="green">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <h3 className="text-lg font-semibold">Add entry</h3>

        <div className="join w-full" role="group" aria-label="Kind">
          {(["expense", "income"] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={`join-item btn btn-sm flex-1 ${kind === option ? "btn-primary" : "btn-ghost"}`}
              aria-pressed={kind === option}
              onClick={() => setKind(option)}
            >
              {option === "expense" ? "Expense" : "Income"}
            </button>
          ))}
        </div>

        <label className="flex flex-col gap-1 text-sm">
          Category
          <input
            className="input input-sm w-full"
            list="spending-categories"
            placeholder="Food, Salary, Transport…"
            value={category}
            onInput={(e) => setCategory((e.target as HTMLInputElement).value)}
          />
          <datalist id="spending-categories">
            {categories.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <span className="text-xs opacity-60">A name you have not used before makes a new category.</span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Amount
          <input
            className="input input-sm w-full"
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            placeholder="0"
            value={amount}
            onInput={(e) => setAmount((e.target as HTMLInputElement).value)}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Description <span className="opacity-60">(optional)</span>
          <input
            className="input input-sm w-full"
            placeholder="What it was for"
            maxLength={200}
            value={description}
            onInput={(e) => setDescription((e.target as HTMLInputElement).value)}
          />
        </label>

        <ErrorAlert message={error} />

        <div className="modal-action">
          <button type="button" className="btn" onClick={close}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy && <span className="loading loading-spinner loading-xs" />}
            Add
          </button>
        </div>
      </form>
    </Modal>
  );
}
