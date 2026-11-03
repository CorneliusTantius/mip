import { createTransport } from "nodemailer";
import { type MailAccount } from "./accounts.js";

// Sending through an account's SMTP server, with the account's own login. Nothing is kept on the server here; most providers keep a copy in
// the account's Sent folder. A failure is thrown as it came, and the caller names the account it was for.

// How long a send waits on the server at each step before it gives up, so a bot is not left waiting on a server that does not answer.
const TIMEOUT_MS = 20_000;

export interface OutgoingMail {
  to: string[];
  cc: string[];
  subject: string;
  text: string;
}

// Sends one message from the account's address. Returns the Message-ID the message was sent with.
export async function sendThrough(account: MailAccount, mail: OutgoingMail): Promise<string> {
  const transport = createTransport({
    host: account.smtp.host,
    port: account.smtp.port,
    secure: account.smtp.secure,
    auth: { user: account.user, pass: account.password },
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  });
  try {
    const info = await transport.sendMail({
      from: account.user,
      to: mail.to,
      cc: mail.cc.length > 0 ? mail.cc : undefined,
      subject: mail.subject,
      text: mail.text,
    });
    return info.messageId;
  } finally {
    transport.close();
  }
}
