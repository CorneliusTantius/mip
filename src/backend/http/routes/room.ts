import { allRooms, createRoom, editRoom, removeRoom } from "../../app/room/rooms.js";
import { postToRoom, roomMessages, roomStatus } from "../../app/room/room.js";
import { accepted, ack, created, ok, readJson } from "../respond.js";
import { del, get, post, put, type Route } from "../router.js";

// The bots' rooms. Each room has its own bots and its own messages. Read a room's messages with ?room=<id>&after=<last message id you have>.
// Post with /api/room/messages, giving the room's id and the text.
export const roomRoutes: Route[] = [
  get("/api/rooms", () => ok({ rooms: allRooms() })),
  post("/api/rooms", async ({ req }) => created(createRoom(await readJson(req)))),
  put("/api/rooms/:roomId", async ({ req, params }) => ok(editRoom(params.roomId, await readJson(req)))),
  del("/api/rooms/:roomId", ({ params }) => {
    removeRoom(params.roomId);
    return ack();
  }),
  get("/api/room", ({ url }) => {
    const roomId = url.searchParams.get("room") ?? "";
    return ok({ messages: roomMessages(roomId, Number(url.searchParams.get("after") ?? 0)), ...roomStatus(roomId) });
  }),
  post("/api/room/messages", async ({ req }) => accepted(postToRoom(await readJson(req)))),
];
