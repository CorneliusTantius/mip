import { useEffect, useState } from "preact/hooks";
import { ConfirmDialog } from "./ConfirmDialog";
import { OptionDropdown } from "./OptionDropdown";

// A chat that has its own copy of a repository.
interface Copy {
  sessionId: string;
  title: string;
}

interface Repo {
  id: string;
  name: string;
  url: string;
  status: "cloning" | "ready" | "error";
  error: string | null;
  // The checked-out branch. Null while cloning or after a failed clone.
  branch: string | null;
  copies: Copy[];
}

interface Chat {
  id: string;
  title: string;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

// A link with a username or token in it is shown without them.
const withoutCredentials = (url: string) => url.replace(/\/\/[^/@]+@/, "//");

function Status({ status }: { status: Repo["status"] }) {
  if (status === "cloning") {
    return (
      <span className="badge badge-sm badge-soft">
        <span className="loading loading-spinner loading-xs" />
        cloning
      </span>
    );
  }
  if (status === "ready") return <span className="badge badge-sm badge-success badge-soft">ready</span>;
  return <span className="badge badge-sm badge-error badge-soft">failed</span>;
}

// Clones are made with your own git, so private repositories work when git can reach them.
// Each chat can take its own copy of a repository, in its workspace.
export function RepositoriesCard() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [link, setLink] = useState("");
  const [error, setError] = useState<string>();
  const [removing, setRemoving] = useState<Repo>();
  const [pulling, setPulling] = useState(false);
  // What the last Pull all did to each repository, by id.
  const [pulls, setPulls] = useState<Record<string, { ok: boolean; message: string }>>({});
  const cloning = repos.some((repo) => repo.status === "cloning");

  const load = () =>
    fetch("/api/repos")
      .then((res) => res.json())
      .then((data) => setRepos(data.repos));
  const loadChats = () =>
    fetch("/api/sessions")
      .then((res) => res.json())
      .then((data) => setChats(data.sessions));

  useEffect(() => {
    load();
    loadChats();
    // The chat card announces each change to the chat list. A deleted chat also takes its copies with it,
    // so the repositories are reloaded too.
    const onChatsChanged = () => {
      loadChats();
      load();
    };
    window.addEventListener("sessions-changed", onChatsChanged);
    return () => window.removeEventListener("sessions-changed", onChatsChanged);
  }, []);

  // A clone takes a while, so the list refreshes until none is still running.
  useEffect(() => {
    if (!cloning) return;
    const timer = setInterval(load, 1500);
    return () => clearInterval(timer);
  }, [cloning]);

  async function clone(e: Event) {
    e.preventDefault();
    setError(undefined);
    const res = await fetch("/api/repos", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ url: link.trim() }) });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    setLink("");
    load();
  }

  async function copy(repo: Repo, sessionId: string) {
    setError(undefined);
    const res = await fetch(`/api/repos/${repo.id}/copies`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ sessionId }) });
    if (!res.ok) return setError((await res.json()).error);
    load();
  }

  // Brings every ready repository up to its branch's latest commit, and shows what happened on each row.
  async function pullAll() {
    setError(undefined);
    setPulling(true);
    const res = await fetch("/api/repos/pull", { method: "POST" });
    const data = await res.json();
    setPulling(false);
    if (!res.ok) return setError(data.error);
    setPulls(Object.fromEntries(data.results.map((r: { id: string; ok: boolean; message: string }) => [r.id, { ok: r.ok, message: r.message }])));
    load();
  }

  async function remove() {
    if (!removing) return;
    const res = await fetch(`/api/repos/${removing.id}`, { method: "DELETE" });
    setRemoving(undefined);
    if (!res.ok) return setError((await res.json()).error);
    load();
  }

  return (
    <section className="card h-full bg-base-200/80">
      <div className="card-body gap-3">
        <div className="flex items-center gap-2">
          <h2 className="card-title mr-auto">Repositories</h2>
          <button className="btn btn-sm" disabled={pulling || !repos.some((repo) => repo.status === "ready")} onClick={pullAll}>
            {pulling && <span className="loading loading-spinner loading-xs" />}
            Pull all
          </button>
        </div>

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
        {error && (
          <div role="alert" className="alert alert-error alert-soft py-2 text-sm">
            <span>{error}</span>
          </div>
        )}

        {repos.length === 0 ? (
          <p className="py-4 text-center text-sm opacity-60">No repositories yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {repos.map((repo) => {
              const options = chats
                .filter((chat) => !repo.copies.some((copied) => copied.sessionId === chat.id))
                .map((chat) => ({ value: chat.id, label: chat.title || "New session" }));
              return (
                <li key={repo.id} className="flex flex-col gap-2 rounded-box border border-base-300 p-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 font-medium">{repo.name}</span>
                    <Status status={repo.status} />
                    {repo.branch && <span className="badge badge-sm badge-outline font-mono">{repo.branch}</span>}
                    <span className="min-w-0 flex-1 truncate text-xs opacity-60" title={withoutCredentials(repo.url)}>
                      {withoutCredentials(repo.url)}
                    </span>
                    <button className="btn btn-ghost btn-xs" disabled={repo.status === "cloning"} onClick={() => setRemoving(repo)}>
                      Remove
                    </button>
                  </div>
                  {repo.status === "error" && <p className="text-xs text-error">{repo.error}</p>}
                  {pulls[repo.id] && <p className={`text-xs ${pulls[repo.id].ok ? "opacity-70" : "text-error"}`}>{pulls[repo.id].message}</p>}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {repo.copies.map((copied) => (
                      <span key={copied.sessionId} className="badge badge-outline max-w-40 truncate" title={copied.title}>
                        {copied.title || "New session"}
                      </span>
                    ))}
                    {repo.status === "ready" && (
                      <OptionDropdown
                        label={`Copy ${repo.name} to a chat`}
                        value=""
                        options={options}
                        placeholder={chats.length === 0 ? "Create a chat first" : options.length ? "Copy to a chat" : "Every chat has a copy"}
                        disabled={options.length === 0}
                        onChange={(sessionId) => copy(repo, sessionId)}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={!!removing}
        title="Remove this repository?"
        message={`"${removing?.name ?? ""}" is removed from mip. Copies in chats stay in their workspaces.`}
        onConfirm={remove}
        onCancel={() => setRemoving(undefined)}
      />
    </section>
  );
}
