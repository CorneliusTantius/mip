// Browser-wide notices between cards. A card that changes agents or personas announces it, and every card that shows
// them reloads. Names are plain strings on window, so any card can listen without importing the one that changed.

// Sent after the agent list is loaded or changed. The repositories card listens, because a deleted agent takes its copies.
export const AGENTS_CHANGED = "agents-changed";
// Sent after a persona is saved, made default, or deleted. The agent list's persona dropdown listens.
export const PERSONAS_CHANGED = "personas-changed";

export function announce(name: string): void {
  window.dispatchEvent(new Event(name));
}

// Returns a function that stops listening.
export function subscribe(name: string, handler: () => void): () => void {
  window.addEventListener(name, handler);
  return () => window.removeEventListener(name, handler);
}
