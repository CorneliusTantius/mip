import { allBots, createBot, editBot, removeBot } from "../../app/bots.js";
import { ack, created, ok, readJson } from "../respond.js";
import { del, get, post, put, type Route } from "../router.js";

// Bots: named agents that share one room. Create, edit, and delete them here.
export const botRoutes: Route[] = [
  get("/api/bots", () => ok({ bots: allBots() })),
  post("/api/bots", async ({ req }) => created(await createBot(await readJson(req)))),
  put("/api/bots/:botId", async ({ req, params }) => ok(await editBot(params.botId, await readJson(req)))),
  del("/api/bots/:botId", ({ params }) => {
    removeBot(params.botId);
    return ack();
  }),
];
