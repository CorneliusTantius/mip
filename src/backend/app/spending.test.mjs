// Checks spending entries: the kind, category, and amount rules, the category that keeps an existing spelling, and the newest-first list.
// Run after a build: node src/backend/app/spending.test.mjs. It sets MIP_HOME to a temporary folder before the modules load.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIST = pathToFileURL(fileURLToPath(new URL("../../../dist/backend/", import.meta.url))).href;
const root = mkdtempSync(join(tmpdir(), "mip-spending-"));
process.env.MIP_HOME = join(root, "mip-home");

try {
  const { addSpendingEntry, allSpending } = await import(`${DIST}app/spending.js`);
  const rejects = (input, message) => assert.throws(() => addSpendingEntry(input), (err) => err.status === 400 && err.message === message);

  // Money in and out, each with a category and an amount.
  const salary = addSpendingEntry({ kind: "income", category: "Salary", amount: 5000000 });
  assert.equal(salary.kind, "income");
  assert.equal(salary.amount, 5000000);

  // A category typed in another case keeps the spelling already used, so the totals do not split.
  addSpendingEntry({ kind: "expense", category: "Food", amount: 25000 });
  const lower = addSpendingEntry({ kind: "expense", category: " food ", amount: 15000 });
  assert.equal(lower.category, "Food");

  // Refused: a kind other than income or expense, a missing or long category, and an amount that is not a number above 0.
  rejects({ kind: "transfer", category: "x", amount: 1 }, "kind must be income or expense");
  rejects({ kind: "expense", category: "   ", amount: 1 }, "category is required");
  rejects({ kind: "expense", category: "x".repeat(41), amount: 1 }, "category must be 40 characters or fewer");
  rejects({ kind: "expense", category: "Gas", amount: 0 }, "amount must be a number above 0");
  rejects({ kind: "expense", category: "Gas", amount: "abc" }, "amount must be a number above 0");

  // The list is newest first, and a refused entry is not kept.
  const entries = allSpending();
  assert.equal(entries.length, 3);
  assert.equal(entries[0].category, "Food");
  assert.equal(entries[2].category, "Salary");

  console.log("spending tests passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}
