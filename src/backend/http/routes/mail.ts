import { addMailAccount, deleteMailAccount, listMailMessages, mailAccountsReply, openMailMessage, testMailAccount } from "../../app/mail/mail.js";
import { created, ok, readJson, requireJson } from "../respond.js";
import { del, get, post, type Route } from "../router.js";

// Mail accounts: the accounts and the providers the add form offers, adding and removing one, testing one, and reading its newest messages
// and one message. Reading connects to the account's mail server, so every call that changes or reads an account needs JSON, which keeps a
// page on another site from making it.
export const mailRoutes: Route[] = [
  get("/api/mail/accounts", () => ok(mailAccountsReply())),
  post("/api/mail/accounts", async ({ req }) => {
    requireJson(req);
    return created(await addMailAccount(await readJson(req)));
  }),
  del("/api/mail/accounts/:id", async ({ params }) => ok(await deleteMailAccount(params.id))),
  post("/api/mail/accounts/:id/test", async ({ req, params }) => {
    requireJson(req);
    return ok(await testMailAccount(params.id));
  }),
  get("/api/mail/accounts/:id/messages", async ({ params }) => ok(await listMailMessages(params.id))),
  get("/api/mail/accounts/:id/messages/:uid", async ({ params }) => ok(await openMailMessage(params.id, params.uid))),
];
