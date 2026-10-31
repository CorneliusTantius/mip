import type { PullResult, Repo, Agent } from "../../api/types";
import { useCardExpansion } from "../../ui/Card";
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

// One repository: its name, status, branch, and link, the last pull's result, the agents that have a copy, and the controls.
export function RepoRow({
  repo,
  agents,
  pull,
  onCopy,
  onRemove,
}: {
  repo: Repo;
  agents: Agent[];
  pull?: Pick<PullResult, "ok" | "message">;
  onCopy: (agentId: string) => void;
  onRemove: () => void;
}) {
  // Agents that do not have a copy yet.
  const options = agents
    .filter((agent) => !repo.copies.some((copied) => copied.agentId === agent.id))
    .map((agent) => ({ value: agent.id, label: agent.title || "New agent" }));
  const { expanded } = useCardExpansion();
  const small = expanded ? "text-sm" : "text-xs";

  return (
    <li className="flex flex-col gap-2 rounded-box border border-base-300 p-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 font-medium">{repo.name}</span>
        <StatusBadge status={repo.status} />
        {repo.branch && <span className={`badge badge-outline font-mono ${expanded ? "badge-md" : "badge-sm"}`}>{repo.branch}</span>}
        <span className={`min-w-0 flex-1 truncate ${small} opacity-60`} title={withoutCredentials(repo.url)}>
          {withoutCredentials(repo.url)}
        </span>
        <button className={`btn btn-ghost ${expanded ? "btn-sm" : "btn-xs"}`} disabled={repo.status === "cloning"} onClick={onRemove}>
          Remove
        </button>
      </div>
      {repo.status === "error" && <p className={`${small} text-error`}>{repo.error}</p>}
      {pull && <p className={`${small} ${pull.ok ? "opacity-70" : "text-error"}`}>{pull.message}</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        {repo.copies.map((copied) => (
          <span key={copied.agentId} className="badge badge-outline max-w-40 truncate" title={copied.title}>
            {copied.title || "New agent"}
          </span>
        ))}
        {repo.status === "ready" && (
          <OptionDropdown
            label={`Copy ${repo.name} to an agent`}
            value=""
            options={options}
            placeholder={agents.length === 0 ? "Create an agent first" : options.length ? "Copy to an agent" : "Every agent has a copy"}
            disabled={options.length === 0}
            onChange={onCopy}
          />
        )}
      </div>
    </li>
  );
}
