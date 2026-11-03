import type { ToolSpec } from "../../adapters/contract.js";
import { allSpending, saveSpendingEntry } from "../spending.js";
import type { SpendingEntry } from "../../storage/spending.js";
import { ok } from "./result.js";

// Read-only tool over the spending entries. It never adds, edits, or removes one. What it reads goes to the model, so a run sees the
// money the user has entered. Adding entries is a separate, approved step and is not offered here.

const MAX_RECENT = 50;
const DEFAULT_RECENT = 10;

function clampCount(value: unknown): number {
  const count = Math.floor(Number(value));
  return Number.isFinite(count) && count >= 1 ? Math.min(count, MAX_RECENT) : DEFAULT_RECENT;
}

// The sum of the entries of one kind.
function sumOf(entries: SpendingEntry[], kind: SpendingEntry["kind"]): number {
  return entries.filter((entry) => entry.kind === kind).reduce((total, entry) => total + entry.amount, 0);
}

export const spendingListTool: ToolSpec = {
  name: "spending_list",
  guide: "Reads the spending entries: the income, expense, and balance totals, the total for each category, and the newest entries with their dates and descriptions. Filter by category or kind. Use it when the user asks how much was spent or earned, or on what. It never changes an entry.",
  description: "Read the spending entries: totals, totals per category, and the newest entries. Read-only.",
  inputSchema: {
    type: "object",
    properties: {
      category: { type: "string", description: "Only entries in this category, in any case. Can be left out" },
      kind: { type: "string", enum: ["income", "expense"], description: "Only income or only expense. Can be left out" },
      count: { type: "number", description: `How many recent entries to list. At most ${MAX_RECENT}. Default ${DEFAULT_RECENT}` },
    },
  },
  async run({ category, kind, count }) {
    const wanted = String(category ?? "").trim().toLowerCase();
    const entries = allSpending().filter(
      (entry) => (!wanted || entry.category.toLowerCase() === wanted) && (!kind || entry.kind === kind),
    );
    if (entries.length === 0) return ok("No spending entries match.");

    const income = sumOf(entries, "income");
    const expense = sumOf(entries, "expense");
    const totals = [`Income ${income}`, `Expense ${expense}`, `Balance ${income - expense}`];

    // One line per category and kind, largest first.
    const groups = new Map<string, number>();
    for (const entry of entries) {
      const key = `${entry.category} (${entry.kind})`;
      groups.set(key, (groups.get(key) ?? 0) + entry.amount);
    }
    const perCategory = [...groups.entries()].sort((a, b) => b[1] - a[1]).map(([key, total]) => `${key}: ${total}`);

    const recent = [...entries]
      .slice(0, clampCount(count))
      .map((entry) => {
        const note = entry.description ? ` | ${entry.description}` : "";
        return `${entry.id} | ${entry.entryDate} | ${entry.kind} | ${entry.category} | ${entry.amount}${note}`;
      });

    return ok([totals.join(" | "), "", "By category:", ...perCategory, "", "Newest entries:", ...recent].join("\n"));
  },
};

// Adds a spending entry, or changes one by its id. Agents only: bots read the entries and do not write them.
export const spendingUpsertTool: ToolSpec = {
  name: "spending_upsert",
  guide: "Adds a spending entry, or changes one when id is given. Use the id that spending_list or an earlier result gives. Give the kind (income or expense), the category, the amount above 0, and an optional description. The date is the day the money moved, as YYYY-MM-DD; leave it out for today. Use it when the user reports money in or out, or asks to correct an entry. The result gives the entry's id.",
  description: "Add a spending entry, or change one by id. Writes the spending entries.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "The entry to change. Leave out to add a new entry" },
      kind: { type: "string", enum: ["income", "expense"], description: "Money in or money out" },
      category: { type: "string", description: "A name already used, or a new one" },
      amount: { type: "number", description: "Above 0" },
      description: { type: "string", description: "Optional, 200 characters at most" },
      date: { type: "string", description: "The day the entry is for, as YYYY-MM-DD. Leave out for today, or to keep an edited entry's day" },
    },
    required: ["kind", "category", "amount"],
  },
  async run(input) {
    const entry = saveSpendingEntry(input);
    return ok(`Saved ${entry.id}: ${entry.kind} | ${entry.entryDate} | ${entry.category} | ${entry.amount}${entry.description ? ` | ${entry.description}` : ""}`);
  },
};
