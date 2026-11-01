import * as store from "../../storage/sync.js";
import { indexBy, keyOf, sameRecord, type AgentRecord, type Snapshot } from "./merge.js";

// Reads this machine's database as a snapshot, in the shape the dotmip repo stores.
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
  };
}

// Changes the database so it matches target. Only records that differ from local are written. A removal the database refuses
// (see storage/sync.ts) leaves the record in place, so the snapshot read after this still has it.
export function applySnapshot(local: Snapshot, target: Snapshot): void {
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
