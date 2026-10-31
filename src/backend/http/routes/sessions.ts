import { createChat, deleteChat, getChat, listChats, updateChat } from "../../app/sessions.js";
import { ack, created, ok, readJson } from "../respond.js";
import { del, get, patch, post, type Route } from "../router.js";

// Chats: list, create (with a persona), open, rename or change settings, and delete.
export const sessionRoutes: Route[] = [
  get("/api/sessions", () => ok({ sessions: listChats() })),
  post("/api/sessions", async ({ req }) => {
    const body = await readJson(req);
    return created(createChat(body.providerId, body.personaId));
  }),
  get("/api/sessions/:sessionId", ({ params }) => ok(getChat(params.sessionId))),
  patch("/api/sessions/:sessionId", async ({ req, params }) => ok(await updateChat(params.sessionId, await readJson(req)))),
  del("/api/sessions/:sessionId", ({ params }) => {
    deleteChat(params.sessionId);
    return ack();
  }),
];
