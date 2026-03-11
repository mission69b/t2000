# t2000 MCP Server — Setup Guide

Connect your AI (Claude Desktop, Cursor, Claude Code, Windsurf, Codex) to your t2000 agent bank account.

## Quick Start

### 1. Install & create wallet

```bash
npm i -g @t2000/cli
t2000 init
```

### 2. Configure safeguards

Safeguards are required before the MCP server will start:

```bash
t2000 config set maxPerTx 100
t2000 config set maxDailySend 500
```

### 3. Create a session

Run any command once to save your PIN for MCP to reuse:

```bash
t2000 balance
```

### 4. Add to your AI platform

Paste the config into your AI platform's MCP settings:

```json
{ "mcpServers": { "t2000": { "command": "t2000", "args": ["mcp"] } } }
```

### 5. Verify

Ask your AI: **"What's my t2000 balance?"**

---

## Platform-Specific Config

### Claude Desktop

**File:** `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)

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

### Cursor

**File:** `.cursor/mcp.json` (project root) or `~/.cursor/mcp.json` (global)

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
