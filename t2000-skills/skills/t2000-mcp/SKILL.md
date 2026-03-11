---
name: t2000-mcp
description: >-
  Start and configure the t2000 MCP server for AI platform integration.
  Use when asked to connect t2000 to Claude Desktop, Cursor, or any MCP
  client, set up MCP config, or start the MCP server. Provides 16 tools
  and 3 prompts for AI-driven banking operations.
license: MIT
metadata:
  author: t2000
  version: "1.0"
  requires: t2000 CLI (npm i -g @t2000/cli)
---

# t2000: MCP Server

## Purpose
Connect Claude Desktop, Cursor, or any MCP client to a t2000 agent bank
account. 16 tools, 3 prompts, stdio transport, safeguard enforced.

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

## Available Tools (16)

### Read-only (7)
| Tool | Description |
|------|-------------|
| `t2000_balance` | Current balance |
| `t2000_address` | Wallet address |
| `t2000_positions` | Lending positions |
| `t2000_rates` | Interest rates |
| `t2000_health` | Health factor |
| `t2000_history` | Transaction history |
| `t2000_earnings` | Yield earnings |

### State-changing (7)
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

### Safety (2)
| Tool | Description |
|------|-------------|
| `t2000_config` | View/set limits |
| `t2000_lock` | Emergency freeze |

## Prompts (3)
| Prompt | Description |
|--------|-------------|
| `financial-report` | Full financial summary |
| `optimize-yield` | Yield optimization analysis |
| `send-money` | Guided send with preview |

## Security
- Safeguard gate: server refuses to start without configured limits
- `unlock` is CLI-only — AI cannot circumvent a locked agent
- `dryRun: true` previews operations before signing
- Local-only stdio transport — key never leaves the machine
