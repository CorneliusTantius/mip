// Checks the spending tool: totals, the per-category lines, the newest entries, and the filters by category and kind. Run after a build:
// node src/backend/app/tools/financial.test.mjs. It sets MIP_HOME to a temporary folder before the modules load.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIST = pathToFileURL(fileURLToPath(new URL("../../../../dist/backend/", import.meta.url))).href;
const root = mkdtempSync(join(tmpdir(), "mip-financial-"));
process.env.MIP_HOME = join(root, "mip-home");

try {
  const { addSpendingEntry } = await import(`${DIST}app/spending.js`);
  const { spendingListTool } = await import(`${DIST}app/tools/financial.js`);

  // Nothing entered yet.
  assert.equal((await spendingListTool.run({}, {})).text, "No spending entries match.");

  addSpendingEntry({ kind: "income", category: "Salary", amount: 1000 });
  addSpendingEntry({ kind: "expense", category: "Food", amount: 300, description: "lunch" });
  addSpendingEntry({ kind: "expense", category: "Food", amount: 200 });
  addSpendingEntry({ kind: "expense", category: "Gas", amount: 50 });

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
  assert.equal(one.text.split("\n").filter((line) => /^\d{4}-\d{2}-\d{2} \|/.test(line)).length, 1);
  assert.equal((await spendingListTool.run({ category: "Travel" }, {})).text, "No spending entries match.");

  console.log("spending tool tests passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}
