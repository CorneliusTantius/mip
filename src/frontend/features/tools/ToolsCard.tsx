import { useEffect, useState } from "preact/hooks";
import { api, errorText } from "../../api/client";
import type { ToolInfo } from "../../api/types";
import { Card, CardBody, ExpandButton, useCardExpansion } from "../../ui/Card";
import { ErrorAlert } from "../../ui/ErrorAlert";

// How many tools the collapsed card lists.
const PREVIEW = 4;

// The tool registry: every tool the agents can use, and which kinds of run may use each. Collapsed, the card lists the first few.
// Expanded, each tool opens to its description and its inputs.
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
  const [error, setError] = useState<string>();

  useEffect(() => {
    api.get<{ tools: ToolInfo[] }>("/api/tools").then((data) => setTools(data.tools), (err) => setError(errorText(err)));
  }, []);

  const shown = expanded ? tools : tools.slice(0, PREVIEW);

  return (
    <CardBody title="Tools" className={expanded ? "min-h-0 flex-1" : ""} actions={<ExpandButton />}>
      {tools.length === 0 ? (
        <p className="py-4 text-center text-sm opacity-60">{error ? "" : "Loading tools…"}</p>
      ) : (
        <ul className={expanded ? "flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto" : "flex flex-col gap-1"}>
          {shown.map((tool) => (
            <ToolRow key={tool.name} tool={tool} expandable={expanded} />
          ))}
        </ul>
      )}
      {!expanded && tools.length > PREVIEW && <p className="text-xs opacity-60">{tools.length - PREVIEW} more. Expand to see all.</p>}
      <ErrorAlert message={error} />
    </CardBody>
  );
}

// One tool in the list, with where it may be used. Expanded, it opens to the tool's description and inputs.
function ToolRow({ tool, expandable }: { tool: ToolInfo; expandable: boolean }) {
  const summary = (
    <span className="flex min-w-0 items-center gap-2 text-sm">
      <strong className="truncate">{tool.name}</strong>
      <Access tool={tool} />
    </span>
  );

  if (!expandable) return <li>{summary}</li>;
  const inputs = Object.entries(tool.inputSchema.properties ?? {});
  const required = new Set(tool.inputSchema.required ?? []);
  return (
    <li>
      <details className="rounded-box bg-base-300/40 p-2">
        <summary className="flex cursor-pointer">{summary}</summary>
        <div className="mt-2 flex flex-col gap-2 text-sm">
          <p className="opacity-80">{tool.description}</p>
          {inputs.length === 0 ? (
            <p className="text-xs opacity-60">Takes no input.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-xs">
              {inputs.map(([name, spec]) => (
                <li key={name}>
                  <strong>{name}</strong> <span className="opacity-60">({spec.type ?? "any"}{required.has(name) ? ", required" : ""})</span>
                  {spec.description && <span className="opacity-80">: {spec.description}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </li>
  );
}

// Which kinds of run may use the tool. A tool that no run may use says so.
function Access({ tool }: { tool: ToolInfo }) {
  if (!tool.chat && !tool.bot) return <span className="badge badge-error badge-xs">unused</span>;
  return (
    <>
      {tool.chat && <span className="badge badge-outline badge-xs">chat</span>}
      {tool.bot && <span className="badge badge-outline badge-xs">bot</span>}
    </>
  );
}
