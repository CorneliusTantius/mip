import { readRun, startRun } from "../../app/runs.js";
import { accepted, ok, readJson } from "../respond.js";
import { get, post, type Route } from "../router.js";

// A run goes on in the background. POST returns its id, and its events are read with ?after=<last sequence seen>.
export const runRoutes: Route[] = [
  post("/api/run", async ({ req }) => {
    const body = await readJson(req);
    return accepted({ runId: startRun({ agentId: String(body.agentId ?? ""), prompt: String(body.prompt ?? "") }) });
  }),
  get("/api/runs/:runId/events", ({ params, url }) => ok(readRun(params.runId, Number(url.searchParams.get("after") ?? 0)))),
];
