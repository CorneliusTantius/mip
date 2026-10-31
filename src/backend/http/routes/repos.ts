import { addRepo, copyRepoToChat, listRepoCards, pullAllRepos, removeRepo } from "../../app/repos.js";
import { ack, accepted, created, ok, readJson } from "../respond.js";
import { del, get, post, type Route } from "../router.js";

// Repositories: paste a clone link to add one, pull them all, copy one into a chat, or remove a master clone.
export const repoRoutes: Route[] = [
  get("/api/repos", async () => ok({ repos: await listRepoCards() })),
  post("/api/repos", async ({ req }) => accepted(addRepo((await readJson(req)).url))),
  post("/api/repos/pull", async () => ok({ results: await pullAllRepos() })),
  del("/api/repos/:repoId", ({ params }) => {
    removeRepo(params.repoId);
    return ack();
  }),
  post("/api/repos/:repoId/copies", async ({ req, params }) => {
    await copyRepoToChat(params.repoId, (await readJson(req)).sessionId);
    return created({ ok: true });
  }),
];
