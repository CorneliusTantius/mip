import type { ToolCall } from "../../storage/agents.js";

// Long inputs and results are cut, so an agent's history stays small. The cut is marked, so the reader knows it is partial.
export const MAX_TEXT = 8000;

function clip(text: string): string {
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\n… (${text.length - MAX_TEXT} more characters)` : text;
}

// Collects a reply's tool calls from the run's events, in order. A result is matched to its call by the call's id.
export class ToolCallLog {
  readonly calls: ToolCall[] = [];
  private byId = new Map<string, ToolCall>();

  start(id: string, name: string, input: unknown): void {
    const call: ToolCall = { name, input: clip(JSON.stringify(input) ?? ""), output: null, isError: false };
    this.calls.push(call);
    this.byId.set(id, call);
  }

  finish(id: string, output: string, isError: boolean): void {
    const call = this.byId.get(id);
    if (!call) return;
    call.output = clip(output);
    call.isError = isError;
  }
}
