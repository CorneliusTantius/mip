import { useEffect, useState } from "preact/hooks";
import { api, errorText } from "../../api/client";
import { AGENTS_CHANGED } from "../../api/events";
import type { PullResult, Repo, Agent } from "../../api/types";
import { Card, CardBody, ExpandButton } from "../../ui/Card";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { ErrorAlert } from "../../ui/ErrorAlert";
import { useAnnouncement, usePolling } from "../../ui/hooks";
import { RepoRow } from "./RepoRow";

// How often the list refreshes while a clone is still running.
const CLONE_POLL_MS = 1500;

// Clones are made with your own git, so private repositories work when git can reach them.
// Each agent can take its own copy of a repository, in its workspace.
export function RepositoriesCard() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [link, setLink] = useState("");
  const [error, setError] = useState<string>();
  const [removing, setRemoving] = useState<Repo>();
  const [pulling, setPulling] = useState(false);
  // What the last Pull all did to each repository, by id.
  const [pulls, setPulls] = useState<Record<string, { ok: boolean; message: string }>>({});
  const cloning = repos.some((repo) => repo.status === "cloning");

  const load = () => api.get<{ repos: Repo[] }>("/api/repos").then((data) => setRepos(data.repos));
  const loadAgents = () => api.get<{ agents: Agent[] }>("/api/agents").then((data) => setAgents(data.agents));

  useEffect(() => {
    load();
    loadAgents();
  }, []);

  // The agent list changed. A deleted agent also takes its copies with it, so the repositories reload too.
  useAnnouncement(AGENTS_CHANGED, () => {
    loadAgents();
    load();
  });

  // A clone takes a while, so the list refreshes until none is still running.
  usePolling(load, CLONE_POLL_MS, cloning);

  async function clone(e: Event) {
    e.preventDefault();
    setError(undefined);
    try {
      await api.post("/api/repos", { url: link.trim() });
    } catch (err) {
      return setError(errorText(err));
    }
    setLink("");
    load();
  }

  async function copy(repo: Repo, agentId: string) {
    setError(undefined);
    try {
      await api.post(`/api/repos/${repo.id}/copies`, { agentId });
    } catch (err) {
      return setError(errorText(err));
    }
    load();
  }

  // Brings every ready repository up to its branch's latest commit, and shows what happened on each row.
  async function pullAll() {
    setError(undefined);
    setPulling(true);
    let results: PullResult[];
    try {
      ({ results } = await api.post<{ results: PullResult[] }>("/api/repos/pull"));
    } catch (err) {
      setPulling(false);
      return setError(errorText(err));
    }
    setPulling(false);
    setPulls(Object.fromEntries(results.map((r) => [r.id, { ok: r.ok, message: r.message }])));
    load();
  }

  async function remove() {
    const repo = removing;
    if (!repo) return;
    setRemoving(undefined);
    try {
      await api.del(`/api/repos/${repo.id}`);
    } catch (err) {
      return setError(errorText(err));
    }
    load();
  }

  return (
    <Card glow="orange" className="h-full">
      <CardBody
        title="Repositories"
        className="min-h-0 flex-1 gap-3"
        actions={
          <>
            <button className="btn btn-sm" disabled={pulling || !repos.some((repo) => repo.status === "ready")} onClick={pullAll}>
              {pulling && <span className="loading loading-spinner loading-xs" />}
              Pull all
            </button>
            <ExpandButton />
          </>
        }
      >
        <form className="join w-full" onSubmit={clone}>
          <input
            className="input input-sm join-item w-full"
            placeholder="Paste a clone link, such as https://github.com/owner/repo.git"
            value={link}
            onInput={(e) => setLink(e.currentTarget.value)}
          />
          <button className="btn btn-sm btn-primary join-item" disabled={!link.trim()}>
            Clone
          </button>
        </form>
        <ErrorAlert message={error} className="alert-soft py-2 text-sm" />

        {repos.length === 0 ? (
          <p className="py-4 text-center text-sm opacity-60">No repositories yet.</p>
        ) : (
          <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
            {repos.map((repo) => (
              <RepoRow
                key={repo.id}
                repo={repo}
                agents={agents}
                pull={pulls[repo.id]}
                onCopy={(agentId) => copy(repo, agentId)}
                onRemove={() => setRemoving(repo)}
              />
            ))}
          </ul>
        )}
      </CardBody>

      <ConfirmDialog
        open={!!removing}
        title="Remove this repository?"
        message={`"${removing?.name ?? ""}" is removed from mip. Copies in agents stay in their workspaces.`}
        onConfirm={remove}
        onCancel={() => setRemoving(undefined)}
      />
    </Card>
  );
}
