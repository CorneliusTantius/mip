import { chooseAccount, startSync, syncStatus } from "../../app/sync/engine.js";
import { accepted, ok, readJson, requireJson } from "../respond.js";
import { get, post, put, type Route } from "../router.js";

// GitHub sync: the accounts gh is signed in to, the one that sync uses, and the sync runs. Changes need JSON, like the other
// routes that act on this machine.
export const syncRoutes: Route[] = [
  get("/api/sync", async () => ok(await syncStatus())),
  put("/api/sync/account", async ({ req }) => {
    requireJson(req);
    const body = await readJson(req);
    return ok(await chooseAccount(String(body.login ?? "")));
  }),
  post("/api/sync/run", async ({ req }) => {
    requireJson(req);
    await readJson(req);
    return accepted(await startSync());
  }),
];
