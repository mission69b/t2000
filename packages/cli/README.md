# @t2000/cli

Terminal wallet for AI agents on Sui. One command to create a wallet, send USDC, earn yield, swap, borrow, and pay for APIs.

[![npm](https://img.shields.io/npm/v/@t2000/cli)](https://www.npmjs.com/package/@t2000/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

**[Website](https://t2000.ai)** · **[GitHub](https://github.com/mission69b/t2000)** · **[SDK](https://www.npmjs.com/package/@t2000/sdk)** · **[x402](https://www.npmjs.com/package/@t2000/x402)**

## Installation

```bash
npm install -g @t2000/cli
# or
npx @t2000/cli init
```

**Requirements:** Node.js 18+

## Quick Start

```bash
# 1. Create a wallet (free, gas-sponsored)
t2000 init

# 2. Show your deposit address
t2000 deposit

# 3. Send USDC from a CEX to the address above, then:
t2000 balance

# 4. Start operating
t2000 send 10 USDC to 0x8b3e...d412
t2000 save 80 USDC
t2000 swap 5 USDC SUI
t2000 borrow 20 USDC
t2000 pay https://api.example.com/data
```

## Commands

### Wallet

| Command | Description |
|---------|-------------|
| `t2000 init` | Create a new agent wallet (Ed25519 keypair, AES-256-GCM encrypted) |
| `t2000 balance` | Show available USDC + savings + gas reserve |
| `t2000 address` | Show wallet address |
| `t2000 deposit` | Show funding instructions |
| `t2000 import` | Import an existing wallet from private key |
| `t2000 export` | Export private key (raw Ed25519 hex) |
| `t2000 history` | Transaction history |

### Transfers

| Command | Description |
|---------|-------------|
| `t2000 send <amount> USDC to <address>` | Send USDC to any Sui address |

### Savings & DeFi

| Command | Description |
|---------|-------------|
| `t2000 save <amount>` | Deposit USDC to NAVI Protocol (earn ~4–8% APY) |
| `t2000 withdraw <amount>` | Withdraw USDC from savings |
| `t2000 borrow <amount>` | Borrow USDC against savings collateral |
| `t2000 repay <amount>` | Repay outstanding borrows |
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

### Configuration

| Command | Description |
|---------|-------------|
| `t2000 config get <key>` | Show a config value |
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

## Flags

| Flag | Description |
|------|-------------|
| `--json` | Structured JSON output (for automation) |
| `--yes` | Skip confirmation prompts |
| `--key <path>` | Custom key file path |
| `--network <net>` | `mainnet` or `testnet` |

## Configuration

Config is stored at `~/.t2000/config.json`.

| Key | Description | Default |
|-----|-------------|---------|
| `network` | Sui network | `mainnet` |
| `rpcUrl` | Custom RPC URL | Sui public fullnode |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `T2000_PASSPHRASE` | Wallet passphrase (skip interactive prompt) |
| `T2000_NETWORK` | Override network (`mainnet` / `testnet`) |
| `T2000_KEY_PATH` | Custom key file path |

## Gas Handling

Gas is fully automated:

1. **Sponsored** — first 10 transactions are free via the t2000 Gas Station
2. **Self-funded** — uses SUI balance after bootstrap
3. **Auto-topup** — swaps $1 USDC → SUI when gas reserve is low

You never need to manually acquire SUI for gas.

## File Locations

| File | Path | Description |
|------|------|-------------|
| Encrypted key | `~/.t2000/wallet.key` | AES-256-GCM encrypted Ed25519 keypair |
| Config | `~/.t2000/config.json` | Network, RPC, preferences |

## Examples

```bash
# Full DeFi cycle
t2000 save all              # Deposit all available USDC
t2000 borrow 40 USDC        # Borrow against it
t2000 repay 40 USDC         # Pay it back
t2000 withdraw all          # Get everything out

# Automation-friendly (no prompts, JSON output)
t2000 balance --json
t2000 send 10 USDC to 0x... --yes --json

# Use with AI coding agents
export T2000_PASSPHRASE="agent-secret"
t2000 balance --json | jq '.available'
```

## License

MIT — see [LICENSE](https://github.com/mission69b/t2000/blob/main/LICENSE)
