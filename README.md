# mip

An AIOS that routes tasks to model providers. Providers sit behind one interface, so the dashboard, the CLI, and the agent loop don't depend on any one of them.

## Providers

| Provider | How it runs | Sign-in |
| --- | --- | --- |
| `claude-cli` | Runs the official `claude` CLI and streams its output | Your Claude subscription, through `claude auth login` |
| `pi` | Runs Pi's SDK in-process (`@earendil-works/pi-coding-agent`) | Per Pi provider: subscription login where offered, or an API key |

Pi's Anthropic entry offers an API key only. Reported terms restrict using a Claude Pro/Max token inside a third-party tool, so mip doesn't offer that login for Anthropic inside Pi.

## Requirements

- Node.js 20+ (developed on v26 LTS)
- For `claude-cli`: the `claude` CLI, logged in with your subscription

## Setup

```bash
npm install
npm run build
```

## Dashboard

```bash
npm run serve
```

Open http://127.0.0.1:3000. The gear icon opens Settings, which lists each provider with its capabilities and sign-in targets. From there you can sign in, answer a sign-in prompt, or sign out.

Set `CLAUDE_BIN` if the `claude` binary isn't on PATH.

## Command line

```bash
npm start -- "summarize the README in this folder"
npm start -- "continue the last task" --session <id>
npm start -- "explain this error" --provider pi --model <provider>/<model-id>
```

`--provider` defaults to `claude-cli`. Each run prints the answer, then the session id on stderr, so you can resume it with `--session`. `--model` takes `provider/model` for Pi.

## HTTP API

- `GET /api/providers`: providers, capabilities, sign-in targets, and any sign-in in progress
- `POST /api/providers/:provider/targets/:target/sign-in` with `{"method": "..."}`
- `POST /api/providers/:provider/targets/:target/answer` with `{"answer": "..."}`
- `POST /api/providers/:provider/targets/:target/sign-out`
- `POST /api/run` with `{"provider", "prompt", "model?", "sessionId?"}`: streams newline-delimited JSON events

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `CLAUDE_BIN` | `claude` | Path to the claude binary |
| `MIP_PORT` | `3000` | Dashboard port, bound to 127.0.0.1 |
| `MIP_DATA_DIR` | `./.mip` | Pi session files |

`ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` are removed from the child process environment for `claude-cli`, so the CLI uses your subscription login. Don't pass `--bare` to the CLI: it ignores subscription login.

Pi keeps its credentials in `~/.pi/agent/auth.json`, the same place the `pi` CLI uses.

## Layout

- `src/agent/types.ts`: the provider interface and event types
- `src/agent/providers/claude-cli.ts`: Claude CLI adapter
- `src/agent/providers/pi.ts`: Pi adapter
- `src/agent/registry.ts`: which providers the app offers
- `src/agent/sign-in-session.ts`, `src/agent/async-queue.ts`: shared helpers
- `src/server.ts`: HTTP API; `src/dashboard.ts`: dashboard page
- `src/index.ts`: command-line entry point
