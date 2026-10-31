import { startSync, syncStatus } from "../../app/sync/engine.js";
import { accepted, ok, readJson, requireJson } from "../respond.js";
import { get, post, type Route } from "../router.js";

// GitHub sync: the account in use, and the sync runs. A run changes data on GitHub, so it needs JSON, like the other routes that act on this machine.
export const syncRoutes: Route[] = [
  get("/api/sync", async () => ok(await syncStatus())),
  post("/api/sync/run", async ({ req }) => {
    requireJson(req);
    await readJson(req);
    return accepted(await startSync());
  }),
];
