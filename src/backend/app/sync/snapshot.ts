import * as pi from "../../storage/pi.js";
import * as store from "../../storage/sync.js";
import { readMailAccounts, writeMailAccounts } from "../mail/accounts.js";
import { dropMailbox, readMailCache, saveMailbox } from "../mail/cache.js";
import { mcpConfigText, parseMcpConfig, readMcpConfig, writeMcpConfigText } from "../mcp/config.js";
import { dropSlackEntry, slackEntries, setSlackEntry } from "../slack/cache.js";
import { readSlackConfig, writeSlackState } from "../slack/config.js";
import { AppError } from "../errors.js";
import {
  indexBy,
  keyOf,
  sameRecord,
  type AgentRecord,
  type MailCacheRecord,
  type MailRecord,
  type McpServerRecord,
  type PiFileRecord,
  type SlackAppRecord,
  type SlackCacheRecord,
  type SlackRecord,
  type Snapshot,
} from "./merge.js";

// Reads this machine's data as a snapshot, in the shape the dotmip repo stores: the database, and the MCP servers, mail accounts, and Slack
// connection in their files.
export function readLocal(): Snapshot {
  return {
    personas: indexBy(store.readPersonaRows(), keyOf.persona),
    bots: indexBy(store.readBotRows(), keyOf.bot),
    notes: indexBy(store.readNoteRows(), keyOf.note),
    agents: indexBy(
      store.readAgentRows().map((agent) => ({ ...agent, messages: store.readMessageRows(agent.id) })),
      keyOf.agent,
    ),
    rooms: indexBy(store.readRoomRows(), keyOf.room),
    room: indexBy(store.readRoomMessageRows(), keyOf.roomMessage),
    mcp: indexBy(readMcpServers(), keyOf.mcp),
    mail: indexBy(readMailForSync(), keyOf.mail),
    ...readSlackForSync(),
    piCredentials: indexBy(pi.readPiCredentialRows(), keyOf.piCredential),
    piModels: indexBy(pi.readPiModelRows(), keyOf.piModel),
    piFiles: indexBy(readPiFiles(), keyOf.piFile),
    mailCache: indexBy(readMailCacheForSync(), keyOf.mailCache),
    slackCache: indexBy(readSlackCacheForSync(), keyOf.slackCache),
  };
}

// The mail headers kept per account, one record each.
function readMailCacheForSync(): MailCacheRecord[] {
  return Object.entries(readMailCache()).map(([accountId, mailbox]) => ({ accountId, ...mailbox }));
}

// The Slack answers kept, one record each. The time they were read is the record's change time.
function readSlackCacheForSync(): SlackCacheRecord[] {
  return Object.entries(slackEntries()).map(([key, entry]) => ({ key, updatedAt: entry.at, value: entry.value }));
}

// The Pi config files that exist in Pi's agent folder, with their text.
function readPiFiles(): PiFileRecord[] {
  return pi.PI_CONFIG_FILES.flatMap((name) => {
    const text = pi.readPiConfigFile(name);
    return text === undefined ? [] : [{ name, text }];
  });
}

// The servers in mcp.json. A file with a problem stops the sync: a server left out by mistake would be deleted on GitHub.
function readMcpServers(): McpServerRecord[] {
  const { servers, problems } = readMcpConfig();
  if (problems.length > 0) {
    const first = problems[0];
    throw new AppError(409, `mcp.json has a problem with "${first.server}": ${first.error}. Fix it, then sync again. Nothing was changed.`);
  }
  return servers;
}

// The accounts in mail.json, app passwords included. A file with a problem stops the sync, for the same reason as mcp.json.
function readMailForSync(): MailRecord[] {
  const { accounts, problems } = readMailAccounts();
  if (problems.length > 0) {
    const first = problems[0];
    throw new AppError(409, `mail.json has a problem with "${first.account}": ${first.error}. Fix it, then sync again. Nothing was changed.`);
  }
  return accounts;
}

// The Slack app and accounts in slack.json, as the two snapshot parts. A file with a problem stops the sync, for the same reason as mcp.json.
function readSlackForSync(): { slackApp: Record<string, SlackAppRecord>; slack: Record<string, SlackRecord> } {
  const { app, accounts, problems } = readSlackConfig();
  if (problems.length > 0) {
    const first = problems[0];
    throw new AppError(409, `slack.json has a problem with "${first.account}": ${first.error}. Fix it, then sync again. Nothing was changed.`);
  }
  return {
    slackApp: indexBy(app ? [{ clientId: app.clientId, clientSecret: app.clientSecret }] : [], keyOf.slackApp),
    slack: indexBy(accounts, keyOf.slack),
  };
}

