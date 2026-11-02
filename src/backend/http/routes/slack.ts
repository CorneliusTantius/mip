import { deleteSlackAccount, saveSlackAppInput, slackReply } from "../../app/slack/slack.js";
import { startConnect, connectWithToken } from "../../app/slack/connect.js";
import { listConversations, listMessages, listReplies, unreadCounts } from "../../app/slack/read.js";
import { sendMessage } from "../../app/slack/post.js";
import { created, ok, readJson } from "../respond.js";
import { del, get, post, put, type Route } from "../router.js";

// Slack: the app's client ID and secret, connecting an account (through Slack's sign-in, or a pasted user token), disconnecting one, and
// reading as a connected user. Every call that changes the connection, or reads Slack with it, needs JSON.
export const slackRoutes: Route[] = [
  get("/api/slack", () => ok(slackReply())),
  put("/api/slack/app", async ({ req }) => {
    return ok(saveSlackAppInput(await readJson(req)));
  }),
  post("/api/slack/connect", ({ req }) => {
    return ok(startConnect());
  }),
  post("/api/slack/token", async ({ req }) => {
    const body = await readJson(req);
    return created(await connectWithToken(String(body.token ?? "")));
  }),
  del("/api/slack/accounts/:id", ({ params }) => ok(deleteSlackAccount(params.id))),
  // ?refresh=1 asks Slack again instead of using the cached answer.
  get("/api/slack/accounts/:id/conversations", async ({ params, url }) =>
    ok(await listConversations(params.id, url.searchParams.get("refresh") === "1")),
  ),
  get("/api/slack/accounts/:id/unread", async ({ params, url }) =>
    ok(await unreadCounts(params.id, url.searchParams.get("refresh") === "1")),
  ),
  get("/api/slack/accounts/:id/conversations/:channel/messages", async ({ params, url }) =>
    ok(await listMessages(params.id, params.channel, url.searchParams.get("refresh") === "1")),
  ),
  get("/api/slack/accounts/:id/conversations/:channel/threads/:ts", async ({ params, url }) =>
    ok(await listReplies(params.id, params.channel, params.ts, url.searchParams.get("refresh") === "1")),
  ),
  post("/api/slack/accounts/:id/conversations/:channel/messages", async ({ req, params }) => {
    const body = await readJson(req);
    return created(await sendMessage(params.id, params.channel, String(body.text ?? ""), body.threadTs ? String(body.threadTs) : undefined));
  }),
];
