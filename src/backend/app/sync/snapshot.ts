import * as store from "../../storage/sync.js";
import { indexBy, keyOf, sameRecord, type ChatRecord, type Snapshot } from "./merge.js";

// Reads this machine's database as a snapshot, in the shape the dotmip repo stores.
export function readLocal(): Snapshot {
  return {
    personas: indexBy(store.readPersonaRows(), keyOf.persona),
    bots: indexBy(store.readBotRows(), keyOf.bot),
    notes: indexBy(store.readNoteRows(), keyOf.note),
    chats: indexBy(
      store.readChatRows().map((chat) => ({ ...chat, messages: store.readMessageRows(chat.id) })),
      keyOf.chat,
    ),
    room: indexBy(store.readRoomRows(), keyOf.room),
  };
}

// Changes the database so it matches target. Only records that differ from local are written. A removal the database refuses
// (see storage/sync.ts) leaves the record in place, so the snapshot read after this still has it.
export function applySnapshot(local: Snapshot, target: Snapshot): void {
  applyPart(local.personas, target.personas, store.writePersonaRow, (persona) => store.removePersonaRow(persona.id));
  applyPart(local.bots, target.bots, store.writeBotRow, (bot) => store.removeBotRow(bot.name));
  applyPart(local.notes, target.notes, store.writeNoteRow, (note) => store.removeNoteRow(note.title));
  applyPart(local.chats, target.chats, writeChat, (chat) => store.removeChatRow(chat.id));
  // Room messages are only added, as the merge keeps both sides' messages. They go in sent order, so the room reads in time.
  const added = Object.keys(target.room)
    .filter((key) => local.room[key] === undefined)
    .map((key) => target.room[key])
    .sort((x, y) => x.createdAt - y.createdAt);
  for (const message of added) store.insertRoomRow(message);
}

// Writes a chat's settings, then adds the messages the database does not have yet. Messages are never removed here.
function writeChat(chat: ChatRecord): void {
  store.writeChatRow(chat);
  const have = new Set(store.readMessageRows(chat.id).map(keyOf.message));
  for (const message of chat.messages) {
    if (!have.has(keyOf.message(message))) store.insertMessageRow(chat.id, message);
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