// Changes the database, mcp.json, mail.json, and slack.json so they match target. Only records that differ from local are written. A removal the database refuses
// (see storage/sync.ts) leaves the record in place, so the snapshot read after this still has it.
export function applySnapshot(local: Snapshot, target: Snapshot): void {
  applyMcp(local.mcp, target.mcp);
  applyMail(local.mail, target.mail);
  applySlack(local, target);
  applyPart(local.piCredentials, target.piCredentials, pi.writePiCredentialRow, (credential) => pi.removePiCredentialRow(credential.providerId));
  applyPart(local.piModels, target.piModels, pi.writePiModelRow, (model) => pi.removePiModelRow(model.providerId));
  applyPart(local.piFiles, target.piFiles, (file) => pi.writePiConfigFile(file.name as pi.PiConfigFile, file.text), (file) => pi.removePiConfigFile(file.name as pi.PiConfigFile));
  applyPart(
    local.mailCache,
    target.mailCache,
    ({ accountId, uidValidity, messages }) => saveMailbox(accountId, { uidValidity, messages }),
    ({ accountId }) => {
      dropMailbox(accountId);
      return true;
    },
  );
  applyPart(
    local.slackCache,
    target.slackCache,
    ({ key, updatedAt, value }) => setSlackEntry(key, { at: updatedAt, value }),
    ({ key }) => {
      dropSlackEntry(key);
      return true;
    },
  );
  applyPart(local.personas, target.personas, store.writePersonaRow, (persona) => store.removePersonaRow(persona.id));
  applyPart(local.bots, target.bots, store.writeBotRow, (bot) => store.removeBotRow(bot.name));
  applyPart(local.notes, target.notes, store.writeNoteRow, (note) => store.removeNoteRow(note.title));
  applyPart(local.agents, target.agents, writeAgent, (agent) => store.removeAgentRow(agent.id));
  // Rooms come after bots, so a room's members are found. A room's messages are dropped with it (see storage/sync.ts).
  applyPart(local.rooms, target.rooms, store.writeRoomRow, (room) => store.removeRoomRow(room.id));
  // Room messages are only added, as the merge keeps both sides' messages. They go in sent order, so each room reads in time.
  const added = Object.keys(target.room)
    .filter((key) => local.room[key] === undefined)
    .map((key) => target.room[key])
    .sort((x, y) => x.createdAt - y.createdAt);
  for (const message of added) store.insertRoomMessageRow(message);
}

// Rewrites mcp.json when the servers differ. The new text is checked before anything is written, so a server that would not load
// leaves the file as it was.
function applyMcp(local: Record<string, McpServerRecord>, target: Record<string, McpServerRecord>): void {
  const names = new Set([...Object.keys(local), ...Object.keys(target)]);
  if ([...names].every((name) => sameRecord(local[name], target[name]))) return;
  const servers = Object.keys(target).map((name) => target[name]);
  const text = mcpConfigText(servers);
  const { problems } = parseMcpConfig(text);
  if (problems.length > 0) {
    const first = problems[0];
    throw new AppError(409, `a synced MCP server cannot be used: "${first.server}": ${first.error}. Nothing was changed.`);
  }
  writeMcpConfigText(text);
}

// Rewrites mail.json when the accounts differ. writeMailAccounts checks the new accounts before it writes.
function applyMail(local: Record<string, MailRecord>, target: Record<string, MailRecord>): void {
  const ids = new Set([...Object.keys(local), ...Object.keys(target)]);
  if ([...ids].every((id) => sameRecord(local[id], target[id]))) return;
  writeMailAccounts(Object.values(target));
}

// Rewrites slack.json when the app or an account differs. writeSlackState checks the new state before it writes.
function applySlack(local: Snapshot, target: Snapshot): void {
  const same = sameRecord(local.slackApp, target.slackApp) && sameRecord(local.slack, target.slack);
  if (same) return;
  writeSlackState(Object.values(target.slackApp)[0], Object.values(target.slack));
}

// Writes an agent's settings, then adds the messages the database does not have yet. Messages are never removed here.
function writeAgent(agent: AgentRecord): void {
  store.writeAgentRow(agent);
  const have = new Set(store.readMessageRows(agent.id).map(keyOf.message));
  for (const message of agent.messages) {
    if (!have.has(keyOf.message(message))) store.insertMessageRow(agent.id, message);
  }
}

function applyPart<T>(local: Record<string, T>, target: Record<string, T>, write: (record: T) => void, remove: (record: T) => boolean): void {
  for (const key of new Set([...Object.keys(local), ...Object.keys(target)])) {
    const before = local[key];
    const after = target[key];
    if (after !== undefined) {
      if (!sameRecord(before, after)) write(after);
    } else if (before !== undefined) {
      remove(before);
    }
  }
}
