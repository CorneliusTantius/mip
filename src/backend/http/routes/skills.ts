import { listSkills, loadSkill, removeSkill } from "../../app/skills/registry.js";
import { confirmImport, discardImport, stageImport } from "../../app/skills/imports.js";
import { ack, created, ok, readJson, requireJson } from "../respond.js";
import { del, get, post, type Route } from "../router.js";

// Skills: the installed ones, their text, and removal. Installing goes through an import that is reviewed before it is confirmed.
// Writes need JSON, like the other routes that change this machine.
export const skillRoutes: Route[] = [
  get("/api/skills", () => ok(listSkills())),
  get("/api/skills/:name", ({ params }) => ok(loadSkill(params.name))),
  del("/api/skills/:name", ({ params }) => {
    removeSkill(params.name);
    return ack();
  }),
  post("/api/skills/imports", async ({ req }) => {
    requireJson(req);
    const body = await readJson(req);
    return created(stageImport(String(body.path ?? "")));
  }),
  post("/api/skills/imports/:importId/confirm", async ({ req, params }) => {
    requireJson(req);
    await readJson(req);
    return ok(confirmImport(params.importId));
  }),
  del("/api/skills/imports/:importId", ({ params }) => {
    discardImport(params.importId);
    return ack();
  }),
];
