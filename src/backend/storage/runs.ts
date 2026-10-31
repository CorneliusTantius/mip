import { db, type Row } from "./db.js";

// A run is one agent turn in an agent. Its events are saved as they arrive, so a page can pick them up later.
export function createRun(id: string, agentId: string): void {
  db.prepare("INSERT INTO runs (id, agent_id, status, started_at) VALUES (?, ?, 'running', ?)").run(id, agentId, Date.now());
}

export function getRun(id: string): { id: string; status: string } | undefined {
  return db.prepare("SELECT id, status FROM runs WHERE id = ?").get(id) as { id: string; status: string } | undefined;
}

// The run still going in an agent, if there is one. An agent has at most one.
export function activeRunForAgent(agentId: string): { id: string } | undefined {
  return db.prepare("SELECT id FROM runs WHERE agent_id = ? AND status = 'running'").get(agentId) as { id: string } | undefined;
}

export function setRunStatus(id: string, status: "done" | "error"): void {
  db.prepare("UPDATE runs SET status = ? WHERE id = ?").run(status, id);
}

export function appendRunEvent(runId: string, seq: number, event: unknown): void {
  db.prepare("INSERT INTO run_events (run_id, seq, event) VALUES (?, ?, ?)").run(runId, seq, JSON.stringify(event));
}

// Events after a sequence number, in order, so a client can pick up where it stopped.
export function listRunEvents(runId: string, after: number): { seq: number; event: unknown }[] {
  const rows = db.prepare("SELECT seq, event FROM run_events WHERE run_id = ? AND seq > ? ORDER BY seq").all(runId, after) as Row[];
  return rows.map((row) => ({ seq: row.seq, event: JSON.parse(row.event) }));
}
