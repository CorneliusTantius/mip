import { allAgents, chooseAgentSkills, createAgent, getAgentDetail, removeAgent, updateAgent } from "../../app/agents.js";
import { ack, created, ok, readJson } from "../respond.js";
import { del, get, patch, post, put, type Route } from "../router.js";

// Agents: list, create (with a persona), open, rename or change settings, choose skills, and delete.
export const agentRoutes: Route[] = [
  get("/api/agents", () => ok({ agents: allAgents() })),
  post("/api/agents", async ({ req }) => {
    const body = await readJson(req);
    return created(createAgent(body.providerId, body.personaId));
  }),
  get("/api/agents/:agentId", ({ params }) => ok(getAgentDetail(params.agentId))),
  patch("/api/agents/:agentId", async ({ req, params }) => ok(await updateAgent(params.agentId, await readJson(req)))),
  put("/api/agents/:agentId/skills", async ({ req, params }) => {
    const body = await readJson(req);
    return ok({ skills: chooseAgentSkills(params.agentId, body.skills) });
  }),
  del("/api/agents/:agentId", ({ params }) => {
    removeAgent(params.agentId);
    return ack();
  }),
];
