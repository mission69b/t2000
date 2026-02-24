# t2000

### The first wallet for AI agents.

One command to create. USDC in, USDC out. Gas is invisible. Idle cash earns yield.

```typescript
const agent = await T2000.create({ passphrase: process.env.T2000_PASSPHRASE });
await agent.send({ to: '0x...', amount: 50 });
await agent.save({ amount: 100 });  // earn 8%+ APY
```

---

## Why t2000?

AI agents need money. They need to pay for APIs, receive payments, hold funds, and eventually — fund themselves. But today, giving an agent a wallet means teaching it about gas tokens, transaction signing, RPC endpoints, and DeFi protocols.

**t2000 makes all of that invisible.**

| Problem | t2000 Solution |
|---------|---------------|
| Agents can't hold money | Non-custodial wallet in one line of code |
| Gas tokens are confusing | Auto-managed — agent never sees SUI |
| Idle funds lose value | Automatic yield via Suilend (8%+ APY) |
| DeFi is complex | `save()`, `swap()`, `borrow()` — three methods |
| No standard wallet interface | SDK + CLI + HTTP API for any language |

### The Self-Funding Loop

```
Agent initializes (t2000 init)
       ↓
Fund wallet with USDC
       ↓
Agent sends, receives, holds USDC
       ↓
Idle USDC → save → earn yield automatically
       ↓
Yield accumulates (8%+ APY)
       ↓
At $2,000+ supplied, yield offsets compute costs
       ↓
Agent becomes self-funding
```

| Supplied | APY | Monthly Yield | Covers |
|----------|-----|---------------|--------|
| $100 | 8% | $0.67 | — |
| $500 | 8% | $3.33 | Light agent ($3/mo) |
| $2,000 | 8% | $13.33 | Medium agent ($15/mo) |
| $10,000 | 8% | $66.67 | Heavy agent |

---

## 30-Second Quickstart

```bash
npm install -g @t2000/cli

t2000 init              # Create a wallet
t2000 deposit           # Get funding address
t2000 balance           # Check balance
t2000 send 10 0x...     # Send USDC
t2000 save 50           # Earn yield
t2000 earnings          # Check what you've earned
```

---

## Repository Structure

```
t2000/
├── packages/
│   ├── sdk/                    @t2000/sdk — TypeScript SDK (core)
│   │   └── src/
│   │       ├── t2000.ts        Main T2000 class
│   │       ├── wallet/         Key management, send, balance, history
│   │       ├── protocols/      Suilend (save/borrow), Cetus (swap), fees
│   │       ├── gas/            Gas manager, auto-topup, gas station client
│   │       └── utils/          Retry, simulate, format, hashcash
│   │
│   ├── cli/                    @t2000/cli — Terminal wallet
│   │   └── src/commands/       20 commands + HTTP API server (serve)
│   │
│   └── contracts/              Move smart contracts (deployed to mainnet)
│       └── sources/            treasury, admin, events, errors
│
├── apps/
│   ├── server/                 @t2000/server — Gas station + indexer
│   │   ├── src/routes/         /api/sponsor, /api/gas, /api/health, /api/fees
│   │   ├── src/indexer/        Checkpoint indexer + yield snapshotter
│   │   ├── src/services/       Sponsor, gas station logic
│   │   ├── src/lib/            Price cache, signing queue, wallets
│   │   └── prisma/             Database schema (8 models)
│   │
│   └── web/                    @t2000/web — Landing page (Next.js)
│
├── infra/                      AWS ECS deployment
│   ├── setup.sh                One-shot infrastructure provisioning
│   ├── deploy.sh               Build → ECR → ECS Fargate
│   ├── server-task-definition.json
│   ├── indexer-task-definition.json
│   └── indexer.Dockerfile
│
├── .github/workflows/
│   ├── ci.yml                  Lint + typecheck + tests
│   ├── deploy-server.yml       Auto-deploy server on push
│   └── deploy-indexer.yml      Auto-deploy indexer on push
│
└── scripts/
    └── integration-test.ts     Mainnet E2E test
```

