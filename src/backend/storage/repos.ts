import { db, type Row } from "./db.js";

// A repository is a master clone in the repos folder, and the link it was cloned from.
export interface Repo {
  id: string;
  name: string;
  url: string;
  status: "cloning" | "ready" | "error";
  error: string | null;
}

function toRepo(row: Row): Repo {
  return { id: row.id, name: row.name, url: row.url, status: row.status, error: row.error ?? null };
}

export function listRepos(): Repo[] {
  return (db.prepare("SELECT * FROM repos ORDER BY name").all() as Row[]).map(toRepo);
}

export function getRepo(id: string): Repo | undefined {
  const row = db.prepare("SELECT * FROM repos WHERE id = ?").get(id) as Row | undefined;
  return row && toRepo(row);
}

export function getRepoByName(name: string): Repo | undefined {
  const row = db.prepare("SELECT * FROM repos WHERE name = ?").get(name) as Row | undefined;
  return row && toRepo(row);
}

export function insertRepo(repo: Repo): void {
  db.prepare("INSERT INTO repos (id, name, url, status, error, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    repo.id,
    repo.name,
    repo.url,
    repo.status,
    repo.error,
    Date.now(),
  );
}

export function setRepoStatus(id: string, status: Repo["status"], error: string | null): void {
  db.prepare("UPDATE repos SET status = ?, error = ? WHERE id = ?").run(status, error, id);
}

export function deleteRepo(id: string): void {
  db.prepare("DELETE FROM repos WHERE id = ?").run(id);
}
