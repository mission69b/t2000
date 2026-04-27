# @t2000/cli

A bank account for AI agents on Sui. Guided setup, MCP integration for Claude Desktop / Cursor / Windsurf, send USDC, earn yield, borrow, and pay for APIs. USDC in, USDC out.

[![npm](https://img.shields.io/npm/v/@t2000/cli)](https://www.npmjs.com/package/@t2000/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

**[Website](https://t2000.ai)** · **[GitHub](https://github.com/mission69b/t2000)** · **[SDK](https://www.npmjs.com/package/@t2000/sdk)** · **[MPP](https://www.npmjs.com/package/@suimpp/mpp)** · **[MCP](https://www.npmjs.com/package/@t2000/mcp)**

## Installation

```bash
npm install -g @t2000/cli
t2000 init
```

**Requirements:** Node.js 18+

## Quick Start

```
❯ t2000 init

  ┌─────────────────────────────────────────┐
  │  Welcome to t2000                       │
  │  A bank account for AI agents           │
  └─────────────────────────────────────────┘

  Step 1 of 3 — Create wallet

  Creating agent wallet...
  ✓ Keypair generated
  ✓ Network  Sui mainnet
  ✓ Gas sponsorship  enabled
  ✓ Checking  ✓ Savings  ✓ Credit

  🎉 Bank account created
  Address: 0x8b3e...d412

  Step 2 of 3 — Connect AI platforms
  Which AI platforms do you use? (space to select)
  ◉ Claude Desktop
  ◉ Cursor
  ◯ Windsurf

  Adding t2000 to your AI platforms...
  ✓ Claude Desktop  configured
  ✓ Cursor  configured

  Step 3 of 3 — Set safeguards
  ✓ Safeguards configured

  ┌─────────────────────────────────────────┐
  │  ✓ You're all set                       │
  │  Next steps:                            │
  │    1. Restart Claude Desktop / Cursor   │
  │    2. Ask: "What's my t2000 balance?"   │
  └─────────────────────────────────────────┘

❯ t2000 send 10 USDC to 0x8b3e...d412
  ✓ Sent $10.00 USDC → 0x8b3e...d412
  Gas:  0.0042 SUI (self-funded)
  Balance:  $90.00 USDC
  Tx:  https://suiscan.xyz/mainnet/tx/0xa1b2...

❯ t2000 save 80
  ✓ Saved $80.00 USDC to best rate
  ✓ Protocol fee: $0.08 USDC (0.1%)
  ✓ Current APY: 4.21%
  ✓ Savings balance: $79.92 USDC
  Tx:  https://suiscan.xyz/mainnet/tx/0x9f2c...

❯ t2000 borrow 20
  ✓ Borrowed $20.00 USDC
  Health Factor:  3.39
  Tx:  https://suiscan.xyz/mainnet/tx/0xb3c4...

❯ t2000 pay https://data.api.com/prices
  → GET https://data.api.com/prices
  ← 402 Payment Required: $0.01 USDC (Sui)
  ✓ Paid $0.01 USDC (tx: 0x9f2c...a801)
  ← 200 OK  [342ms]

❯ t2000 repay 20
  ✓ Repaid $20.00 USDC
  Remaining Debt:  $0.00
  Tx:  https://suiscan.xyz/mainnet/tx/0xe7f8...

❯ t2000 withdraw all
  ✓ Withdrew $79.92 USDC
  Tx:  https://suiscan.xyz/mainnet/tx/0xf9a0...

❯ t2000 balance
  Available:  $85.00  (checking — spendable)
  Savings:    $0.00
  Gas:        0.31 SUI     (~$0.28)
  ──────────────────────────────────────
  Total:      $85.28
```

30 seconds. Send → save → borrow → pay → repay → withdraw.

## Commands

### Setup

| Command | Description |
|---------|-------------|
| `t2000 init` | Guided setup wizard — wallet, PIN, MCP platforms (Claude Desktop/Cursor/Windsurf), safeguards. |

### MCP (AI Integration)

| Command | Description |
|---------|-------------|
| `t2000 mcp install` | Auto-configure MCP in Claude Desktop, Cursor, and Windsurf |
| `t2000 mcp uninstall` | Remove MCP config from AI platforms |
| `t2000 mcp` | Start MCP server (stdio — used by AI platforms, not run manually) |

### Config (dot-notation)

| Command | Description |
|---------|-------------|
| `t2000 config set maxPerTx 100` | Set max per transaction |
| `t2000 config set maxDailySend 500` | Set max daily sends |
| `t2000 config get maxPerTx` | Read a config value |

### Wallet

| Command | Description |
|---------|-------------|
| `t2000 init` | Create a new agent bank account (Ed25519 keypair, AES-256-GCM encrypted) |
| `t2000 lock` | Lock agent — freeze all operations |
| `t2000 unlock` | Unlock agent — resume operations (requires PIN) |
| `t2000 balance` | Show available USDC + savings + gas reserve |
| `t2000 balance --show-limits` | Include maxWithdraw, maxBorrow, and health factor |
| `t2000 address` | Show wallet address |
| `t2000 deposit` | Show funding instructions |
| `t2000 import` | Import an existing bank account from private key |
| `t2000 export` | Export private key (raw Ed25519 hex) |
| `t2000 history` | Transaction history |

### Transfers

| Command | Description |
|---------|-------------|
| `t2000 send <amount> <asset> [to] <address>` | Send USDC, SUI, or other assets to any Sui address (the `to` keyword is optional) |
| `t2000 receive` | Generate a payment request with Payment Kit URI (`sui:pay?...`) and unique nonce. Options: `--amount`, `--currency`, `--memo`, `--label`, `--key` |

### Savings & DeFi

| Command | Description |
|---------|-------------|
| `t2000 save <amount> [--asset USDC\|USDsui] [--protocol <name>]` | Deposit USDC or USDsui to NAVI savings (earn ~2–8% APY). `--asset` defaults to USDC. |
| `t2000 save all [--asset USDC\|USDsui]` | Deposit full available balance of the chosen asset (minus 1.0 reserve) |
| `t2000 withdraw <amount> [--asset <symbol>]` | Withdraw from NAVI savings (default USDC; pass `--asset USDsui` for USDsui positions) |
| `t2000 borrow <amount> [--asset USDC\|USDsui]` | Borrow USDC or USDsui against savings collateral (v0.51.1+) |
| `t2000 repay <amount> [--asset USDC\|USDsui]` | Repay debt. Must use the same asset as the original borrow (USDsui debt → USDsui repay). Use `repay all` to clear all outstanding debts across both stables. |
| `t2000 health` | Check savings health factor |
| `t2000 rates` | Best save/borrow APYs across protocols (USDC) |
| `t2000 positions` | Open savings & borrow positions across all assets |
| `t2000 claim-rewards` | Claim pending protocol rewards |
| `t2000 earnings` | Yield earned to date |
| `t2000 fund-status` | Full savings summary |

### MPP Payments

| Command | Description |
|---------|-------------|
| `t2000 pay <url>` | Pay for an MPP-protected API resource |
| `t2000 pay <url> --max-price 0.10` | Set max USDC per request (default: $1.00) |
| `t2000 pay <url> --method POST --data '{...}'` | POST with JSON body |
| `t2000 pay <url> --header 'key=value'` | Add custom HTTP headers (repeatable) |
| `t2000 pay <url> --timeout 60` | Request timeout in seconds (default: 30) |
| `t2000 pay <url> --dry-run` | Show what would be paid without paying |

### Earn (Directory)

| Command | Description |
|---------|-------------|
| `t2000 earn` | Show all earning opportunities — savings yield |

### Contacts

| Command | Description |
|---------|-------------|
| `t2000 contacts` | List saved contacts |
| `t2000 contacts add <name> <address>` | Save a named contact |
| `t2000 contacts remove <name>` | Remove a contact |

### Safeguards

| Command | Description |
|---------|-------------|
| `t2000 config show` | View safeguard settings |
| `t2000 config set maxPerTx 500` | Set per-transaction limit |
| `t2000 config set maxDailySend 1000` | Set daily send limit |
| `t2000 lock` | Lock agent (freeze all operations) |
| `t2000 unlock` | Unlock agent (requires PIN) |

### Configuration

| Command | Description |
|---------|-------------|
| `t2000 config get [key]` | Show a config value (omit key for all) |
| `t2000 config set <key> <value>` | Set a config value |

### MCP Server

```bash
# Auto-configure Claude Desktop + Cursor
t2000 mcp install

# Remove MCP config
t2000 mcp uninstall

# Start MCP server (used by AI platforms, not typically run directly)
t2000 mcp
```

Safeguard enforced. See [MCP setup guide](../../docs/mcp-setup.md) for details.

### HTTP API Server

```bash
# Start a local HTTP API for non-TypeScript agents
t2000 serve --port 3001

# All endpoints available at /v1/*
curl -H "Authorization: Bearer t2k_..." http://localhost:3001/v1/balance
curl -X POST -H "Authorization: Bearer t2k_..." \
  -d '{"to":"0x...","amount":10}' \
  http://localhost:3001/v1/send
```

| Option | Description | Default |
|--------|-------------|---------|
| `--port <port>` | Port number | `3001` |
| `--rate-limit <rps>` | Max requests per second | `10` |

## Global Flags

| Flag | Description |
|------|-------------|
| `--json` | Structured JSON output (for automation) |
| `--yes` | Skip confirmation prompts |

## Per-Command Options

| Command | Option | Description | Default |
|---------|--------|-------------|---------|
| `init` | `--name <name>` | Agent name | — |
| `init` | `--no-sponsor` | Skip gas sponsorship | — |
| `history` | `--limit <n>` | Number of transactions | `20` |
| Most commands | `--key <path>` | Custom key file path | `~/.t2000/wallet.key` |

## Configuration

Config is stored at `~/.t2000/config.json`.

| Key | Description | Default |
|-----|-------------|---------|
| `network` | Sui network | `mainnet` |
| `rpcUrl` | Custom RPC URL | Sui public fullnode |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `T2000_PIN` | Bank account PIN (skip interactive prompt) |
| `T2000_PRIVATE_KEY` | Private key for `t2000 import` (skip interactive prompt) |

## Gas Handling

Gas is fully automated:

1. **Self-funded** — uses SUI balance when reserve ≥ 0.05 SUI
2. **Auto-topup** — swaps $1 USDC → SUI when gas reserve is low
3. **Sponsored** — Gas Station sponsors the transaction as a fallback

You never need to manually acquire SUI for gas.

Multi-step operations (for example save or withdraw flows that compose several on-chain steps) execute as single atomic Programmable Transaction Blocks (PTBs). If any step fails, the entire transaction reverts.

## Protocol Fees

| Operation | Fee |
|-----------|-----|
| Save | 0.1% |
| Borrow | 0.05% |
| Withdraw | Free |
| Repay | Free |
| Send | Free |
| Pay (MPP) | Free |

## File Locations

| File | Path | Description |
|------|------|-------------|
| Encrypted key | `~/.t2000/wallet.key` | AES-256-GCM encrypted Ed25519 keypair |
| Config | `~/.t2000/config.json` | Network, RPC, preferences |

## Examples

```bash
# Full DeFi cycle
t2000 save all               # Deposit all available USDC
t2000 borrow 40              # Borrow against it
t2000 repay 40               # Pay it back
t2000 withdraw all            # Get everything out (always USDC)

# Automation-friendly (no prompts, JSON output)
t2000 balance --json
t2000 save 10 --yes --json

# Use with AI coding agents
export T2000_PIN="agent-secret"
t2000 balance --json | jq '.available'
```

## License

MIT — see [LICENSE](https://github.com/mission69b/t2000/blob/main/LICENSE)
