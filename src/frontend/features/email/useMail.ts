import { useEffect, useState } from "preact/hooks";
import { api, errorText } from "../../api/client";
import type { MailAccount, MailAccountsReply, MailboxReply } from "../../api/types";
import { usePolling } from "../../ui/hooks";

// The mail accounts, the providers the add form offers, and what could not be read. Adding hands a failure to the dialog that asked, so the
// reason is shown where the user is looking. Removing hands its failure to the confirm box.
export function useMailAccounts() {
  const [reply, setReply] = useState<MailAccountsReply>();
  const [error, setError] = useState<string>();

  async function load() {
    try {
      setReply(await api.get<MailAccountsReply>("/api/mail/accounts"));
      setError(undefined);
    } catch (err) {
      setError(errorText(err));
    }
  }

  // Signs the account in and saves it. Throws the reason when the server refuses, so the dialog shows it.
  async function add(input: unknown): Promise<MailAccount> {
    const account = await api.post<MailAccount>("/api/mail/accounts", input);
    await load();
    return account;
  }

  // Removes an account. Throws the reason when it fails, so the confirm box shows it.
  async function remove(id: string): Promise<void> {
    setReply(await api.del<MailAccountsReply>(`/api/mail/accounts/${encodeURIComponent(id)}`));
  }

  useEffect(() => {
    void load();
  }, []);

  return { reply, error, reload: load, add, remove };
}

// How many messages a list shows at first, and how many more Load more adds.
const PAGE = 25;

// The newest messages of one account's mailbox, re-read every pollSeconds while the account is shown. checkedAt is when the last read
// finished, so the card can say how fresh its list is. Each account starts with a page; more() adds one, and hasMore says whether the
// mailbox may have more to show.
export function useMailbox(accountId: string | undefined, pollSeconds: number) {
  const [mailbox, setMailbox] = useState<MailboxReply & { checkedAt: Date }>();
  const [error, setError] = useState<string>();
  const [want, setWant] = useState({ accountId, count: PAGE });
  const count = want.accountId === accountId ? want.count : PAGE;

  async function load() {
    if (!accountId) return;
    try {
      const reply = await api.get<MailboxReply>(`/api/mail/accounts/${encodeURIComponent(accountId)}/messages?count=${count}`);
      setMailbox({ ...reply, checkedAt: new Date() });
      setError(undefined);
    } catch (err) {
      setError(errorText(err));
    }
  }

  useEffect(() => {
    setMailbox(undefined);
  }, [accountId]);

  useEffect(() => {
    void load();
  }, [accountId, count]);

  usePolling(() => void load(), pollSeconds * 1000, !!accountId);

  return {
    mailbox,
    error,
    reload: load,
    more: () => setWant({ accountId, count: count + PAGE }),
    hasMore: !!mailbox && mailbox.messages.length >= count,
  };
}
