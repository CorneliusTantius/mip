import { deleteAgent, getAgent, insertAgent, listAgents, listMessages, renameAgent, setAgentSettings, type Agent } from "../storage/agents.js";
import { enabledSkillNames } from "../storage/skills.js";
import { AppError } from "./errors.js";
import { pickAgentName } from "./names.js";
import { defaultPersona, hasPersona } from "./personas.js";
import { findProvider, hasProvider } from "./providers.js";
import { removeWorkspace } from "./tools/workspace.js";
import { activeRunId } from "./runs.js";
import { enabledSkills, setAgentSkills } from "./skills/registry.js";

// Every agent, with the names of the skills it has enabled.
export function allAgents(): (Agent & { skills: string[] })[] {
  return listAgents().map((agent) => ({ ...agent, skills: enabledSkillNames(agent.id) }));
}

// A new agent gets a random agent name that no other agent has. The persona is fixed for the agent's life.
export function createAgent(providerId: unknown, personaId: unknown = defaultPersona().id): Agent {
  if (typeof providerId !== "string" || !hasProvider(providerId)) throw new AppError(400, "unknown provider");
  if (typeof personaId !== "string" || !hasPersona(personaId)) throw new AppError(400, "unknown persona");
  const taken = new Set(listAgents().map((s) => s.title));
  return insertAgent(providerId, personaId, pickAgentName(taken));
}

// An agent with its messages, the id of the run still going in it (if any), and the names of the skills it has enabled.
export function getAgentDetail(id: string) {
  return {
    agent: requireAgent(id),
    messages: listMessages(id),
    activeRunId: activeRunId(id),
    skills: enabledSkills(id).map((skill) => skill.name),
  };
}

// Replaces the skills an agent has enabled. Each name must be an installed skill.
export function chooseAgentSkills(id: string, names: unknown): string[] {
  requireAgent(id);
  if (!Array.isArray(names) || !names.every((name) => typeof name === "string")) throw new AppError(400, "skills must be a list of names");
  return setAgentSkills(id, names);
}

// Renames an agent and/or sets its model and thinking level. Empty values mean the provider's default.
// The model must be one the provider lists, and the thinking level one that model accepts.
// The model and thinking level apply to the next message, and the agent keeps them.
export async function updateAgent(id: string, changes: { title?: unknown; model?: unknown; thinking?: unknown }): Promise<Agent> {
  const agent = requireAgent(id);
  if (changes.title !== undefined) {
    const title = String(changes.title ?? "").trim();
    if (!title) throw new AppError(400, "title is required");
    renameAgent(id, title);
  }
  if (changes.model !== undefined || changes.thinking !== undefined) {
    const model = changes.model === undefined ? agent.model : optionalText(changes.model);
    const catalog = await findProvider(agent.providerId).models();
    const option = catalog.find((m) => m.id === (model ?? ""));
    if (model && !option) throw new AppError(400, `this provider has no model "${model}"`);

    const levels: readonly string[] = option?.thinkingLevels ?? [];
    let thinking = changes.thinking === undefined ? agent.thinking : optionalText(changes.thinking);
    if (thinking && !levels.includes(thinking)) {
      // A new model may not have the level the agent had. Clear it. A level picked directly must be valid.
      if (changes.thinking !== undefined) throw new AppError(400, `this model has no thinking level "${thinking}"`);
      thinking = null;
    }
    setAgentSettings(id, model, thinking);
  }
  return getAgent(id)!;
}

function optionalText(value: unknown): string | null {
  return String(value ?? "").trim() || null;
}

// Deletes an agent, its messages, and its workspace with any repository copies in it.
export function removeAgent(id: string): void {
  requireAgent(id);
  if (activeRunId(id)) throw new AppError(409, "this agent is still running");
  deleteAgent(id);
  removeWorkspace(id);
}

function requireAgent(id: string): Agent {
  const agent = getAgent(id);
  if (!agent) throw new AppError(404, "no such agent");
  return agent;
}
