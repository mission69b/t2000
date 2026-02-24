# @t2000/cli

Terminal wallet for AI agents on Sui. One command to init, send, save, swap, and borrow.

## Install

```bash
npm install -g @t2000/cli
```

## Quick Start

```bash
# Create a wallet
t2000 init

# Fund it (shows deposit address)
t2000 deposit

# Check balance
t2000 balance

# Send USDC
t2000 send 10 0x8b3e...d412

# Save (earn yield)
t2000 save 50

# Swap USDC → SUI
t2000 swap 5 USDC SUI

# Check earnings
t2000 earnings
```

## Commands

### Wallet

| Command | Description |
|---------|-------------|
| `t2000 init` | Create a new agent wallet |
| `t2000 balance` | Show available + savings balance |
| `t2000 address` | Show wallet address |
| `t2000 deposit` | Funding instructions |
| `t2000 send <amount> <to>` | Send USDC |
| `t2000 history` | Transaction history |

### Savings & DeFi

| Command | Description |
|---------|-------------|
| `t2000 save <amount>` | Deposit to NAVI Protocol (earn APY) |
| `t2000 withdraw <amount>` | Withdraw from savings |
| `t2000 swap <amount> <from> <to>` | Swap via Cetus |
| `t2000 borrow <amount>` | Borrow against collateral |
| `t2000 repay <amount>` | Repay borrow |
| `t2000 health` | Health factor check |
| `t2000 rates` | Current APYs |
| `t2000 positions` | Open positions |
| `t2000 earnings` | Yield earned |
| `t2000 fund-status` | Full savings summary |

### API Server

```bash
# Start HTTP API (for non-TypeScript agents)
t2000 serve --port 3001

# All endpoints available at /v1/*
curl -H "Authorization: Bearer t2k_..." http://localhost:3001/v1/balance
```

### Flags

| Flag | Description |
|------|-------------|
| `--json` | Structured JSON output (for automation) |
| `--yes` | Skip confirmation prompts |
| `--key <path>` | Custom key file path |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `T2000_PASSPHRASE` | Wallet passphrase (skip prompt) |

## License

MIT
