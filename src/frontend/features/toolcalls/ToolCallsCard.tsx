import { useEffect, useState } from "preact/hooks";
import { api, errorText } from "../../api/client";
import type { RecentCall } from "../../api/types";
import { Card, CardBody, ExpandButton, useCardExpansion } from "../../ui/Card";
import { ErrorAlert } from "../../ui/ErrorAlert";
import { usePolling } from "../../ui/hooks";
import { ToolCallDetails } from "../../ui/ToolCallDetails";
import { toolLabel } from "../../ui/toolName";

// How often the list refreshes, so calls from a running chat appear while the card is open.
const REFRESH_MS = 4000;
// How many calls the collapsed card shows.
const PREVIEW = 3;

// The tool calls of recent replies, across every chat. Collapsed, the latest few show. Expanded, every call can be opened to see its input and result.
export function ToolCallsCard() {
  return (
    <Card glow="orange">
      <ToolCallsBody />
    </Card>
  );
}

function ToolCallsBody() {
  const { expanded } = useCardExpansion();
  const [calls, setCalls] = useState<RecentCall[]>([]);
  const [error, setError] = useState<string>();

  async function load() {
    try {
      setCalls((await api.get<{ calls: RecentCall[] }>("/api/tool-calls")).calls);
    } catch (err) {
      setError(errorText(err));
    }
  }

  useEffect(() => {
    void load();
  }, []);
  usePolling(load, REFRESH_MS);

  const shown = expanded ? calls : calls.slice(0, PREVIEW);

  return (
    <CardBody title="Tool calls" className={expanded ? "min-h-0 flex-1" : ""} actions={<ExpandButton />}>
      {calls.length === 0 ? (
        <p className="py-4 text-center text-sm opacity-60">No tool calls yet. They appear here as chats use tools.</p>
      ) : (
        <ul className={expanded ? "flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto" : "flex flex-col gap-1"}>
          {shown.map((call, i) => (
            <CallRow key={`${call.chatId}-${call.createdAt}-${i}`} call={call} expandable={expanded} />
          ))}
        </ul>
      )}
      {!expanded && calls.length > PREVIEW && <p className="text-xs opacity-60">{calls.length - PREVIEW} more. Expand to see all.</p>}
      <ErrorAlert message={error} />
    </CardBody>
  );
}

// One call in the list. Expanded, it opens to the call's input and result.
function CallRow({ call, expandable }: { call: RecentCall; expandable: boolean }) {
  const when = new Date(call.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const summary = (
    <span className="flex min-w-0 items-center gap-2 text-sm">
      <strong className="truncate">{toolLabel(call.name)}</strong>
      <span className="truncate text-xs opacity-60">{call.chatTitle}</span>
      {call.isError && <span className="badge badge-error badge-xs">error</span>}
      <span className="ml-auto shrink-0 text-xs opacity-50">{when}</span>
    </span>
  );

  if (!expandable) return <li>{summary}</li>;
  return (
    <li>
      <details className="rounded-box bg-base-300/40 p-2">
        <summary className="flex cursor-pointer">{summary}</summary>
        <div className="mt-2">
          <ToolCallDetails call={call} showName={false} />
        </div>
      </details>
    </li>
  );
}
