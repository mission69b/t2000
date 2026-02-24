# t2000

The first wallet for AI agents. Send, save, swap, and borrow on Sui — in one line of code.

```typescript
const agent = await T2000.create({ passphrase: 'my-secret' });
await agent.send({ to: '0x...', amount: 50 });
await agent.save({ amount: 100 });  // earn 8% APY via Suilend
```

## 30-Second Quickstart

```bash
# Install the CLI
npm install -g @t2000/cli

# Create a wallet
t2000 init

# Fund it with USDC on Sui
t2000 deposit

# Start using it
t2000 balance
t2000 send 10 0x8b3e...d412
t2000 save 50
t2000 earnings
```

## Packages

| Package | Description | Install |
|---------|-------------|---------|
| [`@t2000/sdk`](packages/sdk) | TypeScript SDK | `npm i @t2000/sdk` |
| [`@t2000/cli`](packages/cli) | Terminal wallet | `npm i -g @t2000/cli` |
| [`@t2000/server`](apps/server) | Gas station + indexer | Self-hosted |

## SDK Usage

```typescript
import { T2000 } from '@t2000/sdk';

const agent = await T2000.create({ passphrase: process.env.T2000_PASSPHRASE });

// Wallet
const balance = await agent.balance();       // { available, savings, gasReserve, total }
await agent.send({ to, amount: 50 });        // USDC transfer

// Savings (Suilend)
await agent.save({ amount: 100 });           // earn yield
await agent.withdraw({ amount: 50 });        // withdraw anytime
const earnings = await agent.earnings();     // yield summary

// Swap (Cetus)
await agent.swap({ from: 'USDC', to: 'SUI', amount: 5 });

// Borrow
await agent.borrow({ amount: 20 });          // against savings collateral
await agent.repay({ amount: 20 });
const hf = await agent.healthFactor();       // liquidation safety check
```

## CLI Commands

```bash
t2000 init                    # Create wallet
t2000 balance                 # Check balance
t2000 send 10 0xABC...        # Send USDC
t2000 save 50                 # Save (earn yield)
t2000 withdraw 25             # Withdraw savings
t2000 swap 5 USDC SUI         # Swap on Cetus
t2000 borrow 10               # Borrow against collateral
t2000 repay 10                # Repay borrow
t2000 health                  # Health factor
t2000 earnings                # Yield earned
t2000 fund-status             # Full savings report
t2000 rates                   # Current APYs
t2000 positions               # Open positions
t2000 history                 # Transaction history
t2000 serve --port 3001       # Start HTTP API
t2000 config set key value    # Set config
```

Add `--json` to any command for structured JSON output.

## HTTP API

```bash
t2000 serve --port 3001
# ✓ API server running on http://localhost:3001
# ✓ Auth token: t2k_a1b2c3d4e5f6...
```

```bash
# All endpoints require: Authorization: Bearer <token>

curl http://localhost:3001/v1/balance
curl -X POST http://localhost:3001/v1/send -d '{"to":"0x...","amount":10}'
curl -X POST http://localhost:3001/v1/save -d '{"amount":50}'
curl -X POST http://localhost:3001/v1/swap -d '{"from":"USDC","to":"SUI","amount":5}'
curl http://localhost:3001/v1/earnings
curl http://localhost:3001/v1/health-factor

# SSE events
curl http://localhost:3001/v1/events?subscribe=yield,balanceChange
```

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌───────────┐
│  @t2000/cli │────▶│  @t2000/sdk │────▶│  Sui RPC  │
│  (terminal) │     │  (core)     │     └───────────┘
└─────────────┘     │             │     ┌───────────┐
                    │             │────▶│  Suilend  │
┌─────────────┐     │             │     └───────────┘
│  HTTP API   │────▶│             │     ┌───────────┐
│  (t2000     │     │             │────▶│  Cetus    │
│   serve)    │     └──────┬──────┘     └───────────┘
└─────────────┘            │
                    ┌──────▼──────┐
                    │  Gas Station│ (auto SUI top-up)
                    │  @t2000/    │
                    │  server     │
                    └─────────────┘
```

## Gas Abstraction

Agents never need to think about gas:

1. **Self-funded** — uses agent's own SUI
2. **Auto-topup** — swaps $1 USDC → SUI when gas is low
3. **Sponsored** — gas station pays for bootstrapping

Every result includes `gasMethod` so you know how gas was paid.

## Development

```bash
# Clone and install
git clone https://github.com/user/t2000 && cd t2000
pnpm install

# Build all packages
pnpm build

# Run checks
pnpm typecheck
pnpm test

# Dev mode
cd packages/sdk && pnpm dev
cd packages/cli && pnpm dev
cd apps/server && pnpm dev
```

## Integration Test

```bash
# Set your private key
echo 'T2000_PASSPHRASE=suiprivkey1q...' >> .env.local

# Run the mainnet integration test
export $(grep -v '^#' .env.local | xargs) && pnpm exec tsx scripts/integration-test.ts
```

## Infrastructure

```bash
# One-time AWS setup (ECS cluster, ECR, IAM)
./infra/setup.sh

# Deploy server or indexer
./infra/deploy.sh --service server
./infra/deploy.sh --service indexer
```

## License

MIT
