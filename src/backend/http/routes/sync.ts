import { connect, disconnect, saveClientId, startSync, syncStatus } from "../../app/sync/engine.js";
import { accepted, ack, ok, readJson, requireJson } from "../respond.js";
import { get, post, put, type Route } from "../router.js";

// GitHub sync: the sign-in, and the sync runs. Changes need JSON, like the other routes that act on this machine.
export const syncRoutes: Route[] = [
  get("/api/sync", () => ok(syncStatus())),
  put("/api/sync/client-id", async ({ req }) => {
    requireJson(req);
    const body = await readJson(req);
    saveClientId(String(body.clientId ?? ""));
    return ok(syncStatus());
  }),
  post("/api/sync/connect", async ({ req }) => {
    requireJson(req);
    await readJson(req);
    return accepted(await connect());
  }),
  post("/api/sync/disconnect", async ({ req }) => {
    requireJson(req);
    await readJson(req);
    disconnect();
    return ack();
  }),
  post("/api/sync/run", async ({ req }) => {
    requireJson(req);
    await readJson(req);
    return accepted(startSync());
  }),
];
