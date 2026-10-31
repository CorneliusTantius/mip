import { db, type Row } from "./db.js";

// A run is one agent turn in a chat. Its events are saved as they arrive, so a page can pick them up later.
export function createRun(id: string, sessionId: string): void {
  db.prepare("INSERT INTO runs (id, session_id, status, started_at) VALUES (?, ?, 'running', ?)").run(id, sessionId, Date.now());
}

export function getRun(id: string): { id: string; status: string } | undefined {
  return db.prepare("SELECT id, status FROM runs WHERE id = ?").get(id) as { id: string; status: string } | undefined;
}

// The run still going in a chat, if there is one. A chat has at most one.
export function activeRunForSession(sessionId: string): { id: string } | undefined {
  return db.prepare("SELECT id FROM runs WHERE session_id = ? AND status = 'running'").get(sessionId) as { id: string } | undefined;
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
