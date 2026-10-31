import { useEffect, useState } from "preact/hooks";
import { api, errorText } from "../../api/client";
import type { ToolInfo } from "../../api/types";
import { Card, CardBody, ExpandButton, useCardExpansion } from "../../ui/Card";
import { ErrorAlert } from "../../ui/ErrorAlert";
import { Modal } from "../../ui/Modal";

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
// Clicking a tool opens its guide and inputs in a dialog. The guide is the part that goes into the model's system prompt.
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
  // The tool whose dialog is open.
  const [selected, setSelected] = useState<ToolInfo>();
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
          <button key={key} className={`join-item btn ${expanded ? "btn-sm" : "btn-xs"} ${scope === key ? "btn-active" : ""}`} onClick={() => setScope(key)}>
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
          <table className={`table ${expanded ? "table-sm" : "table-xs"}`}>
            <thead>
              <tr>
                <th>Tool</th>
                <th>Offered</th>
                <th>Used by</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((tool) => (
                <tr key={tool.name} className="cursor-pointer hover" onClick={() => setSelected(tool)}>
                  <td className="font-medium">{tool.name}</td>
                  <td>
                    <span className={`badge badge-ghost ${expanded ? "badge-sm" : "badge-xs"}`}>{tool.load}</span>
                  </td>
                  <td>
                    <Access tool={tool} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!expanded && scoped.length > PREVIEW && <p className="text-xs opacity-60">{scoped.length - PREVIEW} more. Expand to see all.</p>}
      <ErrorAlert message={error} />

      <Modal open={!!selected} onClose={() => setSelected(undefined)} glow="orange" boxClassName="max-w-xl">
        {selected && (
          <>
            <ToolDetail tool={selected} />
            <div className="modal-action">
              <button className="btn btn-sm" onClick={() => setSelected(undefined)}>
                Close
              </button>
            </div>
          </>
        )}
      </Modal>
    </CardBody>
  );
}

// A tool's name, how it is offered, its description, its guide, and its inputs. Shown in the tool's dialog.
function ToolDetail({ tool }: { tool: ToolInfo }) {
  const inputs = Object.entries(tool.inputSchema.properties ?? {});
  const required = new Set(tool.inputSchema.required ?? []);
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-semibold">{tool.name}</h3>
        <span className="badge badge-ghost badge-sm">{tool.load}</span>
        <Access tool={tool} />
      </div>
      <p>{tool.description}</p>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold">Guide</span>
        <p className="rounded-box bg-base-100/60 p-3 text-xs">{tool.guide}</p>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold">Inputs</span>
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
    </div>
  );
}

// Which kinds of run may use the tool. A tool that no run may use says so.
function Access({ tool }: { tool: ToolInfo }) {
  const { expanded } = useCardExpansion();
  const size = expanded ? "badge-sm" : "badge-xs";
  if (!tool.chat && !tool.bot) return <span className={`badge badge-error ${size}`}>unused</span>;
  return (
    <span className="flex gap-1">
      {tool.chat && <span className={`badge badge-outline ${size}`}>chat</span>}
      {tool.bot && <span className={`badge badge-outline ${size}`}>bot</span>}
    </span>
  );
}
