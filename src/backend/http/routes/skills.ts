import { listSkills, loadSkill, removeSkill } from "../../app/skills/registry.js";
import { confirmImport, discardImport, stageImport } from "../../app/skills/imports.js";
import { createSkill } from "../../app/skills/create.js";
import { ack, created, ok, readJson } from "../respond.js";
import { del, get, post, type Route } from "../router.js";

// Skills: the installed ones, their text, removal, and two ways to add one: create it from a form, or import a folder that is
// reviewed before it is confirmed. Writes need JSON, like the other routes that change this machine.
export const skillRoutes: Route[] = [
  get("/api/skills", () => ok(listSkills())),
  get("/api/skills/:name", ({ params }) => ok(loadSkill(params.name))),
  del("/api/skills/:name", ({ params }) => {
    removeSkill(params.name);
    return ack();
  }),
  post("/api/skills", async ({ req }) => {
    return created(createSkill(await readJson(req)));
  }),
  post("/api/skills/imports", async ({ req }) => {
    const body = await readJson(req);
    return created(stageImport(String(body.path ?? "")));
  }),
  post("/api/skills/imports/:importId/confirm", async ({ req, params }) => {
    await readJson(req);
    return ok(confirmImport(params.importId));
  }),
  del("/api/skills/imports/:importId", ({ params }) => {
    discardImport(params.importId);
    return ack();
  }),
];
