// Browser-wide notices between cards. A card that changes chats or personas announces it, and every card that shows
// them reloads. Names are plain strings on window, so any card can listen without importing the one that changed.

// Sent after the chat list is loaded or changed. The repositories card listens, because a deleted chat takes its copies.
export const CHATS_CHANGED = "sessions-changed";
// Sent after a persona is saved, made default, or deleted. The chat list's persona dropdown listens.
export const PERSONAS_CHANGED = "personas-changed";

export function announce(name: string): void {
  window.dispatchEvent(new Event(name));
}

// Returns a function that stops listening.
export function subscribe(name: string, handler: () => void): () => void {
  window.addEventListener(name, handler);
  return () => window.removeEventListener(name, handler);
}
