// Reads the text boxes of the add-server form. Each reader skips blank lines, and throws with the line that is wrong, so the form can say
// what to fix. The server checks the same things again, so these only give the user a better message.

// Lines of "Name: value", such as "Authorization: Bearer abc". The name is everything before the first colon.
export function parseHeaders(text: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of lines(text)) {
    const colon = line.indexOf(":");
    const name = colon < 0 ? "" : line.slice(0, colon).trim();
    if (!name) throw new Error(`A header needs a name and a colon, such as "Authorization: Bearer token". Check: ${line}`);
    headers[name] = line.slice(colon + 1).trim();
  }
  return headers;
}

// Lines of "KEY=value", for environment values a command takes.
export function parseEnv(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of lines(text)) {
    const equals = line.indexOf("=");
    const name = equals < 0 ? "" : line.slice(0, equals).trim();
    if (!name) throw new Error(`An environment value needs a name and an equals sign, such as TOKEN=abc. Check: ${line}`);
    env[name] = line.slice(equals + 1).trim();
  }
  return env;
}

// One argument per line, so an argument may contain spaces.
export function parseArgs(text: string): string[] {
  return lines(text);
}

function lines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
