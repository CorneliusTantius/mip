import { useState } from "preact/hooks";
import type { SpendingEntry } from "../../api/types";
import { Card, CardBody, ExpandButton, useCardExpansion } from "../../ui/Card";
import { ErrorAlert } from "../../ui/ErrorAlert";
import { AddSpendingDialog } from "./AddSpendingDialog";
import { useSpending } from "./useSpending";

// Money in and out, entered by hand. The card totals income, expense, and the balance, and lists the entries, newest first. Add entry
// opens a form. The categories are the names already used, so a new name makes a new one.
export function SpendingCard() {
  return (
    <Card glow="green">
      <SpendingBody />
    </Card>
  );
}

function SpendingBody() {
  const { expanded } = useCardExpansion();
  const { entries, error, add } = useSpending();
  const [adding, setAdding] = useState(false);
  const list = entries ?? [];
  const income = sumOf(list, "income");
  const expense = sumOf(list, "expense");
  const categories = [...new Set(list.map((entry) => entry.category))].sort((a, b) => a.localeCompare(b));

  return (
    <CardBody
      title="Spending"
      className={expanded ? "min-h-0 flex-1" : ""}
      actions={
        <>
          <button className="btn btn-ghost btn-sm" onClick={() => setAdding(true)}>
            Add entry
          </button>
          <ExpandButton />
        </>
      }
    >
      <ErrorAlert message={error} />

      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <Stat label="Income" value={income} tone="text-success" />
        <Stat label="Expense" value={expense} tone="text-error" />
        <Stat label="Balance" value={income - expense} />
      </div>

      {entries && list.length === 0 && <div className="py-4 text-center text-sm opacity-60">No entries yet. Press Add entry to record one.</div>}

      {list.length > 0 && (
        <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          {list.map((entry) => (
            <Row key={entry.id} entry={entry} />
          ))}
        </ul>
      )}

      <AddSpendingDialog open={adding} categories={categories} onClose={() => setAdding(false)} onAdd={add} />
    </CardBody>
  );
}

function Row({ entry }: { entry: SpendingEntry }) {
  const income = entry.kind === "income";
  return (
    <li className="flex items-center gap-2 text-sm">
      <span className={`badge badge-sm ${income ? "badge-success" : "badge-error"}`}>{income ? "Income" : "Expense"}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{entry.category}</span>
        {entry.description && <span className="block truncate text-xs opacity-60">{entry.description}</span>}
      </span>
      <span className="opacity-60">{new Date(entry.createdAt).toLocaleDateString()}</span>
      <span className={`font-medium tabular-nums ${income ? "text-success" : "text-error"}`}>
        {income ? "+" : "-"}
        {entry.amount.toLocaleString()}
      </span>
    </li>
  );
}

function Stat({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-box bg-base-300/50 p-2">
      <div className="text-xs opacity-60">{label}</div>
      <div className={`font-semibold tabular-nums ${tone}`}>{value.toLocaleString()}</div>
    </div>
  );
}

function sumOf(entries: SpendingEntry[], kind: SpendingEntry["kind"]): number {
  return entries.filter((entry) => entry.kind === kind).reduce((total, entry) => total + entry.amount, 0);
}
