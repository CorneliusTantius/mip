import { useState } from "preact/hooks";
import type { ToolCall } from "../../api/types";
import { Modal } from "../../ui/Modal";
import { ToolCallDetails } from "../../ui/ToolCallDetails";
import { toolLabel } from "../../ui/toolName";

// The button at the bottom of a reply. It opens the list of tool calls the reply made.
export function ToolCallsButton({ calls, names }: { calls: ToolCall[]; names: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 flex justify-end">
      <button className="btn btn-ghost btn-xs" onClick={() => setOpen(true)}>
        View tool calls ({names.length})
      </button>
      <ToolCallsDialog open={open} onClose={() => setOpen(false)} calls={calls} names={names} />
    </div>
  );
}

// The tool calls of one reply, each with its input and result. Replies saved before details were recorded list names only.
export function ToolCallsDialog({ open, onClose, calls, names }: { open: boolean; onClose: () => void; calls: ToolCall[]; names: string[] }) {
  return (
    <Modal open={open} onClose={onClose} glow="frost" boxClassName="max-w-3xl">
      <h3 className="text-lg font-semibold">Tool calls ({names.length})</h3>

      {calls.length === 0 ? (
        <div className="flex flex-col gap-2 py-2 text-sm">
          <p className="opacity-70">Details were not recorded for this reply. It used these tools:</p>
          <ol className="list-decimal pl-5">
            {names.map((name, i) => (
              <li key={i}>{toolLabel(name)}</li>
            ))}
          </ol>
        </div>
      ) : (
        <ol className="flex flex-col gap-3 py-2">
          {calls.map((call, i) => (
            <li key={i} className="flex gap-3 rounded-box bg-base-300/50 p-3">
              <span className="pt-0.5 text-xs opacity-60">{i + 1}.</span>
              <div className="min-w-0 flex-1">
                <ToolCallDetails call={call} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}