---

## Features

### Wallet (Core)
- **Send USDC** — Transfer to any Sui address
- **Receive** — Deposit USDC from CEX or wallet
- **Balance** — Available + savings + gas reserve breakdown
- **History** — Full transaction log with action inference
- **Key Management** — AES-256-GCM encrypted, passphrase-protected

### Savings (DeFi)
- **Save** — Deposit to Suilend, earn 8%+ APY
- **Withdraw** — Pull from savings anytime (risk-checked)
- **Earnings** — Track yield earned, daily rate, projections
- **Positions** — View all open DeFi positions

### Swap
- **USDC/SUI** — Via Cetus CLMM with on-chain slippage protection
- **Quotes** — Pre-swap price impact and fee disclosure
- **Fee** — 0.1% protocol fee (atomic, on-chain)

### Borrowing
- **Borrow** — Against savings collateral (health factor checked)
- **Repay** — Full or partial, with remaining debt shown
- **Health Factor** — Real-time liquidation safety monitoring
- **Risk Guards** — Blocks withdrawals/borrows that would cause liquidation

### Gas Abstraction
- **Self-funded** — Uses agent's own SUI
- **Auto-topup** — Silently swaps $1 USDC → SUI when gas is low
- **Sponsored** — Gas station pays for bootstrapping
- **Invisible** — Agent never thinks about gas

### Infrastructure
- **Checkpoint Indexer** — 2s polling, crash-safe cursor, event parsing
- **Yield Snapshotter** — Hourly position snapshots for charts
- **Gas Station** — Sponsored transactions with circuit breaker + fee ceiling
- **Price Cache** — TWAP from Cetus pool with 20% circuit breaker

---

## User Flows

### Flow 1: Agent Onboarding

```
Developer                        t2000
─────────                        ─────
npm install -g @t2000/cli
t2000 init ─────────────────────► Generate Ed25519 keypair
                                  Encrypt with AES-256-GCM
                                  Save to ~/.t2000/key.enc
                                  Call /api/sponsor (hashcash PoW)
◄──────────────────────────────── Address: 0x4e12...480f
                                  Sponsored: ✓ (gas station funded)

t2000 deposit ──────────────────► Show funding instructions
                                  "Send USDC on Sui to 0x4e12..."

[User sends USDC from Coinbase]

t2000 balance ──────────────────► Query on-chain balances
◄──────────────────────────────── Available: $100.00 USDC
                                  Gas: 0.12 SUI (~$0.42)
```

### Flow 2: Save and Earn

```
Agent                            t2000                         Suilend
─────                            ─────                         ───────
agent.save({ amount: 50 }) ────► Validate balance
                                 Calculate fee (0.1%)
                                 ensureGas()
                                 Build PTB (deposit + fee) ──► Supply USDC
                                 Sign & execute
◄──────────────────────────────── Saved $50.00 @ 8.2% APY
                                  Fee: $0.05
                                  Tx: 0xa1c2...

[Time passes — yield accrues]

agent.earnings() ──────────────► Read Suilend position
                                 Calculate daily rate
◄──────────────────────────────── Supplied: $50.00
                                  APY: 8.2%
                                  Daily: ~$0.011
```

### Flow 3: Swap with Gas Abstraction

```
Agent                            t2000                  Cetus         Gas Station
─────                            ─────                  ─────         ───────────
agent.swap({                 ──► Check SUI balance
  from: 'USDC',                  SUI < 0.05? ──────────────────────► Request sponsor
  to: 'SUI',                     Auto-topup:
  amount: 5                      Swap $1 USDC → SUI ──► Execute
}) ────────────────────────────── Build swap PTB
                                  Set sqrt_price_limit ── Execute swap
                                  Extract received amount
◄──────────────────────────────── Swapped $5.00 → 1.43 SUI
                                  Gas: auto-topup
                                  Fee: $0.005
```

### Flow 4: HTTP API (Non-TypeScript Agents)

