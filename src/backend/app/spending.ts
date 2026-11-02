import { randomUUID } from "node:crypto";
import { AppError } from "./errors.js";
import { getSpendingEntry, insertSpendingEntry, listSpendingEntries, type SpendingEntry } from "../storage/spending.js";

// A category's name is short, so it fits in the list.
const MAX_CATEGORY = 40;
// A description is a line or two, so it stays short.
const MAX_DESCRIPTION = 200;
// An id is a UUID from here, or one a caller chose, so it stays short.
const MAX_ID = 64;

export function allSpending(): SpendingEntry[] {
  return listSpendingEntries();
}

// Saves an entry. With no id it is a new entry. With an id it replaces that entry, and keeps its first save time. A category typed in a
// different case than an existing one uses the existing name, so "food" and "Food" do not split.
export function saveSpendingEntry(input: unknown): SpendingEntry {
  const body = (input ?? {}) as { id?: unknown; kind?: unknown; category?: unknown; amount?: unknown; description?: unknown };
  const kind = body.kind === "income" || body.kind === "expense" ? body.kind : undefined;
  if (!kind) throw new AppError(400, "kind must be income or expense");
  const typed = String(body.category ?? "").trim();
  if (!typed) throw new AppError(400, "category is required");
  if (typed.length > MAX_CATEGORY) throw new AppError(400, `category must be ${MAX_CATEGORY} characters or fewer`);
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new AppError(400, "amount must be a number above 0");
  const description = String(body.description ?? "").trim();
  if (description.length > MAX_DESCRIPTION) throw new AppError(400, `description must be ${MAX_DESCRIPTION} characters or fewer`);
  const id = String(body.id ?? "").trim() || randomUUID();
  if (id.length > MAX_ID) throw new AppError(400, `id must be ${MAX_ID} characters or fewer`);

  const existing = getSpendingEntry(id);
  const category = listSpendingEntries().map((entry) => entry.category).find((name) => name.toLowerCase() === typed.toLowerCase()) ?? typed;
  const entry: SpendingEntry = { id, kind, category, amount, description, createdAt: existing?.createdAt ?? Date.now() };
  insertSpendingEntry(entry);
  return entry;
}
