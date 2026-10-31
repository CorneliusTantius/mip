import { postToRoom, roomMessages, roomStatus } from "../../app/room.js";
import { accepted, ok, readJson } from "../respond.js";
import { get, post, type Route } from "../router.js";

// The shared room. Read it with ?after=<last message id you have>. Post with /api/room/messages.
export const roomRoutes: Route[] = [
  get("/api/room", ({ url }) => ok({ messages: roomMessages(Number(url.searchParams.get("after") ?? 0)), ...roomStatus() })),
  post("/api/room/messages", async ({ req }) => accepted(postToRoom(await readJson(req)))),
];
