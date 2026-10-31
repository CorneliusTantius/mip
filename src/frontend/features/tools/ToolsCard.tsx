import { Fragment } from "preact";
import { useEffect, useState } from "preact/hooks";
import { api, errorText } from "../../api/client";
import type { ToolInfo } from "../../api/types";
import { Card, CardBody, ExpandButton, useCardExpansion } from "../../ui/Card";
import { ErrorAlert } from "../../ui/ErrorAlert";

// How many tools the collapsed card lists.
const PREVIEW = 4;

// Which kind of run the table is for: every tool, the tools chats can use, or the tools bots can use.
type Scope = "all" | "chat" | "bot";
const SCOPES: [Scope, string][] = [
  ["all", "All"],
  ["chat", "Chat"],
  ["bot", "Bot"],
];

// The tool registry as a table: each tool, how it is offered, and which kinds of run may use it. The pill picks the kind of run.
// Expanded, a row opens to the tool's guide and inputs. The guide is the part that goes into the model's system prompt.
export function ToolsCard() {
  return (
    <Card glow="orange">
      <ToolsBody />
    </Card>
  );
}

function ToolsBody() {
  const { expanded } = useCardExpansion();
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [scope, setScope] = useState<Scope>("all");
  // The tool whose row is open, when the card is expanded.
  const [open, setOpen] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    api.get<{ tools: ToolInfo[] }>("/api/tools").then((data) => setTools(data.tools), (err) => setError(errorText(err)));
  }, []);

  // The tools the pill shows. Chat means chats can use it, and bot means bots can.
  const scoped = tools.filter((tool) => scope === "all" || (scope === "chat" ? tool.chat : tool.bot));
  const shown = expanded ? scoped : scoped.slice(0, PREVIEW);

  return (
    <CardBody title="Tools" className={expanded ? "min-h-0 flex-1" : ""} actions={<ExpandButton />}>
      <div className="join self-start">
        {SCOPES.map(([key, label]) => (
          <button key={key} className={`join-item btn btn-xs ${scope === key ? "btn-active" : ""}`} onClick={() => setScope(key)}>
            {label}
          </button>
        ))}
      </div>

      {tools.length === 0 ? (
        <p className="py-4 text-center text-sm opacity-60">{error ? "" : "Loading tools…"}</p>
      ) : scoped.length === 0 ? (
        <p className="py-4 text-center text-sm opacity-60">
          {scope === "bot" ? "No tools are open to bots yet. Bot turns have no workspace or run token, so they have no tools." : "No tools for this view."}
        </p>
      ) : (
        <div className={expanded ? "min-h-0 flex-1 overflow-y-auto" : ""}>
          <table className="table table-xs">
            <thead>
              <tr>
                <th>Tool</th>
                <th>Offered</th>
                <th>Used by</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((tool) => (
                <Fragment key={tool.name}>
                  <tr
                    className={expanded ? "cursor-pointer hover" : ""}
                    onClick={expanded ? () => setOpen(open === tool.name ? undefined : tool.name) : undefined}
                  >
                    <td className="font-medium">{tool.name}</td>
                    <td>
                      <span className="badge badge-ghost badge-xs">{tool.load}</span>
                    </td>
                    <td>
                      <Access tool={tool} />
                    </td>
                  </tr>
                  {expanded && open === tool.name && (
                    <tr>
                      <td colSpan={3}>
                        <ToolDetail tool={tool} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!expanded && scoped.length > PREVIEW && <p className="text-xs opacity-60">{scoped.length - PREVIEW} more. Expand to see all.</p>}
      <ErrorAlert message={error} />
    </CardBody>
  );
}

// A tool's description, its guide, and its inputs. Shown under the tool's row.
function ToolDetail({ tool }: { tool: ToolInfo }) {
  const inputs = Object.entries(tool.inputSchema.properties ?? {});
  const required = new Set(tool.inputSchema.required ?? []);
  return (
    <div className="flex flex-col gap-2 py-2 text-sm">
      <p>{tool.description}</p>
      <div>
        <span className="text-xs font-semibold">Guide</span>
        <p className="rounded bg-base-100/60 p-2 text-xs">{tool.guide}</p>
      </div>
      {inputs.length === 0 ? (
        <p className="text-xs">Takes no input.</p>
      ) : (
        <ul className="flex flex-col gap-1 text-xs">
          {inputs.map(([name, spec]) => (
            <li key={name}>
              <strong>{name}</strong> <span>({spec.type ?? "any"}{required.has(name) ? ", required" : ""})</span>
              {spec.description && <span>: {spec.description}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Which kinds of run may use the tool. A tool that no run may use says so.
function Access({ tool }: { tool: ToolInfo }) {
  if (!tool.chat && !tool.bot) return <span className="badge badge-error badge-xs">unused</span>;
  return (
    <span className="flex gap-1">
      {tool.chat && <span className="badge badge-outline badge-xs">chat</span>}
      {tool.bot && <span className="badge badge-outline badge-xs">bot</span>}
    </span>
  );
}
