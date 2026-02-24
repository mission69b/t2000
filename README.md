# t2000

Agentic DeFi SDK for Sui — wallet management, savings (Suilend), and borrowing with a CLI and TypeScript API.

## Monorepo Structure

```
packages/
  sdk/          @t2000/sdk        Core SDK (wallet, Suilend, hashcash)
  cli/          @t2000/cli        CLI interface
  contracts/    Move contracts    On-chain modules (deployed to mainnet)
apps/
  server/       @t2000/server     Hono API (sponsor, health)
  web/          Next.js app       Dashboard (WIP)
scripts/
  integration-test.ts             Mainnet integration test
```

## Setup

```bash
pnpm install
pnpm build
```

Copy the environment template and fill in your values:

```bash
cp .env.example .env.local
```

Required variables:

| Variable | Description |
|---|---|
| `DATABASE_URL` | NeonDB connection string |
| `T2000_PASSPHRASE` | Sui private key (`suiprivkey1q...`) for test wallet |

## Development

```bash
pnpm dev          # Start all dev servers
pnpm build        # Build all packages
pnpm lint         # Lint all packages
pnpm typecheck    # TypeScript check all packages
```

### SDK Tests

```bash
pnpm --filter @t2000/sdk test
```

## Integration Test

The integration test runs a full save → earn → withdraw roundtrip against Suilend on **mainnet** using real funds. It verifies:

1. Wallet loading from private key
2. Balance check (USDC + SUI + savings)
3. Suilend APY rates
4. Current positions
5. Save $1 USDC to Suilend
6. Position & health factor after deposit
7. Withdraw all USDC from Suilend
8. Final balance reconciliation

### Prerequisites

- A funded wallet with at least **$2 USDC** and **0.05 SUI** for gas
- `T2000_PASSPHRASE` set in `.env.local` (the `suiprivkey1q...` for that wallet)

### Running

```bash
export $(grep -v '^#' .env.local | xargs)
pnpm --filter @t2000/server exec tsx ../../scripts/integration-test.ts
```

### Expected Output

```
=== t2000 Integration Test (mainnet) ===

1. Loading wallet...
   Address: 0x4e12...480f

2. Checking balance...
   Available: $72.31 USDC
   Savings:   $0.00 USDC
   Gas:       104.83 SUI (~$366.92)

3. Fetching Suilend rates...
   Save APY:   4.50%
   Borrow APY: 6.00%

5. Saving $1 USDC to Suilend...
   ✓ Saved $1.00 USDC

8. Withdrawing all USDC from Suilend...
   ✓ Withdrew $1.00 USDC

=== Integration test complete ===
```

## CLI

```bash
# Initialize a new agent wallet
pnpm --filter @t2000/cli exec t2000 init

# Check balance
pnpm --filter @t2000/cli exec t2000 balance

# Save USDC to Suilend
pnpm --filter @t2000/cli exec t2000 save 10      # save $10
pnpm --filter @t2000/cli exec t2000 save all     # save all available

# Withdraw from Suilend
pnpm --filter @t2000/cli exec t2000 withdraw 5   # withdraw $5
pnpm --filter @t2000/cli exec t2000 withdraw all  # withdraw everything

# Check positions & health
pnpm --filter @t2000/cli exec t2000 positions
pnpm --filter @t2000/cli exec t2000 health
pnpm --filter @t2000/cli exec t2000 rates
```
