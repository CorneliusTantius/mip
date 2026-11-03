// A small SMTP server for the mail tests. It takes one login, with AUTH PLAIN, and then the messages a client sends after it. Each message is
// kept with its envelope, so a test can check what was sent and to whom. It does not offer encryption, so a test connects without it.
import { createServer } from "node:net";

// Starts the server on a free local port. Returns the port, the messages it has taken, and a way to stop.
export function startFakeSmtp({ user, password }) {
  const sent = [];
  const sockets = new Set();

  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    let pending = "";
    let authed = false;
    let awaitingLogin = false;
    let envelope = { from: "", to: [] };
    // The lines of a message being received, or null while commands are read.
    let data = null;
    const send = (line) => socket.write(`${line}\r\n`);
    const address = (argument) => /<([^>]*)>/.exec(argument)?.[1] ?? "";

    const checkLogin = (token) => {
      const [, login, secret] = Buffer.from(token, "base64").toString("utf8").split("\0");
      if (login === user && secret === password) {
        authed = true;
        return send("235 2.7.0 Authenticated");
      }
      return send("535 5.7.8 Invalid login");
    };

    const onData = (line) => {
      if (line === ".") {
        sent.push({ from: envelope.from, to: envelope.to, data: data.join("\r\n") });
        data = null;
        envelope = { from: "", to: [] };
        return send("250 2.0.0 queued");
      }
      data.push(line.startsWith("..") ? line.slice(1) : line);
    };

    const onCommand = (line) => {
      const [verb = "", ...rest] = line.split(" ");
      const command = verb.toUpperCase();
      const argument = rest.join(" ");
      if (command === "EHLO" || command === "HELO") {
        send("250-fake");
        return send("250 AUTH PLAIN");
      }
      if (command === "AUTH") {
        if (rest[0]?.toUpperCase() !== "PLAIN") return send("504 only PLAIN is offered");
        if (rest[1]) return checkLogin(rest[1]);
        awaitingLogin = true;
        return send("334 ");
      }
      if (command === "MAIL") {
        if (!authed) return send("530 5.7.0 Authentication required");
        envelope.from = address(argument);
        return send("250 2.1.0 OK");
      }
      if (command === "RCPT") {
        if (!authed) return send("530 5.7.0 Authentication required");
        envelope.to.push(address(argument));
        return send("250 2.1.5 OK");
      }
      if (command === "DATA") {
        data = [];
        return send("354 End data with <CR><LF>.<CR><LF>");
      }
      if (command === "RSET") {
        envelope = { from: "", to: [] };
        return send("250 2.0.0 OK");
      }
      if (command === "NOOP") return send("250 2.0.0 OK");
      if (command === "QUIT") {
        send("221 2.0.0 bye");
        return socket.end();
      }
      return send("502 5.5.1 not implemented");
    };

    send("220 fake SMTP ready");
    socket.on("data", (chunk) => {
      pending += chunk.toString("utf8");
      let end;
      while ((end = pending.indexOf("\r\n")) !== -1) {
        const line = pending.slice(0, end);
        pending = pending.slice(end + 2);
        if (data) onData(line);
        else if (awaitingLogin) {
          awaitingLogin = false;
          checkLogin(line);
        } else onCommand(line);
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        port: server.address().port,
        // The messages taken so far, oldest first, each with its envelope sender and recipients and its text.
        sent,
        stop: () =>
          new Promise((done) => {
            for (const socket of sockets) socket.destroy();
            server.close(() => done());
          }),
      });
    });
  });
}
