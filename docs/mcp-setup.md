# t2000 MCP Server — Setup Guide

Connect your AI (Claude Desktop, Cursor, Claude Code, Windsurf, Codex) to your t2000 agent bank account.

## Quick Start — 4 commands

```bash
npm i -g @t2000/cli          # install
t2000 init                    # create wallet
t2000 config set maxPerTx 100 # set safeguards
t2000 mcp install             # auto-configure Claude Desktop + Cursor
```

Restart your AI platform, then ask: **"What's my t2000 balance?"**

That's it. No config files to edit, no JSON to paste.

> **Note:** The first time you run a command after `t2000 init`, you'll be prompted for your PIN. This creates a session that MCP reuses — no PIN needed in any config file.

---

## What `t2000 mcp install` does

Automatically writes the MCP config to:
- **Claude Desktop** — `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Cursor** — `~/.cursor/mcp.json`

It preserves any existing settings and is idempotent (safe to run multiple times).

To remove: `t2000 mcp uninstall`

---

## Manual config (other platforms)

For platforms not auto-detected, paste this into your MCP settings:

```json
{ "mcpServers": { "t2000": { "command": "t2000", "args": ["mcp"] } } }
```

### CI / Automation

When no session file exists, pass PIN via environment variable:

```json
{
  "mcpServers": {
    "t2000": {
      "command": "t2000",
      "args": ["mcp"],
      "env": { "T2000_PIN": "YOUR_PIN_HERE" }
    }
  }
}
```

---

## Available Tools (16)

### Read-Only (7)

| Tool | Description |
|------|-------------|
| `t2000_balance` | Current balance — checking, savings, gas, total |
| `t2000_address` | Agent's Sui wallet address |
| `t2000_positions` | Lending positions across protocols |
| `t2000_rates` | Best interest rates per asset |
| `t2000_health` | Health factor for borrows |
| `t2000_history` | Recent transactions |
| `t2000_earnings` | Yield earnings from savings |

### State-Changing (7)

All support `dryRun: true` for previews without signing.

| Tool | Description |
|------|-------------|
| `t2000_send` | Send USDC to a Sui address |
| `t2000_save` | Deposit to savings (earn yield) |
| `t2000_withdraw` | Withdraw from savings |
| `t2000_borrow` | Borrow against collateral |
| `t2000_repay` | Repay borrowed USDC |
| `t2000_exchange` | Swap assets via DEX |
| `t2000_rebalance` | Optimize yield across protocols |

### Safety (2)

| Tool | Description |
|------|-------------|
| `t2000_config` | View/set safeguard limits |
| `t2000_lock` | Emergency freeze all operations |

> `unlock` is intentionally CLI-only — only a human can resume operations.

## Prompts (3)

| Prompt | Description |
|--------|-------------|
| `financial-report` | Comprehensive financial summary |
| `optimize-yield` | Yield optimization analysis |
| `send-money` | Guided send flow with preview |

---

## Security

- **Safeguard gate:** MCP server refuses to start without configured limits
- **Per-transaction limits:** Cap individual transaction amounts
- **Daily send limits:** Cap total daily outbound transfers
- **Lock/unlock:** AI can lock, only humans can unlock
- **dryRun previews:** Preview any operation before signing
- **Local-only:** stdio transport, private key never leaves the machine
