import type { PullResult, Repo, Session } from "../../api/types";
import { OptionDropdown } from "../../ui/OptionDropdown";

// A link with a username or token in it is shown without them.
const withoutCredentials = (url: string) => url.replace(/\/\/[^/@]+@/, "//");

function StatusBadge({ status }: { status: Repo["status"] }) {
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

// One repository: its name, status, branch, and link, the last pull's result, the chats that have a copy, and the controls.
export function RepoRow({
  repo,
  chats,
  pull,
  onCopy,
  onRemove,
}: {
  repo: Repo;
  chats: Session[];
  pull?: Pick<PullResult, "ok" | "message">;
  onCopy: (sessionId: string) => void;
  onRemove: () => void;
}) {
  // Chats that do not have a copy yet.
  const options = chats
    .filter((chat) => !repo.copies.some((copied) => copied.sessionId === chat.id))
    .map((chat) => ({ value: chat.id, label: chat.title || "New session" }));

  return (
    <li className="flex flex-col gap-2 rounded-box border border-base-300 p-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 font-medium">{repo.name}</span>
        <StatusBadge status={repo.status} />
        {repo.branch && <span className="badge badge-sm badge-outline font-mono">{repo.branch}</span>}
        <span className="min-w-0 flex-1 truncate text-xs opacity-60" title={withoutCredentials(repo.url)}>
          {withoutCredentials(repo.url)}
        </span>
        <button className="btn btn-ghost btn-xs" disabled={repo.status === "cloning"} onClick={onRemove}>
          Remove
        </button>
      </div>
      {repo.status === "error" && <p className="text-xs text-error">{repo.error}</p>}
      {pull && <p className={`text-xs ${pull.ok ? "opacity-70" : "text-error"}`}>{pull.message}</p>}
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
            onChange={onCopy}
          />
        )}
      </div>
    </li>
  );
}
