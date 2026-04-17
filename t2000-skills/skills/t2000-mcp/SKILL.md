---
name: t2000-mcp
description: >-
  Connect a t2000 agent bank account to Claude Desktop, Cursor, Cline,
  Continue, or any MCP-compatible client. Use when asked to set up MCP,
  paste an MCP server config, install @t2000/mcp, or troubleshoot why
  the MCP server "doesn't do anything" when run from a terminal.
  Provides 29 tools and 16 prompts over stdio.
license: MIT
metadata:
  author: t2000
  version: "1.1"
  requires: a Sui keypair (created via `npx @t2000/cli init` or any wallet)
---

# t2000: MCP Server

## Purpose
Expose a t2000 agent bank account (Sui wallet + DeFi positions) to any
MCP-compatible AI client over stdio. **29 tools, 16 prompts**, safeguard
enforced. No global install required — the recommended path uses `npx`
so the AI client always pulls the latest published version.

## ⚠️ The most common confusion

**`npx @t2000/mcp` is NOT a command you run from a terminal to "use" the
MCP server.** It is a JSON-RPC server that listens silently on `stdin`.
If you run it manually it will appear to hang — that's correct behavior.
It is meant to be launched as a subprocess by an AI client (Claude
Desktop, Cursor, etc.) which speaks JSON-RPC to it over `stdin`/`stdout`.

The JSON snippets below go into your **AI client's MCP settings file**,
not into a shell.

## Setup

### 1. Create a wallet + safeguards (one-time, in a terminal)

```bash
# Install CLI long enough to bootstrap a wallet and set safety limits
npx @t2000/cli init
npx @t2000/cli config set maxPerTx 100
npx @t2000/cli config set maxDailySend 500

# Create a session so MCP can reuse the saved PIN
npx @t2000/cli balance
```

The MCP server **refuses to start** until `maxPerTx` and `maxDailySend`
are configured. This is intentional.

### 2. Add the MCP server to your AI client

Recommended config (auto-updates on every launch, no global install):

```json
{
  "mcpServers": {
    "t2000": {
      "command": "npx",
      "args": ["-y", "@t2000/mcp@latest"]
    }
  }
}
```

Alternative (if `@t2000/cli` is already installed globally):

```json
{
  "mcpServers": {
    "t2000": {
      "command": "t2000",
      "args": ["mcp"]
    }
  }
}
```

### 3. Restart the client

The client spawns the MCP server as a subprocess on startup. You should
see `t2000_*` tools appear in the tool list.

## Per-client config file paths

| Client | Config file |
|--------|-------------|
| Claude Desktop (macOS) | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Desktop (Windows) | `%APPDATA%\Claude\claude_desktop_config.json` |
| Cursor | Settings → MCP → Add new MCP server (or `~/.cursor/mcp.json`) |
| Cline | VSCode settings → `cline.mcpServers` |
| Continue | `~/.continue/config.json` under `mcpServers` |

## Verification (optional, before wiring into a client)

Confirm the server responds to a real MCP `initialize` request:

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' \
  | npx -y @t2000/mcp@latest
```

You should see a JSON response containing `"serverInfo":{"name":"t2000"...}`
and exit. If you see that, the server is healthy and ready to be launched
by a client.

## Available Tools (29)

### Read-only (15)
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
| `t2000_receive` | Generate payment request with address, nonce, and Payment Kit URI (`sui:pay?…`) |
| `t2000_services` | List all MPP services and endpoints |
| `t2000_contacts` | List saved contacts |

### State-changing (12)
All support `dryRun: true` for previews without signing.

| Tool | Description |
|------|-------------|
| `t2000_send` | Send USDC |
| `t2000_save` | Deposit to savings |
| `t2000_withdraw` | Withdraw from savings |
| `t2000_borrow` | Borrow against collateral |
| `t2000_repay` | Repay debt |
| `t2000_claim_rewards` | Claim pending protocol rewards |
| `t2000_pay` | Pay for and call any MPP API service with USDC |
| `t2000_swap` | Execute a token swap via Cetus Aggregator |
| `t2000_stake` | Stake SUI for vSUI via VOLO liquid staking |
| `t2000_unstake` | Unstake vSUI and redeem SUI |
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
| `claim-rewards` | Check and claim pending protocol rewards |
| `safeguards` | Review safety settings — limits, lock, PIN-protected operations |
| `onboarding` | New user setup — deposit, first save, explore features |
| `emergency` | Lock account, assess damage, recovery guidance |
| `optimize-all` | One-shot full optimization — sweep, compare APYs, claim rewards |
| `savings-goal` | Set a savings target and calculate weekly/monthly amounts needed |

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `npx @t2000/mcp` "hangs" with no output | Working as designed — server is waiting for JSON-RPC on stdin | Don't run it manually; let the AI client launch it |
| Server exits with `Safeguards not configured` | `maxPerTx` / `maxDailySend` not set | Run `npx @t2000/cli config set maxPerTx 100 && ... maxDailySend 500` |
| Client shows no `t2000_*` tools after restart | Wrong config path, or stale npx cache | Verify with the `printf | npx ...` test above; clear cache with `rm -rf ~/.npm/_npx` |
| `SuiClient export not found` error from old install | Cached pre-fix bundle in `~/.npm/_npx` | `rm -rf ~/.npm/_npx` then restart the client |

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
