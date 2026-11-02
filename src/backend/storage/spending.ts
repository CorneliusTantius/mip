import { db, type Row } from "./db.js";

// One entry: money in (income) or out (expense), in a category, for an amount.
export interface SpendingEntry {
  id: string;
  kind: "income" | "expense";
  category: string;
  amount: number;
  // Optional. An empty string when none was given.
  description: string;
  createdAt: number;
}

// The entries, newest first.
export function listSpendingEntries(): SpendingEntry[] {
  return (db.prepare("SELECT * FROM spending_entries ORDER BY created_at DESC, rowid DESC").all() as Row[]).map(toEntry);
}

// Adds an entry, or replaces the one with its id when sync brings an edited copy.
export function insertSpendingEntry(entry: SpendingEntry): void {
  db.prepare("INSERT OR REPLACE INTO spending_entries (id, kind, category, amount, description, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    entry.id,
    entry.kind,
    entry.category,
    entry.amount,
    entry.description,
    entry.createdAt,
  );
}

function toEntry(row: Row): SpendingEntry {
  return { id: row.id, kind: row.kind, category: row.category, amount: row.amount, description: row.description, createdAt: row.created_at };
}

export function getSpendingEntry(id: string): SpendingEntry | undefined {
  const row = db.prepare("SELECT * FROM spending_entries WHERE id = ?").get(id) as Row | undefined;
  return row ? toEntry(row) : undefined;
}

// Removes an entry. Sync does this when the copy on GitHub no longer has it.
export function removeSpendingEntry(id: string): boolean {
  return db.prepare("DELETE FROM spending_entries WHERE id = ?").run(id).changes > 0;
}
