import { describeTools } from "../../app/tools/index.js";
import { ok } from "../respond.js";
import { get, type Route } from "../router.js";

// The tool registry: every tool the agents can use, and which kinds of run (agents, bots) may use each. Read only.
export const toolRoutes: Route[] = [get("/api/tools", () => ok({ tools: describeTools() }))];