```
Python/Go/Rust Agent             t2000 serve            T2000 SDK
────────────────────             ───────────            ─────────
                                 t2000 serve --port 3001
                                 Token: t2k_a1b2c3...

POST /v1/send ──────────────────► Auth: Bearer t2k_...
  { to, amount }                  Rate limit check
                                  agent.send() ────────► Execute on Sui
◄──────────────────────────────── { success: true,
                                    data: { tx, amount,
                                    gasMethod } }

GET /v1/events ─────────────────► SSE stream
  ?subscribe=yield               Keep-alive ping
◄─ event: yield ─────────────────  { earned: 0.003 }
◄─ event: yield ─────────────────  { earned: 0.003 }
```

---

## SDK Usage

```typescript
import { T2000 } from '@t2000/sdk';

// Create from passphrase
const agent = await T2000.create({ passphrase: process.env.T2000_PASSPHRASE });

// Or from private key directly
const agent = T2000.fromPrivateKey('suiprivkey1q...');
```

### All Methods

| Category | Method | Returns |
|----------|--------|---------|
| **Wallet** | `agent.address()` | `string` |
| | `agent.balance()` | `{ available, savings, gasReserve, total }` |
| | `agent.send({ to, amount })` | `{ tx, gasMethod, balance }` |
| | `agent.history({ limit })` | `TransactionRecord[]` |
| | `agent.deposit()` | `{ address, instructions }` |
| **Savings** | `agent.save({ amount })` | `{ tx, apy, fee, gasMethod }` |
| | `agent.withdraw({ amount })` | `{ tx, amount, gasMethod }` |
| | `agent.earnings()` | `{ totalYieldEarned, currentApy, dailyEarning }` |
| | `agent.fundStatus()` | `{ supplied, apy, projectedMonthly }` |
| **Swap** | `agent.swap({ from, to, amount })` | `{ tx, toAmount, priceImpact, fee }` |
| | `agent.swapQuote({ from, to, amount })` | `{ expectedOutput, poolPrice, fee }` |
| **Borrow** | `agent.borrow({ amount })` | `{ tx, healthFactor, fee }` |
| | `agent.repay({ amount })` | `{ tx, remainingDebt }` |
| **Info** | `agent.healthFactor()` | `{ healthFactor, supplied, borrowed }` |
| | `agent.maxWithdraw()` | `{ maxAmount, healthFactorAfter }` |
| | `agent.maxBorrow()` | `{ maxAmount, healthFactorAfter }` |
| | `agent.rates()` | `{ USDC: { saveApy, borrowApy } }` |
| | `agent.positions()` | `{ positions: PositionEntry[] }` |

### Events

```typescript
agent.on('balanceChange', (e) => console.log(e.cause, e.asset));
agent.on('healthWarning', (e) => console.log('HF:', e.healthFactor));
agent.on('healthCritical', (e) => console.log('CRITICAL:', e.healthFactor));
agent.on('yield', (e) => console.log('Earned:', e.earned));
agent.on('gasAutoTopUp', (e) => console.log('Topped up:', e.suiReceived, 'SUI'));
agent.on('gasStationFallback', (e) => console.log('Fallback:', e.reason));
agent.on('error', (e) => console.error(e.code, e.message));
```

---

## CLI Commands

```bash
# Wallet
t2000 init                      Create wallet
t2000 balance                   Check balance
t2000 address                   Show address
t2000 deposit                   Funding instructions
t2000 send 10 0xABC...          Send USDC
t2000 history                   Transaction history
t2000 export-key                Export private key
t2000 import-key <key>          Import private key

# Savings & DeFi
t2000 save 50                   Save (earn yield)
t2000 withdraw 25               Withdraw savings
t2000 swap 5 USDC SUI           Swap on Cetus
t2000 borrow 10                 Borrow against collateral
t2000 repay 10                  Repay borrow
t2000 health                    Health factor
t2000 earnings                  Yield earned
t2000 fund-status               Full savings report
t2000 rates                     Current APYs
t2000 positions                 Open positions

# API Server
t2000 serve --port 3001         Start HTTP API
t2000 config set key value      Set configuration

# Flags
--json                          Structured JSON output
--yes                           Skip confirmations
--key <path>                    Custom key file
```

