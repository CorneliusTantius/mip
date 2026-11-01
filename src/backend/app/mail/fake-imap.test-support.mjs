// A small IMAP server for the mail tests and for a live check of the card. It speaks the commands imapflow sends to read a mailbox: the
// greeting, CAPABILITY, ID, LOGIN, STATUS, EXAMINE and SELECT, FETCH with UID, FLAGS, ENVELOPE and BODY[], NOOP, and LOGOUT. It serves one
// mailbox, INBOX, with the messages it is given. It records every body fetch, and it sets \Seen only for a fetch that is not BODY.PEEK,
// as a real server does, so a test can check that reading does not mark a message read.
import { createServer } from "node:net";

const quote = (text) => `"${String(text).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

// The message as an RFC 822 text, which the mail parser reads.
export function rawMessage({ from, to, subject, date, body }) {
  return `From: ${from}\r\nTo: ${to}\r\nSubject: ${subject}\r\nDate: ${date}\r\n\r\n${body}\r\n`;
}

// The envelope of a message: date, subject, and the sender in each address list the envelope has.
function envelopeOf(message) {
  // "Name <address>", or a bare address.
  const named = /^(.*?)\s*<([^>]+)>$/.exec(message.from);
  const name = named ? named[1] : "";
  const address = named ? named[2] : message.from;
  const [local, domain] = address.split("@");
  const sender = `((${name ? quote(name) : "NIL"} NIL ${quote(local)} ${quote(domain)}))`;
  return `(${quote(message.date)} ${quote(message.subject)} ${sender} ${sender} ${sender} NIL NIL NIL NIL ${quote(`<${message.uid}@fake>`)})`;
}

// Starts the server on a free local port, or on the port given. Returns the port, the body fetches so far, the flags of each message, and a
// way to stop.
export function startFakeImap({ user, password, messages, port = 0 }) {
  const store = messages.map((message) => ({ ...message, flags: new Set(message.flags ?? []) }));
  const fetches = [];
  const sockets = new Set();

  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    let pending = "";
    let signedIn = false;
    let selected = false;
    const send = (text) => socket.write(text);
    send("* OK fake IMAP ready\r\n");

    const unseen = () => store.filter((message) => !message.flags.has("\\Seen")).length;

    const fetch = (tag, args) => {
      const [, setText, itemText] = /^(?:UID\s+)?FETCH\s+(\S+)\s+\((.*)\)$/i.exec(args) ?? [];
      if (!setText) return send(`${tag} BAD cannot read that FETCH\r\n`);
      const byUid = /^UID\s+/i.test(args);
      const items = itemText.toUpperCase().split(/\s+/);
      const wanted = setText === "*" ? [store.length] : setText.split(",").flatMap((part) => {
        const [first, last] = part.split(":");
        const low = Number(first);
        const high = last === "*" ? store.length : Number(last ?? first);
        return Array.from({ length: Math.max(0, high - low + 1) }, (_, i) => low + i);
      });
      for (const key of wanted) {
        const index = byUid ? store.findIndex((message) => message.uid === key) : key - 1;
        const message = store[index];
        if (!message) continue;
        const parts = [];
        if (items.includes("UID")) parts.push(`UID ${message.uid}`);
        if (items.includes("FLAGS")) parts.push(`FLAGS (${[...message.flags].join(" ")})`);
        if (items.includes("ENVELOPE")) parts.push(`ENVELOPE ${envelopeOf(message)}`);
        const body = items.find((item) => item === "BODY[]" || item === "BODY.PEEK[]");
        if (body) {
          const raw = rawMessage(message);
          fetches.push({ uid: message.uid, peek: body === "BODY.PEEK[]" });
          if (body === "BODY[]") message.flags.add("\\Seen");
          parts.push(`BODY[] {${Buffer.byteLength(raw)}}\r\n${raw}`);
        }
        send(`* ${index + 1} FETCH (${parts.join(" ")})\r\n`);
      }
      send(`${tag} OK FETCH completed\r\n`);
    };

    const open = (tag, command, mailbox) => {
      if (!signedIn) return send(`${tag} NO not signed in\r\n`);
      if (mailbox.toUpperCase() !== "INBOX") return send(`${tag} NO no such mailbox\r\n`);
      selected = true;
      send(`* ${store.length} EXISTS\r\n* 0 RECENT\r\n* FLAGS (\\Seen \\Answered \\Flagged \\Deleted \\Draft)\r\n`);
      send(`* OK [UIDVALIDITY 1] UIDs valid\r\n* OK [UIDNEXT ${store.length + 1}] Predicted next UID\r\n`);
      send(`${tag} OK [${command === "EXAMINE" ? "READ-ONLY" : "READ-WRITE"}] ${command} completed\r\n`);
    };

    const handle = (line) => {
      const space = line.indexOf(" ");
      const tag = line.slice(0, space);
      const [command, ...rest] = line.slice(space + 1).split(" ");
      const args = line.slice(space + 1 + command.length + 1);
      switch (command.toUpperCase()) {
        case "CAPABILITY":
          return send(`* CAPABILITY IMAP4rev1 LOGIN ID\r\n${tag} OK CAPABILITY completed\r\n`);
        case "ID":
          return send(`* ID ("name" "fake")\r\n${tag} OK ID completed\r\n`);
        case "NOOP":
          return send(`${tag} OK NOOP completed\r\n`);
        case "LIST":
          return send(`* LIST (\\HasNoChildren) "/" "INBOX"\r\n${tag} OK LIST completed\r\n`);
        case "LOGIN": {
          const [login, secret] = rest.map((token) => token.replace(/^"|"$/g, ""));
          if (login !== user || secret !== password) return send(`${tag} NO [AUTHENTICATIONFAILED] Invalid credentials\r\n`);
          signedIn = true;
          return send(`${tag} OK LOGIN completed\r\n`);
        }
        case "STATUS": {
          if (!signedIn) return send(`${tag} NO not signed in\r\n`);
          return send(`* STATUS "INBOX" (MESSAGES ${store.length} UNSEEN ${unseen()})\r\n${tag} OK STATUS completed\r\n`);
        }
        case "EXAMINE":
        case "SELECT":
          return open(tag, command.toUpperCase(), rest.join(" ").replace(/^"|"$/g, ""));
        case "FETCH":
          if (!selected) return send(`${tag} NO no mailbox selected\r\n`);
          return fetch(tag, `${command} ${rest.join(" ")}`.replace(/^FETCH\s+/i, "FETCH "));
        case "UID":
          if (!selected) return send(`${tag} NO no mailbox selected\r\n`);
          return fetch(tag, `UID ${rest.join(" ")}`);
        case "LOGOUT":
          send(`* BYE logging out\r\n${tag} OK LOGOUT completed\r\n`);
          return socket.end();
        default:
          return send(`${tag} BAD unsupported command\r\n`);
      }
    };

    socket.on("data", (chunk) => {
      pending += chunk.toString("utf8");
      let end;
      while ((end = pending.indexOf("\r\n")) !== -1) {
        const line = pending.slice(0, end);
        pending = pending.slice(end + 2);
        if (line) handle(line);
      }
    });
    socket.on("error", () => {});
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      resolve({
        port: server.address().port,
        fetches,
        flagsOf: (uid) => [...(store.find((message) => message.uid === uid)?.flags ?? [])],
        stop: () =>
          new Promise((done) => {
            for (const socket of sockets) socket.destroy();
            server.close(() => done());
          }),
      });
    });
  });
}
