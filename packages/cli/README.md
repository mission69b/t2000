# @t2000/cli

Terminal bank account for AI agents on Sui. One command to create a bank account, send USDC, earn yield, borrow, auto-rebalance for optimal yield, and pay for APIs. USDC in, USDC out — multi-stablecoin optimization happens internally.

[![npm](https://img.shields.io/npm/v/@t2000/cli)](https://www.npmjs.com/package/@t2000/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

**[Website](https://t2000.ai)** · **[GitHub](https://github.com/mission69b/t2000)** · **[SDK](https://www.npmjs.com/package/@t2000/sdk)** · **[x402](https://www.npmjs.com/package/@t2000/x402)** · **[MCP](https://www.npmjs.com/package/@t2000/mcp)**

## Installation

```bash
npm install -g @t2000/cli
t2000 init
```

**Requirements:** Node.js 18+

## Quick Start

```
❯ t2000 init

  Create PIN (min 4 chars): ****
  Confirm PIN: ****

  Creating agent wallet...
  ✓ Keypair generated
  ✓ Network  Sui mainnet
  ✓ Gas sponsorship  enabled

  Setting up accounts...
  ✓ Checking  ✓ Savings  ✓ Credit  ✓ Investment  ✓ Exchange  ✓ 402 Pay

  🎉 Bank account created
  Address:  0x8b3e4f2a...

  Deposit USDC on Sui network only.
  ─────────────────────────────────────────────────────

  Install globally for persistent use:
  npm install -g @t2000/cli

  t2000 balance            check for funds
  t2000 save all           start earning yield
  t2000 address            show address again

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
❯ t2000 invest buy 100 SUI
  ✓ Bought 105.26 SUI at $0.95
    Invested:       $100.00
    Portfolio:      105.26 SUI (avg $0.95)
    Tx:  https://suiscan.xyz/mainnet/tx/...

❯ t2000 invest buy 500 BTC
  ✓ Bought 0.00512820 BTC at $97,500.00
    Invested:       $500.00
    Portfolio:      0.00512820 BTC (avg $97,500.00)
    Tx:  https://suiscan.xyz/mainnet/tx/...

❯ t2000 invest buy 200 ETH
  ✓ Bought 0.10526316 ETH at $1,900.00
    Invested:       $200.00
    Portfolio:      0.10526316 ETH (avg $1,900.00)
    Tx:  https://suiscan.xyz/mainnet/tx/...

❯ t2000 portfolio
  Investment Portfolio
  ─────────────────────────────────────────────────────
  SUI     105.26000000  Avg: $0.95    Now: $0.97    APY: 2.10%    +$2.10 (+2.1%)
  BTC     0.00512820    Avg: $97,500  Now: $98,200  —              +$3.59 (+0.7%)
  ETH     0.10526316    Avg: $1,900   Now: $1,920   APY: 1.85%    +$2.11 (+1.1%)
  ─────────────────────────────────────────────────────
  Total invested:   $800.00
  Current value:    $807.80
  Unrealized P&L:   +$7.80 (+1.0%)
```

```
❯ t2000 invest strategy buy layer1 5
  ✓ Invested $5.00 in layer1 strategy (1 atomic transaction)
  ──────────────────────────────────────
  ETH:  0.001222 @ $2,045.24
  SUI:  2.5678 @ $0.97
  ──────────────────────────────────────
  Total invested:  $5.00
  Tx:  https://suiscan.xyz/mainnet/tx/BKYu8s...

❯ t2000 invest auto setup 50 weekly bluechip
  ✓ Auto-invest created
  Strategy:   bluechip (Large-cap crypto index)
  Amount:     $50.00 per week
  Next run:   Feb 24, 2026
```

30 seconds. Send → save → borrow → pay → repay → withdraw.

## Commands

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

### Savings & DeFi

| Command | Description |
|---------|-------------|
| `t2000 save <amount> [--protocol <name>]` | Deposit to savings (earn ~2–8% APY). Auto-converts non-USDC stables. Auto-selects best rate or use `--protocol navi\|suilend`. |
| `t2000 save all` | Deposit all available stablecoins (auto-converts to USDC) |
| `t2000 withdraw <amount>` | Withdraw from savings. Always returns USDC (auto-swaps non-USDC positions). |
| `t2000 borrow <amount>` | Borrow USDC against savings collateral |
| `t2000 repay <amount>` | Repay outstanding debt (auto-swaps USDC to borrowed asset if non-USDC). Use `repay all` for full repayment. |
| `t2000 rebalance [--dry-run]` | Optimize yield — move savings to best rate across protocols and stablecoins internally |
| `t2000 exchange <amount> <from> <to>` | Exchange tokens via Cetus DEX (e.g. `t2000 exchange 5 USDC SUI`). Options: `--slippage <pct>` (default: 3%) |
| `t2000 health` | Check savings health factor |
| `t2000 rates` | Best save/borrow APYs across protocols and all stablecoins |
| `t2000 positions` | Open savings & borrow positions across all assets |
| `t2000 earnings` | Yield earned to date |
| `t2000 fund-status` | Full savings summary |

### x402 Payments

| Command | Description |
|---------|-------------|
| `t2000 pay <url>` | Pay for an x402-protected API resource |
| `t2000 pay <url> --max-price 0.10` | Set max USDC per request (default: $1.00) |
| `t2000 pay <url> --method POST --data '{...}'` | POST with JSON body |
| `t2000 pay <url> --header 'key=value'` | Add custom HTTP headers (repeatable) |
| `t2000 pay <url> --timeout 60` | Request timeout in seconds (default: 30) |
| `t2000 pay <url> --dry-run` | Show what would be paid without paying |

### Earn (Directory)

| Command | Description |
|---------|-------------|
| `t2000 earn` | Show all earning opportunities — savings yield + sentinel bounties |

### Sentinel (Earn Bounties)

| Command | Description |
|---------|-------------|
| `t2000 sentinel list` | List active sentinels with prize pools and fees |
| `t2000 sentinel info <id>` | Show details for a specific sentinel |
| `t2000 sentinel attack <id> [prompt]` | Attack a sentinel with an adversarial prompt (costs SUI) |
| `t2000 sentinel attack <id> [prompt] --fee 0.5` | Override attack fee (default: sentinel's min fee) |

### Contacts

| Command | Description |
|---------|-------------|
| `t2000 contacts` | List saved contacts |
| `t2000 contacts add <name> <address>` | Save a named contact |
| `t2000 contacts remove <name>` | Remove a contact |

### Investment

| Command | Description |
|---------|-------------|
| `t2000 invest buy <amount> <asset>` | Buy crypto with USDC (e.g. `t2000 invest buy 500 BTC`) |
| `t2000 invest sell <amount\|all> <asset>` | Sell crypto back to USDC (auto-withdraws if earning) |
| `t2000 invest earn <asset>` | Deposit invested asset into best-rate lending for yield |
| `t2000 invest unearn <asset>` | Withdraw from lending, keep in portfolio |
| `t2000 portfolio` | View investment portfolio with cost-basis P&L (strategy grouping) |

### Strategies (PTB Atomic)

| Command | Description |
|---------|-------------|
| `t2000 invest strategy list` | List available strategies with allocations |
| `t2000 invest strategy buy <name> <amount>` | Buy into a strategy — single atomic transaction. Options: `--dry-run` |
| `t2000 invest strategy sell <name>` | Sell all positions in a strategy |
| `t2000 invest strategy status <name>` | Show positions, current weights, and drift |
| `t2000 invest strategy rebalance <name>` | Rebalance to target weights |
| `t2000 invest strategy create <name> --alloc "BTC:40,ETH:60"` | Create a custom strategy |
| `t2000 invest strategy delete <name>` | Delete a custom strategy (must have no positions) |

Built-in strategies: `bluechip` (BTC 50%, ETH 30%, SUI 20%), `all-weather` (BTC 30%, ETH 20%, SUI 20%, GOLD 30%), `safe-haven` (BTC 50%, GOLD 50%), `layer1` (ETH 50%, SUI 50%), `sui-heavy` (BTC 20%, ETH 20%, SUI 60%).

### Auto-Invest (DCA)

| Command | Description |
|---------|-------------|
| `t2000 invest auto setup <amount> <frequency> [strategy]` | Set up DCA (daily/weekly/monthly) |
| `t2000 invest auto status` | Show auto-invest schedules |
| `t2000 invest auto run` | Execute pending DCA purchases |
| `t2000 invest auto stop [id]` | Stop one or all schedules |

Supported assets: SUI, BTC, ETH, GOLD. Dollar-denominated — `amount` is in USD.

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

21 tools, 12 prompts, safeguard enforced. See [MCP setup guide](../../docs/mcp-setup.md) for details.

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

All multi-step operations (save with auto-convert, withdraw with auto-swap, rebalance) execute as single atomic Programmable Transaction Blocks (PTBs). If any step fails, the entire transaction reverts.

## Protocol Fees

| Operation | Fee |
|-----------|-----|
| Save | 0.1% |
| Borrow | 0.05% |
| Exchange | **Free** |
| Withdraw | Free |
| Repay | Free |
| Send | Free |
| Pay (x402) | Free |

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