---

## HTTP API

```bash
t2000 serve --port 3001
# ✓ Auth token: t2k_a1b2c3d4e5f6...
```

All endpoints require `Authorization: Bearer <token>`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/address` | Wallet address |
| GET | `/v1/balance` | Balance breakdown |
| GET | `/v1/history` | Transaction history |
| GET | `/v1/deposit` | Funding instructions |
| GET | `/v1/earnings` | Yield summary |
| GET | `/v1/rates` | Current APYs |
| GET | `/v1/health-factor` | Health factor |
| GET | `/v1/max-withdraw` | Safe withdrawal limit |
| GET | `/v1/max-borrow` | Safe borrow limit |
| GET | `/v1/positions` | Open positions |
| POST | `/v1/send` | Send USDC `{ to, amount }` |
| POST | `/v1/save` | Save `{ amount }` |
| POST | `/v1/supply` | Alias for save |
| POST | `/v1/withdraw` | Withdraw `{ amount }` |
| POST | `/v1/swap` | Swap `{ from, to, amount }` |
| POST | `/v1/borrow` | Borrow `{ amount }` |
| POST | `/v1/repay` | Repay `{ amount }` |
| GET | `/v1/events` | SSE stream `?subscribe=yield,balanceChange` |

Response envelope: `{ success: true, data: {...}, timestamp }`.

---

## Architecture

```
                              ┌─────────────────────────────────────────┐
                              │              AI Agent                   │
                              │  (TypeScript / Python / Go / Rust)      │
                              └────────────┬───────────────┬────────────┘
                                           │               │
                              ┌────────────▼──┐    ┌───────▼──────────┐
                              │  @t2000/sdk   │    │  HTTP API        │
                              │  (TypeScript) │    │  (t2000 serve)   │
                              └────────┬──────┘    │  Bearer auth     │
                                       │           │  Rate limiting   │
                                       │           │  SSE events      │
                                       │           └───────┬──────────┘
                                       │                   │
                              ┌────────▼───────────────────▼──────────┐
                              │           T2000 Core Engine            │
                              │                                        │
                              │  ┌──────────┐ ┌──────────┐ ┌────────┐ │
                              │  │ Wallet   │ │ Suilend  │ │ Cetus  │ │
                              │  │ send     │ │ save     │ │ swap   │ │
                              │  │ balance  │ │ withdraw │ │ quote  │ │
                              │  │ history  │ │ borrow   │ │        │ │
                              │  └──────────┘ │ repay    │ └────────┘ │
                              │               └──────────┘            │
                              │  ┌──────────────────────────────────┐ │
                              │  │        Gas Manager               │ │
                              │  │  self-funded → auto-topup →      │ │
                              │  │  sponsored → fail                │ │
                              │  └──────────────────────────────────┘ │
                              └────────────────────┬──────────────────┘
                                                   │
                    ┌──────────────────────────────┼──────────────────────┐
                    │                              │                      │
          ┌─────────▼─────────┐         ┌──────────▼─────────┐  ┌────────▼────────┐
          │    Sui Network    │         │   t2000 Server     │  │  NeonDB         │
          │                   │         │   (ECS Fargate)    │  │  (Postgres)     │
          │  • Transactions   │         │                    │  │                 │
          │  • Objects        │         │  • /api/sponsor    │  │  • agents       │
          │  • Events         │         │  • /api/gas        │  │  • transactions │
          │  • Checkpoints    │         │  • /api/health     │  │  • positions    │
          │                   │         │  • /api/fees       │  │  • yield snaps  │
          └───────────────────┘         │                    │  │  • fee ledger   │
                    ▲                   │  ┌──────────────┐  │  │  • gas ledger   │
                    │                   │  │   Indexer     │  │  └─────────────────┘
                    └───────────────────┤  │   (2s poll)   │  │
                                        │  │   checkpoint  │  │
                                        │  │   cursor      │  │
                                        │  └──────────────┘  │
                                        │                    │
                                        │  ┌──────────────┐  │
                                        │  │ Price Cache   │  │
                                        │  │ TWAP + CB     │  │
                                        │  └──────────────┘  │
                                        └────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Chain** | Sui (mainnet) |
