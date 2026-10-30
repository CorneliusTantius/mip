import { createProviders, findProvider } from "./agent/registry.js";

// Usage: npm start -- "prompt" [--provider claude-cli|pi] [--model <name>] [--session <id>]
function parseArgs(argv: string[]) {
  const promptParts: string[] = [];
  let provider = "claude-cli";
  let model: string | undefined;
  let sessionId: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--provider") provider = argv[++i];
    else if (arg === "--model") model = argv[++i];
    else if (arg === "--session") sessionId = argv[++i];
    else promptParts.push(arg);
  }

  return { prompt: promptParts.join(" ").trim(), provider, model, sessionId };
}

async function main() {
  const { prompt, provider: providerId, model, sessionId } = parseArgs(process.argv.slice(2));
  if (!prompt) {
    console.error('Usage: npm start -- "your prompt" [--provider claude-cli|pi] [--model <name>] [--session <id>]');
    process.exit(1);
  }

  const provider = findProvider(createProviders(), providerId);
  let failed = false;

  for await (const event of provider.run({ prompt, model, sessionId })) {
    switch (event.type) {
      case "text":
        process.stdout.write(event.text);
        break;
      case "tool_call":
        console.error(`\n[tool ${event.name}]`);
        break;
      case "tool_result":
        console.error(`[${event.isError ? "tool error" : "tool done"}]`);
        break;
      case "error":
        console.error(`\n[${provider.id}] error: ${event.message}`);
        failed = true;
        break;
      case "done":
        console.log();
        console.error(`(session: ${event.sessionId ?? "unknown"})`);
        break;
    }
  }

  process.exit(failed ? 1 : 0);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
