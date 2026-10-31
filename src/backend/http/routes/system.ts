import type { IncomingMessage } from "node:http";
import { AppError } from "../../app/errors.js";
import { pullLatest, restartMip } from "../../app/system.js";
import { accepted, ok, readJson } from "../respond.js";
import { post, type Route } from "../router.js";

// Update and restart run git and npm on this machine, so they accept only JSON requests. A page on another site can send
// a JSON request only after a preflight, and this server does not answer preflights, so only the dashboard can reach them.
function requireJson(req: IncomingMessage): void {
  if (!String(req.headers["content-type"] ?? "").includes("application/json")) {
    throw new AppError(415, "send this request as JSON");
  }
}

// Keeping the server in step with the code: pull the latest commits, or restart to install, build, and run them.
export const systemRoutes: Route[] = [
  post("/api/system/update", async ({ req }) => {
    requireJson(req);
    await readJson(req);
    return ok({ output: await pullLatest() });
  }),
  post("/api/system/restart", async ({ req }) => {
    requireJson(req);
    await readJson(req);
    restartMip();
    return accepted({ restarting: true });
  }),
];