| **Contracts** | Move (treasury, admin, fee collection) |
| **SDK** | TypeScript, `@mysten/sui`, `@suilend/sdk`, `eventemitter3` |
| **CLI** | Commander.js, Hono (serve), `@inquirer/prompts` |
| **Server** | Hono, Prisma, Node.js |
| **Database** | NeonDB (serverless Postgres) |
| **Web** | Next.js 16, Tailwind CSS v4, React 19 |
| **Infra** | AWS ECS Fargate, ECR, CloudWatch, Secrets Manager |
| **CI/CD** | GitHub Actions (lint → typecheck → build → deploy) |
| **DeFi** | Suilend (lending), Cetus CLMM (swaps) |

---

## Development

```bash
# Clone and install
git clone https://github.com/user/t2000 && cd t2000
pnpm install

# Build all packages
pnpm build

# Run checks
pnpm typecheck              # TypeScript across all packages
pnpm test                   # Unit tests (28 tests)
pnpm lint                   # ESLint

# Dev mode (watch)
pnpm --filter @t2000/sdk dev
pnpm --filter @t2000/cli dev
pnpm --filter @t2000/server dev
pnpm --filter @t2000/web dev
```

### Integration Test (Mainnet)

```bash
# Set your private key
echo 'T2000_PASSPHRASE=suiprivkey1q...' >> .env.local

# Run
export $(grep -v '^#' .env.local | xargs) && pnpm exec tsx scripts/integration-test.ts
```

---

## Infrastructure

### One-Time Setup

```bash
# Provision ECS cluster, ECR repos, IAM roles, CloudWatch
./infra/setup.sh

# Store secrets
aws secretsmanager create-secret --name t2000/mainnet/database-url --secret-string 'postgres://...' --region us-east-1
aws secretsmanager create-secret --name t2000/mainnet/sponsor-key --secret-string 'suiprivkey1q...' --region us-east-1
aws secretsmanager create-secret --name t2000/mainnet/gas-station-key --secret-string 'suiprivkey1q...' --region us-east-1
```

### Deploy

```bash
# Manual deploy
./infra/deploy.sh --service server
./infra/deploy.sh --service indexer

# Auto-deploy: push to main triggers GitHub Actions
```

### Services

| Service | CPU | Memory | Task |
|---------|-----|--------|------|
| `t2000-server` | 512 | 1024 MB | API + gas station |
| `t2000-indexer` | 256 | 512 MB | Checkpoint indexer + yield snapshots |

---

## Security

- **Non-custodial** — Keys live on the agent's machine, never transmitted
- **Encrypted storage** — AES-256-GCM with passphrase-derived key (scrypt)
- **Bearer auth** — HTTP API requires token (generated at startup, stored in config)
- **Rate limiting** — 10 req/s default, prevents runaway drain
- **Risk guards** — Health factor checks block risky withdrawals/borrows
- **Transaction simulation** — Dry-run before signing, Move abort code parsing
- **Circuit breaker** — Gas station pauses if SUI price moves >20% in 1 hour
- **Fee ceiling** — Sponsored gas capped at $0.05 per transaction
- **Hashcash PoW** — Anti-spam for sponsored onboarding

---

## Packages

| Package | Version | Description |
|---------|---------|-------------|
| [`@t2000/sdk`](packages/sdk) | 0.1.0 | Core TypeScript SDK |
| [`@t2000/cli`](packages/cli) | 0.1.0 | Terminal wallet + HTTP API |
| [`@t2000/server`](apps/server) | 0.1.0 | Gas station + indexer (self-hosted) |
| [`@t2000/web`](apps/web) | 0.1.0 | Landing page |

---

## License

MIT
