// The JSON shapes the server sends. They mirror the server's types in src/backend. Keep them in step with it.

export interface ModelOption {
  // An empty id is the provider's default model.
  id: string;
  name: string;
  thinkingLevels: string[];
}

export interface SignInPrompt {
  message: string;
  type?: string;
  placeholder?: string;
}

// The sign-in attempt for one target: its output, and any question it is waiting on.
export interface SignInProgress {
  running: boolean;
  output: string[];
  error?: string;
  prompt?: SignInPrompt;
}

export interface SignInTarget {
  id: string;
  name: string;
  methods: string[];
  auth: { loggedIn: boolean; method?: string };
  progress: SignInProgress;
}

export interface ProviderInfo {
  id: string;
  name: string;
  capabilities: Record<string, boolean>;
  models: ModelOption[];
  targets: SignInTarget[];
  error?: string;
}

export interface Persona {
  id: string;
  name: string;
  systemPrompt: string;
  isDefault: boolean;
}

// A chat. Its model and thinking level apply to the next message.
export interface Session {
  id: string;
  providerId: string;
  providerSessionId: string | null;
  personaId: string;
  model: string | null;
  thinking: string | null;
  title: string;
  updatedAt: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  tools: string[];
  error?: string | null;
}

export interface ChatDetail {
  session: Session;
  messages: ChatMessage[];
  // The run still going in this chat, if there is one.
  activeRunId?: string;
}

// One event of a run, as the server saves it. The chat reads the kinds it shows and ignores the rest.
export interface RunEvent {
  type: string;
  text?: string;
  name?: string;
  message?: string;
}

export interface Bot {
  id: string;
  name: string;
  persona: string;
  providerId: string;
  model: string | null;
  thinking: string | null;
}

export interface RoomMessage {
  id: number;
  kind: "user" | "bot" | "system";
  authorName: string;
  text: string;
}

export interface RepoCopy {
  sessionId: string;
  title: string;
}

export interface Repo {
  id: string;
  name: string;
  url: string;
  status: "cloning" | "ready" | "error";
  error: string | null;
  // The checked-out branch. Null while cloning, after a failed clone, or when the branch is unknown.
  branch: string | null;
  copies: RepoCopy[];
}

export interface PullResult {
  id: string;
  name: string;
  ok: boolean;
  message: string;
}

// A row in the memory list. Search results also carry a snippet.
export interface NoteItem {
  id: string;
  title: string;
  snippet?: string;
}

// One note with what it links to, what links to it, and its tags.
export interface NoteDetail {
  title: string;
  body: string;
  links: string[];
  backlinks: string[];
  tags: string[];
}
