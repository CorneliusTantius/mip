import { pullLatest, restartMip } from "../../app/system.js";
import { accepted, ok, readJson } from "../respond.js";
import { post, type Route } from "../router.js";

// Keeping the server in step with the code: pull the latest commits, or restart to install, build, and run them.
export const systemRoutes: Route[] = [
  post("/api/system/update", async ({ req }) => {
    await readJson(req);
    return ok({ output: await pullLatest() });
  }),
  post("/api/system/restart", async ({ req }) => {
    await readJson(req);
    restartMip();
    return accepted({ restarting: true });
  }),
];
