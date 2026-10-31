import type { Route } from "../router.js";
import { botRoutes } from "./bots.js";
import { memoryRoutes } from "./memory.js";
import { personaRoutes } from "./personas.js";
import { providerRoutes } from "./providers.js";
import { repoRoutes } from "./repos.js";
import { roomRoutes } from "./room.js";
import { runRoutes } from "./runs.js";
import { sessionRoutes } from "./sessions.js";
import { syncRoutes } from "./sync.js";
import { systemRoutes } from "./system.js";

// Every API route, grouped by domain. Each route is matched by its method and path, so the order does not change behavior.
// The Claude CLI's tool endpoint (/mcp) and the web build are served outside this list, in http/server.ts.
export const routes: Route[] = [
  ...providerRoutes,
  ...sessionRoutes,
  ...runRoutes,
  ...personaRoutes,
  ...botRoutes,
  ...roomRoutes,
  ...repoRoutes,
  ...memoryRoutes,
  ...syncRoutes,
  ...systemRoutes,
];
