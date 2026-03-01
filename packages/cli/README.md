# @t2000/cli

Terminal bank account for AI agents on Sui. One command to create a bank account, send USDC, earn yield, swap, borrow, and pay for APIs.

[![npm](https://img.shields.io/npm/v/@t2000/cli)](https://www.npmjs.com/package/@t2000/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

**[Website](https://t2000.ai)** · **[GitHub](https://github.com/mission69b/t2000)** · **[SDK](https://www.npmjs.com/package/@t2000/sdk)** · **[x402](https://www.npmjs.com/package/@t2000/x402)**

## Installation

```bash
npx @t2000/cli init
# or install globally
npm install -g @t2000/cli
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
  ✓ Checking  ✓ Savings  ✓ Credit  ✓ Exchange  ✓ 402 Pay

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

❯ t2000 save 80 USDC
  ✓ Saved $80.00 USDC to NAVI
  ✓ Protocol fee: $0.08 USDC (0.1%)
  ✓ Current APY: 4.21%
  ✓ Savings balance: $79.92 USDC
  Tx:  https://suiscan.xyz/mainnet/tx/0x9f2c...

❯ t2000 borrow 20 USDC
  ✓ Borrowed $20.00 USDC
  Health Factor:  3.39
  Tx:  https://suiscan.xyz/mainnet/tx/0xb3c4...

❯ t2000 swap 5 USDC SUI
  ✓ Swapped 5 USDC → 5.8300 SUI
  Tx:  https://suiscan.xyz/mainnet/tx/0xd5e6...

❯ t2000 pay https://data.api.com/prices
  → GET https://data.api.com/prices
  ← 402 Payment Required: $0.01 USDC (Sui)
  ✓ Paid $0.01 USDC (tx: 0x9f2c...a801)
  ← 200 OK  [342ms]

❯ t2000 repay 20 USDC
  ✓ Repaid $20.00 USDC
  Remaining Debt:  $0.00
  Tx:  https://suiscan.xyz/mainnet/tx/0xe7f8...

❯ t2000 withdraw all USDC
  ✓ Withdrew $79.92 USDC
  Tx:  https://suiscan.xyz/mainnet/tx/0xf9a0...

❯ t2000 balance
  Available:  $85.00 USDC  (checking — spendable)
  Savings:    $0.00 USDC
  Gas:        0.31 SUI     (~$0.28)
  ──────────────────────────────────────
  Total:      $85.28 USDC
```

30 seconds. Send → save → borrow → swap → pay → repay → withdraw.

## Commands

### Wallet

| Command | Description |
|---------|-------------|
| `t2000 init` | Create a new agent bank account (Ed25519 keypair, AES-256-GCM encrypted) |
| `t2000 lock` | Clear saved session (require PIN on next command) |
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
| `t2000 send <amount> USDC to <address>` | Send USDC to any Sui address (the `to` keyword is optional) |

### Savings & DeFi

| Command | Description |
|---------|-------------|
| `t2000 save <amount> [asset]` | Deposit to NAVI Protocol (earn ~4–8% APY). Asset defaults to USDC. |
| `t2000 save all` | Deposit all available USDC |
| `t2000 withdraw <amount> [asset]` | Withdraw from savings |
| `t2000 borrow <amount> [asset]` | Borrow against savings collateral |
| `t2000 repay <amount> [asset]` | Repay outstanding borrows. Use `repay all` for full repayment. |
| `t2000 swap <amount> <from> <to>` | Swap via Cetus DEX (e.g. `swap 5 USDC SUI`) |
| `t2000 health` | Check savings health factor |
| `t2000 rates` | Current NAVI save/borrow APYs |
| `t2000 positions` | Open savings & borrow positions |
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

### Sentinel (Earn Bounties)

| Command | Description |
|---------|-------------|
| `t2000 sentinel list` | List active sentinels with prize pools and fees |
| `t2000 sentinel info <id>` | Show details for a specific sentinel |
| `t2000 sentinel attack <id> [prompt]` | Attack a sentinel with an adversarial prompt (costs SUI) |
| `t2000 sentinel attack <id> [prompt] --fee 0.5` | Override attack fee (default: sentinel's min fee) |

### Configuration

| Command | Description |
|---------|-------------|
| `t2000 config get [key]` | Show a config value (omit key for all) |
| `t2000 config set <key> <value>` | Set a config value |

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
| `swap` | `--slippage <percent>` | Max slippage % | `3` |
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

## Protocol Fees

| Operation | Fee |
|-----------|-----|
| Save | 0.1% |
| Borrow | 0.05% |
| Swap | **Free** |
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
t2000 save all USDC         # Deposit all available USDC
t2000 borrow 40 USDC        # Borrow against it
t2000 repay 40 USDC         # Pay it back
t2000 withdraw all USDC     # Get everything out

# Automation-friendly (no prompts, JSON output)
t2000 balance --json
t2000 save 10 USDC --yes --json

# Use with AI coding agents
export T2000_PIN="agent-secret"
t2000 balance --json | jq '.available'
```

## License

MIT — see [LICENSE](https://github.com/mission69b/t2000/blob/main/LICENSE)
