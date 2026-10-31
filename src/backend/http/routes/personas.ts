import { allPersonas, createPersona, editPersona, makeDefaultPersona, removePersona } from "../../app/personas.js";
import { ack, created, ok, readJson } from "../respond.js";
import { del, get, post, put, type Route } from "../router.js";

// Personas: the system prompts an agent can use. Exactly one is the default for new agents.
export const personaRoutes: Route[] = [
  get("/api/personas", () => ok({ personas: allPersonas() })),
  post("/api/personas", async ({ req }) => {
    const body = await readJson(req);
    return created(createPersona(body.name, body.systemPrompt));
  }),
  put("/api/personas/:personaId", async ({ req, params }) => {
    const body = await readJson(req);
    return ok(editPersona(params.personaId, body.name, body.systemPrompt));
  }),
  del("/api/personas/:personaId", ({ params }) => {
    removePersona(params.personaId);
    return ack();
  }),
  post("/api/personas/:personaId/default", ({ params }) => {
    makeDefaultPersona(params.personaId);
    return ack();
  }),
];
