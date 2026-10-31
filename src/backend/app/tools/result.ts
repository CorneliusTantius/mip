import type { ToolResult } from "../../adapters/contract.js";

// Helpers for tool results. A failed result still goes back to the model as text, so the model can read why it failed.
export const ok = (text: string): ToolResult => ({ text, isError: false });
export const fail = (text: string): ToolResult => ({ text, isError: true });
