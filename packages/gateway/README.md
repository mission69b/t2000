# @t2000/gateway

Personal AI financial advisor — local gateway with Telegram, WebChat, and heartbeat.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

**[Website](https://t2000.ai)** · **[GitHub](https://github.com/mission69b/t2000)** · **[CLI](https://www.npmjs.com/package/@t2000/cli)** · **[SDK](https://www.npmjs.com/package/@t2000/sdk)** · **[MCP](https://www.npmjs.com/package/@t2000/mcp)**

## What is this?

The gateway turns t2000 from a CLI tool into a **personal AI financial advisor** that runs locally on your machine and talks to you on Telegram or a local WebChat. It uses your own LLM API key (Claude or GPT) and never sends your private keys anywhere.

```
User (Telegram/WebChat) → Gateway → LLM (Claude/GPT) → t2000 SDK → Sui Blockchain
```

## Quick Start

```bash
npm i -g @t2000/cli
t2000 init                 # Guided setup: wallet, PIN, AI, Telegram, safeguards
t2000 gateway              # Start the gateway
```

Open `http://localhost:2000` for WebChat, or message your Telegram bot.

## Architecture

```
┌─────────────────────────────────┐
│           Gateway               │
│  ┌─────────┐   ┌────────────┐  │
│  │ WebChat  │   │  Telegram  │  │
│  └────┬─────┘   └─────┬──────┘ │
│       └───────┬────────┘        │
│          Agent Loop             │
│    ┌─────┬─────┬─────┐         │
│    │ LLM │Tools│Confirm│        │
│    └─────┴─────┴─────┘         │
│       Heartbeat Scheduler       │
└─────────────────────────────────┘
         ↓
    @t2000/sdk → Sui
```

### Components

| Component | Description |
|-----------|-------------|
| **Agent Loop** | Processes messages, calls LLM, executes tools, manages confirmation flow |
| **WebChat** | Hono-powered local web UI at `localhost:2000` with SSE streaming |
| **Telegram** | grammY-powered bot with allowlisted users, PIN unlock, message splitting |
| **Heartbeat** | Cron scheduler for morning briefings, yield monitoring, DCA execution, health checks |
| **Logger** | Structured JSON logs to `~/.t2000/logs/gateway.log` with auto-rotation |

## Configuration

Config lives at `~/.t2000/config.json`. Set via CLI:

```bash
# LLM
t2000 config set llm.provider anthropic
t2000 config set llm.apiKey sk-ant-...
t2000 config set llm.model claude-sonnet-4-20250514

# Telegram
t2000 config set channels.telegram.enabled true
t2000 config set channels.telegram.botToken 123456:ABC...
t2000 config set channels.telegram.allowedUsers '["12345"]'

# WebChat
t2000 config set channels.webchat.port 2000

# Heartbeat
t2000 config set heartbeat.morningBriefing.enabled true
t2000 config set heartbeat.morningBriefing.schedule "0 8 * * *"
```

### Full Config Reference

```json
{
  "llm": {
    "provider": "anthropic",
    "apiKey": "sk-ant-...",
    "model": "claude-sonnet-4-20250514"
  },
  "channels": {
    "telegram": {
      "enabled": true,
      "botToken": "123456:ABC...",
      "allowedUsers": ["12345"]
    },
    "webchat": {
      "enabled": true,
      "port": 2000
    }
  },
  "heartbeat": {
    "morningBriefing": { "enabled": true, "schedule": "0 8 * * *" },
    "yieldMonitor": { "enabled": true, "schedule": "*/30 * * * *" },
    "dcaExecutor": { "enabled": true, "schedule": "0 9 * * 1" },
    "healthCheck": { "enabled": true, "schedule": "*/15 * * * *" }
  }
}
```

## CLI Commands

```bash
t2000 gateway                    # Start (foreground)
t2000 gateway --port 3000        # Custom port
t2000 gateway --no-telegram      # Skip Telegram
t2000 gateway --no-heartbeat     # Skip heartbeat
t2000 gateway --verbose          # Debug logging

t2000 gateway install            # Install as daemon (launchd/systemd)
t2000 gateway uninstall          # Remove daemon
t2000 gateway status             # Check if running
t2000 gateway logs               # Tail logs
t2000 gateway logs -f            # Follow mode
```

## Daemon Mode

For 24/7 operation (heartbeat tasks, Telegram always-on):

```bash
t2000 gateway install
```

- **macOS:** Installs as a launchd LaunchAgent — starts on boot, auto-restarts
- **Linux:** Installs as a systemd user service — starts on login, auto-restarts

## Security

- **Non-custodial:** Private keys stay on your machine, encrypted with your PIN
- **BYOK LLM:** Your own API key — no data passes through t2000 servers
- **Telegram allowlist:** Only your user ID can talk to the bot
- **Confirmation flow:** All state-changing actions require explicit confirmation
- **Safeguards:** Per-transaction and daily limits enforced on all channels

## Development

```bash
pnpm install
pnpm --filter @t2000/gateway build
pnpm --filter @t2000/gateway test
pnpm --filter @t2000/gateway typecheck
```

## License

MIT
