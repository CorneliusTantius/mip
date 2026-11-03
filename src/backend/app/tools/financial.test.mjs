// Checks the spending tool: totals, the per-category lines, the newest entries, and the filters by category and kind. Run after a build:
// node src/backend/app/tools/financial.test.mjs. It sets HOME to a temporary folder before the modules load.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIST = pathToFileURL(fileURLToPath(new URL("../../../../dist/backend/", import.meta.url))).href;
const root = mkdtempSync(join(tmpdir(), "mip-financial-"));
process.env.HOME = join(root, "home");

try {
  const { saveSpendingEntry } = await import(`${DIST}app/spending.js`);
  const { spendingListTool, spendingUpsertTool } = await import(`${DIST}app/tools/financial.js`);
  const { getSpendingEntry } = await import(`${DIST}storage/spending.js`);

  // Nothing entered yet.
  assert.equal((await spendingListTool.run({}, {})).text, "No spending entries match.");

  saveSpendingEntry({ kind: "income", category: "Salary", amount: 1000 });
  saveSpendingEntry({ kind: "expense", category: "Food", amount: 300, description: "lunch" });
  saveSpendingEntry({ kind: "expense", category: "Food", amount: 200 });
  saveSpendingEntry({ kind: "expense", category: "Gas", amount: 50 });

  // All entries: totals, one line per category and kind, the largest first, then the newest entries.
  const all = await spendingListTool.run({}, {});
  assert.equal(all.isError, false);
  assert.match(all.text, /^Income 1000 \| Expense 550 \| Balance 450/);
  const lines = all.text.split("\n");
  // Largest first: Salary (1000) before Food (500).
  assert.equal(lines[lines.indexOf("By category:") + 1], "Salary (income): 1000");
  assert.equal(lines[lines.indexOf("By category:") + 2], "Food (expense): 500");
  assert.match(all.text, /Newest entries:\n.*\| expense \| Gas \| 50/);
  assert.match(all.text, /\| expense \| Food \| 300 \| lunch/, "a description is listed with its entry");

  // Filters: a category in any case, and a kind. A count caps the newest entries.
  const food = await spendingListTool.run({ category: "food" }, {});
  assert.match(food.text, /^Income 0 \| Expense 500 \| Balance -500/);
  const income = await spendingListTool.run({ kind: "income" }, {});
  assert.match(income.text, /^Income 1000 \| Expense 0/);
  const one = await spendingListTool.run({ count: 1 }, {});
  assert.equal(one.text.split("\n").filter((line) => line.includes(" | income | ") || line.includes(" | expense | ")).length, 1);
  assert.equal((await spendingListTool.run({ category: "Travel" }, {})).text, "No spending entries match.");

  // Each listed entry starts with its id, so a change can name it.
  assert.match(all.text, /^[0-9a-f-]{36} \| \d{4}-\d{2}-\d{2} \| expense \| Gas/m);

  // spending_upsert adds an entry, then changes that entry when its id is given. The first save time is kept.
  const added = await spendingUpsertTool.run({ kind: "expense", category: "Travel", amount: 70 }, {});
  assert.equal(added.isError, false);
  const id = added.text.slice("Saved ".length).split(":")[0];
  const before = getSpendingEntry(id);
  const changed = await spendingUpsertTool.run({ id, kind: "expense", category: "travel", amount: 90, description: "bus" }, {});
  assert.match(changed.text, /^Saved /);
  const after = getSpendingEntry(id);
  assert.equal(after.amount, 90);
  assert.equal(after.category, "Travel", "a category in another case keeps the existing spelling");
  assert.equal(after.createdAt, before.createdAt);
  assert.equal((await spendingListTool.run({ category: "Travel" }, {})).text.split("\n")[0], "Income 0 | Expense 90 | Balance -90");

  // Refused: a bad kind or amount throws the same message as the app's own save.
  await assert.rejects(spendingUpsertTool.run({ kind: "transfer", category: "x", amount: 1 }, {}), /kind must be income or expense/);
  await assert.rejects(spendingUpsertTool.run({ kind: "expense", category: "x", amount: 0 }, {}), /amount must be a number above 0/);

  console.log("spending tool tests passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}
