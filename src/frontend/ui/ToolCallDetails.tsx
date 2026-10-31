import type { ToolCall } from "../api/types";
import { prettyJson, toolLabel } from "./toolName";

// One tool call's name, input, and result. Shared by the chat's tool-call dialog and the Tool calls card, which already shows the name.
export function ToolCallDetails({ call, showName = true }: { call: ToolCall; showName?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      {showName && (
        <div className="flex items-center gap-2">
          <strong className="text-sm">{toolLabel(call.name)}</strong>
          {call.isError && <span className="badge badge-error badge-sm">error</span>}
        </div>
      )}
      <Block label="Input" text={prettyJson(call.input)} />
      <Block label="Result" text={call.output === null ? "No result came back." : call.output || "(empty)"} />
    </div>
  );
}

function Block({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs opacity-60">{label}</span>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-base-100/60 p-2 text-xs">{text}</pre>
    </div>
  );
}
