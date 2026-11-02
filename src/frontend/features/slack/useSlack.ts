import { useEffect, useRef, useState } from "preact/hooks";
import { api, errorText } from "../../api/client";
import type { SlackConversation, SlackMessage, SlackState } from "../../api/types";

// The Slack connection: the app's settings, the connected accounts, and connecting or disconnecting one. A failure to load is shown by the
// caller, and a failed save or connect is thrown so the form can show the reason where the user is looking.
export function useSlack() {
  const [state, setState] = useState<SlackState>();
  const [error, setError] = useState<string>();

  async function load() {
    try {
      setState(await api.get<SlackState>("/api/slack"));
      setError(undefined);
    } catch (err) {
      setError(errorText(err));
    }
  }

  // Saves the app's client ID and secret. Throws the reason when the server refuses.
  async function saveApp(clientId: string, clientSecret: string): Promise<void> {
    setState(await api.put<SlackState>("/api/slack/app", { clientId, clientSecret }));
  }

  // Starts the Slack sign-in and returns the page to open. Throws the reason when it cannot start.
  async function startConnect(): Promise<string> {
    // An empty JSON body: the server only accepts JSON for this call.
    const reply = await api.post<{ url: string }>("/api/slack/connect", {});
    return reply.url;
  }

  // Connects with a pasted user token. Throws the reason when Slack refuses it.
  async function connectWithToken(token: string): Promise<void> {
    await api.post("/api/slack/token", { token });
    await load();
  }

  // Disconnects an account. Throws the reason when it fails, so the confirm box shows it.
  async function remove(id: string): Promise<void> {
    setState(await api.del<SlackState>(`/api/slack/accounts/${encodeURIComponent(id)}`));
  }

  useEffect(() => {
    void load();
  }, []);

  return { state, error, reload: load, saveApp, startConnect, connectWithToken, remove };
}

// The conversations of one account. The server keeps its answer, so a reload is quick. Refresh asks Slack again.
export function useConversations(accountId: string | undefined) {
  const [list, setList] = useState<SlackConversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const latest = useRef(0);

  async function load(force = false) {
    if (!accountId) return;
    const request = ++latest.current;
    setLoading(true);
    try {
      const path = `/api/slack/accounts/${encodeURIComponent(accountId)}/conversations${force ? "?refresh=1" : ""}`;
      const reply = await api.get<SlackConversation[]>(path);
      if (request !== latest.current) return;
      setList(reply);
      setError(undefined);
    } catch (err) {
      if (request === latest.current) setError(errorText(err));
    } finally {
      if (request === latest.current) setLoading(false);
    }
  }

  useEffect(() => {
    setList([]);
    void load();
  }, [accountId]);

  return { list, loading, error, reload: () => load(true) };
}

// Where one conversation's messages or thread replies are read and sent. Empty when the conversation or account is not chosen.
function conversationPath(accountId: string | undefined, channelId: string | undefined): string | undefined {
  return accountId && channelId ? `/api/slack/accounts/${encodeURIComponent(accountId)}/conversations/${encodeURIComponent(channelId)}` : undefined;
}

// The newest messages of one conversation, and a way to send one. The server keeps its answer for a couple of minutes; Refresh and a send ask
// Slack again.
export function useMessages(accountId: string | undefined, channelId: string | undefined) {
  const [list, setList] = useState<SlackMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const latest = useRef(0);
  const base = conversationPath(accountId, channelId);

  async function load(force = false) {
    if (!base) return;
    const request = ++latest.current;
    setLoading(true);
    try {
      const reply = await api.get<SlackMessage[]>(`${base}/messages${force ? "?refresh=1" : ""}`);
      if (request !== latest.current) return;
      setList(reply);
      setError(undefined);
    } catch (err) {
      if (request === latest.current) setError(errorText(err));
    } finally {
      if (request === latest.current) setLoading(false);
    }
  }

  // Sends a message as the user. Throws the reason when Slack refuses it, so the composer keeps the text.
  async function send(text: string): Promise<void> {
    if (!base) return;
    await api.post(`${base}/messages`, { text });
    await load(true);
  }

  useEffect(() => {
    setList([]);
    void load();
  }, [accountId, channelId]);

  return { list, loading, error, reload: () => load(true), send };
}

// One thread: the parent message and its replies, oldest first, and a way to reply in it.
export function useThread(accountId: string | undefined, channelId: string | undefined, threadTs: string | undefined) {
  const [list, setList] = useState<SlackMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const base = conversationPath(accountId, channelId);

  async function load(force = false) {
    if (!base || !threadTs) return;
    setLoading(true);
    try {
      setList(await api.get<SlackMessage[]>(`${base}/threads/${encodeURIComponent(threadTs)}${force ? "?refresh=1" : ""}`));
      setError(undefined);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }

  // Replies in the thread as the user. Throws the reason when Slack refuses it.
  async function reply(text: string): Promise<void> {
    if (!base || !threadTs) return;
    await api.post(`${base}/messages`, { text, threadTs });
    await load(true);
  }

  useEffect(() => {
    setList([]);
    void load();
  }, [accountId, channelId, threadTs]);

  return { list, loading, error, reload: () => load(true), reply };
}
