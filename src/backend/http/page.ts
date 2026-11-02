import type { ServerResponse } from "node:http";

// A small HTML page for the browser to show after a sign-in comes back to mip. It is a page, not JSON, since the user is looking at it.
export function page(res: ServerResponse, status: number, title: string, message: string): void {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title>` +
      `<body style="font-family: system-ui, sans-serif; padding: 2rem"><h1>${escape(title)}</h1><p>${escape(message)}</p></body>`,
  );
}

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}
