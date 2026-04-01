---
name: t2000-mcp
description: >-
  Start and configure the t2000 MCP server for AI platform integration.
  Use when asked to connect t2000 to Claude Desktop, Cursor, or any MCP
  client, set up MCP config, or start the MCP server. Provides 25 tools
  and 16 prompts for AI-driven banking and MPP service operations.
license: MIT
metadata:
  author: t2000
  version: "1.0"
  requires: t2000 CLI (npm i -g @t2000/cli)
---

# t2000: MCP Server

## Purpose
Connect Claude Desktop, Cursor, or any MCP client to a t2000 agent bank
account. 25 tools, 16 prompts, stdio transport, safeguard enforced.

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

## Available Tools (25)

### Read-only (14)
| Tool | Description |
|------|-------------|
| `t2000_overview` | Complete account snapshot in one call |
| `t2000_balance` | Current balance |
| `t2000_address` | Wallet address |
| `t2000_positions` | Lending positions |
| `t2000_rates` | Best interest rates per asset |
| `t2000_all_rates` | Per-protocol rate comparison |
| `t2000_health` | Health factor |
| `t2000_history` | Transaction history |
| `t2000_earnings` | Yield earnings |
| `t2000_fund_status` | Savings fund status |
| `t2000_pending_rewards` | Pending protocol rewards |
| `t2000_deposit_info` | Deposit instructions |
| `t2000_services` | List all MPP services and endpoints |
| `t2000_contacts` | List saved contacts |

### State-changing (9)
All support `dryRun: true` for previews without signing.

| Tool | Description |
|------|-------------|
| `t2000_send` | Send USDC |
| `t2000_save` | Deposit to savings |
| `t2000_withdraw` | Withdraw from savings |
| `t2000_borrow` | Borrow against collateral |
| `t2000_repay` | Repay debt |
| `t2000_claim_rewards` | Claim protocol rewards and auto-convert to USDC |
| `t2000_pay` | Pay for and call any MPP API service with USDC |
| `t2000_contact_add` | Save a contact name → address |
| `t2000_contact_remove` | Remove a saved contact |

### Safety (2)
| Tool | Description |
|------|-------------|
| `t2000_config` | View/set limits |
| `t2000_lock` | Emergency freeze |

## Prompts (16)
| Prompt | Description |
|--------|-------------|
| `financial-report` | Full financial summary |
| `optimize-yield` | Yield optimization analysis |
| `send-money` | Guided send with preview |
| `budget-check` | Can I afford $X? |
| `savings-strategy` | Recommend how much to save and where |
| `morning-briefing` | Daily snapshot — balances, yield, rewards, alerts |
| `what-if` | Scenario planning — model impact before acting |
| `sweep` | Route idle funds to optimal earning positions |
| `risk-check` | Health factor, concentration, liquidation risk |
| `weekly-recap` | Week in review — activity, yield |
| `claim-rewards` | Check and claim protocol rewards — auto-converts to USDC |
| `safeguards` | Review safety settings — limits, lock, PIN-protected operations |
| `onboarding` | New user setup — deposit, first save, explore features |
| `emergency` | Lock account, assess damage, recovery guidance |
| `optimize-all` | One-shot full optimization — sweep, compare APYs, claim rewards |
| `savings-goal` | Set a savings target and calculate weekly/monthly amounts needed |

## Engine MCP Adapter (Audric)

`@t2000/engine` can also expose its financial tools as MCP tools, enabling
Audric to serve as an MCP server alongside `@t2000/mcp`:

```typescript
import { registerEngineTools, getDefaultTools } from '@t2000/engine';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const server = new McpServer({ name: 'audric', version: '0.1.0' });
registerEngineTools(server, getDefaultTools());
// Exposes: audric_balance_check, audric_save_deposit, etc.
```

Engine tools use `audric_` prefix to avoid collisions with `t2000_` prefixed
tools from `@t2000/mcp`. The engine adapter includes permission-level metadata
and supports the full confirmation flow.

## Security
- Safeguard gate: server refuses to start without configured limits
- `unlock` is CLI-only — AI cannot circumvent a locked agent
- `dryRun: true` previews operations before signing
- Local-only stdio transport — key never leaves the machine
