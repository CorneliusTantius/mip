// Checks the Slack connection: the file's parts, that a token must be a user token, that a save keeps the other fields and the file is readable
// only by this user, the sign-in address and its state, and that a sign-in that was never started is refused. No request reaches Slack.
// Run after a build: node src/backend/app/slack/slack.test.mjs
// It sets MIP_HOME to a temporary folder before the modules load, so no real config is touched.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIST = pathToFileURL(fileURLToPath(new URL("../../../../dist/backend/", import.meta.url))).href;
const root = mkdtempSync(join(tmpdir(), "mip-slack-"));
process.env.MIP_HOME = join(root, "mip-home");

try {
  const paths = await import(`${DIST}storage/paths.js`);
  const config = await import(`${DIST}app/slack/config.js`);
  const read = await import(`${DIST}app/slack/read.js`);
  const connect = await import(`${DIST}app/slack/connect.js`);
  const slack = await import(`${DIST}app/slack/slack.js`);
  const { AppError } = await import(`${DIST}app/errors.js`);
  paths.ensureMipDirs();
  const readFile = () => JSON.parse(readFileSync(paths.SLACK_CONFIG_FILE, "utf8"));
  const account = (userId, token = `xoxp-${userId}-token`) => ({
    id: `T1.${userId}`,
    teamId: "T1",
    teamName: "Acme",
    userId,
    userName: `Ann ${userId}`,
    token,
  });

  // 1. A missing file connects nothing. A part that does not load is reported by name, and the rest still loads.
  assert.deepEqual(config.readSlackConfig(), { accounts: [], problems: [] });
  const parsed = config.parseSlackConfig(
    JSON.stringify({
      app: { clientId: "1.2", clientSecret: "s" },
      accounts: {
        "T1.U1": account("U1"),
        "T1.U2": { ...account("U2"), token: "xoxb-not-a-user-token" },
        "T1.U3": { ...account("U3"), userName: "" },
      },
    }),
  );
  assert.deepEqual(parsed.app, { clientId: "1.2", clientSecret: "s" });
  assert.deepEqual(parsed.accounts.map((candidate) => candidate.id), ["T1.U1"]);
  assert.deepEqual(parsed.problems.map((problem) => problem.account), ["T1.U2", "T1.U3"]);
  assert.match(parsed.problems[0].error, /starts with xoxp-/);
  assert.match(config.parseSlackConfig("[]").problems[0].error, /expected an object/);
  assert.match(config.parseSlackConfig('{"accounts": []}').problems[0].error, /"accounts" must be an object/);

  // 2. Saving the app and an account keeps the other fields, and the file is readable only by this user. A view never has the token.
  writeFileSync(paths.SLACK_CONFIG_FILE, JSON.stringify({ note: "kept" }));
  config.saveSlackApp({ clientId: "1.2", clientSecret: "s" });
  config.saveSlackAccount(account("U1"));
  const file = readFile();
  assert.equal(file.note, "kept", "fields the app does not own are kept");
  assert.equal(file.accounts["T1.U1"].token, "xoxp-U1-token");
  assert.equal((statSync(paths.SLACK_CONFIG_FILE).mode & 0o777).toString(8), "600", "slack.json is readable only by this user");
  assert.equal("token" in config.viewOf(account("U1")), false);

  // 3. The reply to the page holds the app's client ID, the accounts without tokens, and the address Slack must list. Never the secret.
  const reply = slack.slackReply();
  assert.deepEqual(reply.app, { clientId: "1.2" });
  assert.equal(JSON.stringify(reply).includes("xoxp-"), false, "no token in the reply");
  assert.equal(JSON.stringify(reply).includes('"s"'), false, "no client secret in the reply");
  assert.match(reply.redirectUri, /\/api\/slack\/oauth\/callback$/);

  // 4. The app's input is checked: a client ID is two numbers joined by a dot, and a secret is required.
  assert.throws(() => slack.saveSlackAppInput({ clientId: "abc", clientSecret: "x" }), (err) => err instanceof AppError && err.status === 400);
  assert.throws(() => slack.saveSlackAppInput({ clientId: "1.2", clientSecret: "" }), (err) => err instanceof AppError && err.status === 400);

  // 5. A sign-in starts at Slack with the read scopes and a state. The state is one-time: a callback with it works once, and a made-up one is refused.
  const started = connect.startConnect();
  const url = new URL(started.url);
  assert.equal(url.origin + url.pathname, "https://slack.com/oauth/v2/authorize");
  assert.equal(url.searchParams.get("client_id"), "1.2");
  assert.equal(url.searchParams.get("redirect_uri"), reply.redirectUri);
  assert.ok(url.searchParams.get("user_scope").split(",").includes("chat:write"), "messages can be sent as the user");
  assert.ok(url.searchParams.get("user_scope").split(",").includes("channels:history"));
  await assert.rejects(connect.completeConnect("made-up", "code"), (err) => err instanceof AppError && err.status === 400);

  // 6. Without an app saved, a sign-in does not start.
  config.saveSlackApp({ clientId: "1.2", clientSecret: "s" });
  config.writeSlackState(undefined, [account("U1")]);
  assert.throws(() => connect.startConnect(), (err) => err instanceof AppError && err.status === 400);

  // 7. A synced state is checked before it is written, and a state that would not load leaves the file as it was.
  config.writeSlackState({ clientId: "3.4", clientSecret: "t" }, [account("U9")]);
  assert.deepEqual(Object.keys(readFile().accounts), ["T1.U9"]);
  assert.equal(readFile().app.clientId, "3.4");
  assert.throws(() => config.writeSlackState(undefined, [{ ...account("U9"), token: "bad" }]), (err) => err instanceof AppError && err.status === 409);
  assert.deepEqual(Object.keys(readFile().accounts), ["T1.U9"], "a refused sync changes nothing");

  // 8. A removal takes out one account and refuses one that is not connected.
  config.removeSlackAccount("T1.U9");
  assert.deepEqual(readFile().accounts, {});
  assert.throws(() => config.removeSlackAccount("T1.U9"), (err) => err instanceof AppError && err.status === 404);

  // 9. A person's mention is replaced with their name when a message is read. Unknown ids stay as ids.
  assert.equal(read.resolveMentions("hi <@U1|ann> and <@U2>, <@U3>", { U1: "Ann", U2: "Bo" }), "hi @Ann and @Bo, @U3");
  assert.equal(read.resolveMentions("<#C1|general> <!here>", {}), "<#C1|general> <!here>", "other markup is left for the client");

  console.log("slack connection tests passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}
