import { AppError } from "../../app/errors.js";
import { forgetNote, memoryGraph, memoryList, readNote, writeNote } from "../../app/memory.js";
import { ack, ok, readJson } from "../respond.js";
import { del, get, post, type Route } from "../router.js";

// Memory: notes shared by all agents. Saving a title that exists replaces that note.
// /api/graph has its own path, so a note titled "graph" still opens.
export const memoryRoutes: Route[] = [
  get("/api/graph", () => ok(memoryGraph())),
  get("/api/memory", ({ url }) => ok({ notes: memoryList(url.searchParams.get("q") ?? "") })),
  post("/api/memory", async ({ req }) => {
    const body = await readJson(req);
    return ok(writeNote(body.title, body.body));
  }),
  get("/api/memory/:title", ({ params }) => {
    const note = readNote(params.title);
    if (!note) throw new AppError(404, "no such note");
    return ok(note);
  }),
  del("/api/memory/:title", ({ params }) => {
    forgetNote(params.title);
    return ack();
  }),
];
