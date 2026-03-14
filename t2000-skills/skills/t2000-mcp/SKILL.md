---
name: t2000-mcp
description: >-
  Start and configure the t2000 MCP server for AI platform integration.
  Use when asked to connect t2000 to Claude Desktop, Cursor, or any MCP
  client, set up MCP config, or start the MCP server.   Provides 21 tools
  and 15 prompts for AI-driven banking operations.
license: MIT
metadata:
  author: t2000
  version: "1.0"
  requires: t2000 CLI (npm i -g @t2000/cli)
---

# t2000: MCP Server

## Purpose
Connect Claude Desktop, Cursor, or any MCP client to a t2000 agent bank
account. 21 tools, 15 prompts, stdio transport, safeguard enforced.

## Setup
```bash
# 1. Install + create wallet
npm i -g @t2000/cli && t2000 init

# 2. Configure safeguards (required before MCP starts)
t2000 config set maxPerTx 100
t2000 config set maxDailySend 500

# 3. Create session (saves PIN for MCP reuse)
t2000 balance

# 4. Start MCP server
t2000 mcp
```

## Platform Config
Paste into your AI platform's MCP settings:
```json
{ "mcpServers": { "t2000": { "command": "t2000", "args": ["mcp"] } } }
```

## Available Tools (22)

### Read-only (9)
| Tool | Description |
|------|-------------|
| `t2000_balance` | Current balance |
| `t2000_address` | Wallet address |
| `t2000_positions` | Lending positions |
| `t2000_rates` | Interest rates |
| `t2000_health` | Health factor |
| `t2000_history` | Transaction history |
| `t2000_earnings` | Yield earnings |
| `t2000_contacts` | List saved contacts (name → address) |
| `t2000_portfolio` | Investment portfolio positions + P&L |

### State-changing (11)
All support `dryRun: true` for previews without signing.

| Tool | Description |
|------|-------------|
| `t2000_send` | Send USDC |
| `t2000_save` | Deposit to savings |
| `t2000_withdraw` | Withdraw from savings |
| `t2000_borrow` | Borrow against collateral |
| `t2000_repay` | Repay debt |
| `t2000_exchange` | Swap assets |
| `t2000_rebalance` | Optimize yield |
| `t2000_invest` | Buy/sell investment assets (spot) |
| `t2000_strategy` | Manage strategies — list, buy, sell, status, rebalance, create, delete |
| `t2000_auto_invest` | DCA scheduling — setup, status, run, stop |
| `t2000_claim_rewards` | Claim protocol rewards and auto-convert to USDC |

### Safety (2)
| Tool | Description |
|------|-------------|
| `t2000_config` | View/set limits |
| `t2000_lock` | Emergency freeze |

## Prompts (15)
| Prompt | Description |
|--------|-------------|
| `financial-report` | Full financial summary |
| `optimize-yield` | Yield optimization analysis |
| `send-money` | Guided send with preview |
| `budget-check` | Can I afford $X? |
| `savings-strategy` | Recommend how much to save and where |
| `investment-strategy` | Portfolio analysis and allocation |
| `morning-briefing` | Daily snapshot — balances, yield, portfolio, rewards, alerts |
| `what-if` | Scenario planning — model impact before acting |
| `sweep` | Route idle funds to optimal earning positions |
| `risk-check` | Health factor, concentration, liquidation risk |
| `weekly-recap` | Week in review — activity, yield, P&L |
| `dca-advisor` | Personalized DCA setup from budget |
| `claim-rewards` | Check and claim protocol rewards — auto-converts to USDC |
| `safeguards` | Review safety settings — limits, lock, PIN-protected operations |
| `quick-exchange` | Guided token swap — preview rate, slippage, impact |

## Security
- Safeguard gate: server refuses to start without configured limits
- `unlock` is CLI-only — AI cannot circumvent a locked agent
- `dryRun: true` previews operations before signing
- Local-only stdio transport — key never leaves the machine
