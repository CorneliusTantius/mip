import type { FetchMessageObject } from "imapflow";
import type { AddressObject } from "mailparser";

// The shape of a message as the mail card reads it. A header comes from the envelope and flags, without the body. A message adds the
// recipients and the text, which is cut to the account's limit.
export interface MailHeader {
  uid: number;
  from: string;
  subject: string;
  date: string | null;
  seen: boolean;
}

export interface MailMessage extends MailHeader {
  to: string;
  text: string;
  truncated: boolean;
}

// The header of a message the server returned. A field the server did not send is empty, so one odd message cannot stop the list.
export function headerOf(message: FetchMessageObject): MailHeader {
  const envelope = message.envelope;
  const sender = envelope?.from?.[0];
  const date = envelope?.date;
  return {
    uid: message.uid,
    from: sender ? senderText(sender.name, sender.address) : "",
    subject: envelope?.subject ?? "",
    date: date instanceof Date ? date.toISOString() : typeof date === "string" ? date : null,
    seen: message.flags?.has("\\Seen") === true,
  };
}

// A sender as "Name <address>", or the address alone when the message gives no name.
export function senderText(name: string | undefined, address: string | undefined): string {
  if (!address) return name ?? "";
  return name ? `${name} <${address}>` : address;
}

// The full message: the header, the recipients, and the text. The body is cut to maxBytes, and the reply says when it was cut.
export function messageOf(
  header: MailHeader,
  parsed: { to?: AddressObject | AddressObject[]; text?: string; html?: string | false },
  maxBytes: number,
): MailMessage {
  const body = clipBody(parsed.text ?? htmlToText(parsed.html), maxBytes);
  return { ...header, to: addressesText(parsed.to), text: body.text, truncated: body.truncated };
}

// Cuts text to maxBytes of UTF-8, and says whether it was cut.
export function clipBody(text: string, maxBytes: number): { text: string; truncated: boolean } {
  const bytes = Buffer.from(text, "utf8");
  if (bytes.length <= maxBytes) return { text, truncated: false };
  return { text: bytes.subarray(0, maxBytes).toString("utf8"), truncated: true };
}

// The text of an HTML body without its tags, for a message that has no plain text part.
export function htmlToText(html: string | false | undefined): string {
  if (!html) return "";
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

function addressesText(to: AddressObject | AddressObject[] | undefined): string {
  if (!to) return "";
  const list = Array.isArray(to) ? to : [to];
  return list.map((address) => address.text).join(", ");
}
