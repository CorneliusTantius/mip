import { addSpendingEntry, allSpending } from "../../app/spending.js";
import { created, ok, readJson } from "../respond.js";
import { get, post, type Route } from "../router.js";

// Spending: the entries entered by hand. The card totals them and lists the categories from the entries themselves.
export const spendingRoutes: Route[] = [
  get("/api/spending", () => ok({ entries: allSpending() })),
  post("/api/spending", async ({ req }) => created(addSpendingEntry(await readJson(req)))),
];
