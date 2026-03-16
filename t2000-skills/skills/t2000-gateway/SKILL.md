---
name: t2000-gateway
description: >-
  Start and configure the t2000 AI financial advisor gateway.
  Use when asked to set up Telegram, start the gateway, configure
  LLM provider, manage the daemon, or troubleshoot the AI advisor.
instructions: |
  ## t2000 Gateway — Personal AI Financial Advisor

  The gateway turns t2000 into a personal AI financial advisor that runs
  locally and talks to you on Telegram or WebChat.

  ### Setup (first time)

  ```bash
  t2000 init                 # Guided wizard: wallet, PIN, AI, Telegram, safeguards
  t2000 gateway              # Start the gateway
  ```

  The init wizard auto-opens browser pages for API keys and BotFather.

  ### Start the Gateway

  ```bash
  t2000 gateway                    # Foreground
  t2000 gateway --port 3000        # Custom WebChat port
  t2000 gateway --no-telegram      # Skip Telegram
  t2000 gateway --verbose          # Debug logging
  ```

  ### Daemon Mode (24/7)

  ```bash
  t2000 gateway install            # launchd (macOS) / systemd (Linux)
  t2000 gateway uninstall          # Remove daemon
  t2000 gateway status             # Check if running
  t2000 gateway logs               # Tail structured JSON logs
  t2000 gateway logs -f            # Follow mode
  ```

  ### Configuration

  Config lives at `~/.t2000/config.json`. Use dot-notation:

  ```bash
  t2000 config set llm.provider anthropic
  t2000 config set llm.apiKey sk-ant-...
  t2000 config set channels.telegram.botToken <token>
  t2000 config set channels.telegram.allowedUsers '["12345"]'
  t2000 config set channels.webchat.port 2000
  t2000 config set heartbeat.morningBriefing.schedule "0 8 * * *"
  t2000 config get llm.provider
  ```

  ### Channels

  - **WebChat:** Local web UI at `http://localhost:2000`. SSE streaming, tool badges, confirmation buttons.
  - **Telegram:** grammY bot. Allowlisted users only. PIN unlock via chat. Auto-splits long messages.

  ### Heartbeat Tasks

  | Task | Default Schedule | What it does |
  |------|-----------------|--------------|
  | Morning Briefing | 8:00 AM daily | Net worth, portfolio, yield, AI cost |
  | Yield Monitor | Every 30 min | Alerts if better APY found |
  | DCA Executor | 9:00 AM Monday | Runs pending auto-invest schedules |
  | Health Check | Every 15 min | Warns if health factor drops |

  ### LLM Providers

  BYOK (Bring Your Own Key):
  - **Anthropic:** Claude Sonnet (default: claude-sonnet-4-20250514)
  - **OpenAI:** GPT-4o

  ### Security

  - Non-custodial — keys stay on user's machine, encrypted with PIN
  - Telegram allowlist — only specified user IDs can interact
  - Confirmation flow — all state-changing actions need explicit "yes"
  - Safeguards enforced on all channels (same as CLI/MCP)

  ### Troubleshooting

  - **"LLM API key not configured"** → `t2000 config set llm.apiKey <key>`
  - **"Port in use"** → Another gateway is running. `t2000 gateway status`
  - **Telegram 401** → Invalid bot token. `t2000 config set channels.telegram.botToken <new-token>`
  - **No heartbeat notifications** → Check if gateway is running: `t2000 gateway status`
  - **View logs** → `t2000 gateway logs -f` or `~/.t2000/logs/gateway.log`
---
