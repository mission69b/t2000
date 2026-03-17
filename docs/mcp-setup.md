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

## Available Tools (33)

### Read-Only (9)

| Tool | Description |
|------|-------------|
| `t2000_balance` | Current balance — checking, savings, investment, total |
| `t2000_address` | Agent's Sui wallet address |
| `t2000_positions` | Lending positions across protocols |
| `t2000_rates` | Best interest rates per asset |
| `t2000_health` | Health factor for borrows |
| `t2000_history` | Recent transactions |
| `t2000_earnings` | Yield earnings from savings |
| `t2000_contacts` | List and resolve named contacts |
| `t2000_portfolio` | Investment portfolio — positions, cost basis, P&L |

### State-Changing (11)

All support `dryRun: true` for previews without signing.

| Tool | Description |
|------|-------------|
| `t2000_send` | Send USDC to a Sui address or contact |
| `t2000_save` | Deposit to savings (earn yield) |
| `t2000_withdraw` | Withdraw from savings |
| `t2000_borrow` | Borrow against collateral |
| `t2000_repay` | Repay borrowed USDC |
| `t2000_exchange` | Swap assets via DEX |
| `t2000_rebalance` | Optimize yield across protocols |
| `t2000_invest` | Buy, sell, earn, or unearn investment assets (SUI, BTC, ETH) |
| `t2000_strategy` | Manage strategies — list, buy, sell, status, rebalance, create, delete |
| `t2000_auto_invest` | DCA scheduling — setup, status, run, stop |
| `t2000_claim_rewards` | Claim protocol rewards and auto-convert to USDC |

### Safety (2)

| Tool | Description |
|------|-------------|
| `t2000_config` | View/set safeguard limits |
| `t2000_lock` | Emergency freeze all operations |

> `unlock` is intentionally CLI-only — only a human can resume operations.

## Prompts (15)

### Utility (6)

| Prompt | Description |
|--------|-------------|
| `financial-report` | Comprehensive financial summary |
| `optimize-yield` | Yield optimization analysis |
| `send-money` | Guided send flow with preview |
| `budget-check` | Can I afford $X? — checks balance, limits, spending impact |
| `savings-strategy` | Analyze idle funds, recommend how much to save and where |
| `investment-strategy` | Portfolio analysis — allocation, P&L, buy/sell recommendations |

### AI Financial Advisor (6)

| Prompt | Description |
|--------|-------------|
| `morning-briefing` | Daily snapshot — balances, yield earned, portfolio movement, rewards, alerts |
| `what-if` | Scenario planning — model impact of invest/save/borrow decisions |
| `sweep` | Find idle checking funds and route to optimal earning positions |
| `risk-check` | Full risk analysis — health factor, concentration, liquidation proximity |
| `weekly-recap` | Week in review — activity, yield, portfolio P&L, highlights |
| `dca-advisor` | Personalized DCA setup — budget → strategy, frequency, projected growth |

### Operational (3)

| Prompt | Description |
|--------|-------------|
| `claim-rewards` | Check and claim pending protocol rewards — auto-converts to USDC |
| `safeguards` | Review safety settings — per-tx limits, daily caps, emergency lock |
| `quick-exchange` | Guided token swap — preview rate, slippage, impact before executing |

---

## Security

- **Safeguard gate:** MCP server refuses to start without configured limits
- **Per-transaction limits:** Cap individual transaction amounts
- **Daily send limits:** Cap total daily outbound transfers
- **Lock/unlock:** AI can lock, only humans can unlock
- **dryRun previews:** Preview any operation before signing
- **Local-only:** stdio transport, private key never leaves the machine
