import { db, type Row } from "./db.js";

// One entry: money in (income) or out (expense), in a category, for an amount.
export interface SpendingEntry {
  id: string;
  kind: "income" | "expense";
  category: string;
  amount: number;
  createdAt: number;
}

// The entries, newest first.
export function listSpendingEntries(): SpendingEntry[] {
  return (db.prepare("SELECT * FROM spending_entries ORDER BY created_at DESC, rowid DESC").all() as Row[]).map(toEntry);
}

export function insertSpendingEntry(entry: SpendingEntry): void {
  db.prepare("INSERT INTO spending_entries (id, kind, category, amount, created_at) VALUES (?, ?, ?, ?, ?)").run(
    entry.id,
    entry.kind,
    entry.category,
    entry.amount,
    entry.createdAt,
  );
}

function toEntry(row: Row): SpendingEntry {
  return { id: row.id, kind: row.kind, category: row.category, amount: row.amount, createdAt: row.created_at };
}
