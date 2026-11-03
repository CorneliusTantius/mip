import { randomUUID } from "node:crypto";
import { AppError } from "./errors.js";
import { getSpendingEntry, insertSpendingEntry, listSpendingEntries, localDate, type SpendingEntry } from "../storage/spending.js";

// A category's name is short, so it fits in the list.
const MAX_CATEGORY = 40;
// A description is a line or two, so it stays short.
const MAX_DESCRIPTION = 200;
// An id is a UUID from here, or one a caller chose, so it stays short.
const MAX_ID = 64;
// The day an entry is for, written as YYYY-MM-DD.
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function allSpending(): SpendingEntry[] {
  return listSpendingEntries();
}

// The day an entry is for. Blank or left out gives undefined, so the caller picks the default. A date that does not exist, such as
// 2026-02-30, is refused.
function entryDateOf(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  const real = DATE_PATTERN.test(text) && localDate(new Date(`${text}T12:00:00`).getTime()) === text;
  if (!real) throw new AppError(400, "date must be a real day as YYYY-MM-DD");
  return text;
}

// Saves an entry. With no id it is a new entry. With an id it replaces that entry, and keeps its first save time. The entry's day is the
// date given, or today for a new entry, or the entry's own day when an edit gives none. A category typed in a different case than an
// existing one uses the existing name, so "food" and "Food" do not split.
export function saveSpendingEntry(input: unknown): SpendingEntry {
  const body = (input ?? {}) as { id?: unknown; kind?: unknown; category?: unknown; amount?: unknown; description?: unknown; date?: unknown };
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
  const entryDate = entryDateOf(body.date) ?? existing?.entryDate ?? localDate(Date.now());
  const entry: SpendingEntry = { id, kind, category, amount, description, entryDate, createdAt: existing?.createdAt ?? Date.now() };
  insertSpendingEntry(entry);
  return entry;
}
