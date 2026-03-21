# t2000 — Architecture

> Technical reference for how the stack works end-to-end. Use for internal prep, Mysten calls, and onboarding.

---

## System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           User / AI Agent                                │
│                                                                          │
│  Claude · Cursor · ChatGPT · CLI · any MCP client                       │
└────────┬──────────────┬──────────────┬───────────────────────────────────┘
         │              │              │
    MCP (stdio)    CLI commands    SDK (TypeScript)
         │              │              │
         ▼              ▼              ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        @t2000/sdk                                        │
│                                                                          │
│  Agent core · Safeguards · Gas manager · Protocol registry               │
│  Adapters: NAVI · Suilend · Cetus · Sentinel                            │
└────────┬──────────────┬──────────────┬───────────────────────────────────┘
         │              │              │
         ▼              ▼              ▼
┌─────────────┐  ┌─────────────┐  ┌────────────────────────────────────────┐
│ t2000 Server│  │ MPP Gateway │  │           Sui Blockchain               │
│ (ECS)       │  │ (Vercel)    │  │                                        │
│             │  │             │  │  USDC · NAVI · Suilend · Cetus         │
│ Sponsor API │  │ 35 services │  │  t2000 Treasury · Fee collection       │
│ Gas station │  │ 79 endpoints│  │  Sentinel · Payment Kit                │
│ Fee ledger  │  │ chargeProxy │  │                                        │
│ Indexer     │  │             │  │                                        │
└──────┬──────┘  └──────┬──────┘  └────────────────────────────────────────┘
       │                │
       ▼                ▼
┌─────────────┐  ┌─────────────┐
│  NeonDB     │  │ Upstream    │
│  (Postgres) │  │ APIs        │
│             │  │             │
│ Agents      │  │ OpenAI      │
│ Transactions│  │ Anthropic   │
│ Gas ledger  │  │ Brave       │
│ Yield snaps │  │ + 32 more   │
└─────────────┘  └─────────────┘
```

---

## Packages

| Package | npm | What it does |
|---------|-----|-------------|
| `@t2000/sdk` | Published | TypeScript SDK — agent core, adapters, gas manager, safeguards |
| `@t2000/cli` | Published | 29 CLI commands — `t2000 init`, `t2000 save`, `t2000 pay`, etc. |
| `@t2000/mcp` | Published | MCP server — 35 tools, 20 prompts, stdio transport |
| `@t2000/mpp-sui` | Published | Sui USDC payment method for MPP (client + server verification) |
| `mppx` | External (wevm) | MPP protocol middleware — 402 challenge/credential flow |

## Apps

| App | Hosting | Domain | What it does |
|-----|---------|--------|-------------|
| `apps/web` | Vercel | t2000.ai | Product site — docs, demos, stats |
| `apps/gateway` | Vercel | mpp.t2000.ai | MPP gateway — 35 pay-per-use APIs |
| `apps/server` | AWS ECS Fargate | api.t2000.ai | Sponsor, gas station, fee ledger |
| Indexer | AWS ECS Fargate | — | Checkpoint indexer, yield snapshotter |

---

## MPP Payment Flow

When a user runs `t2000 pay <url>` or an AI agent calls `t2000_pay`:

```
Agent                              Gateway                          Sui
  │                                   │                              │
  │── POST /openai/v1/chat/... ──────>│                              │
  │                                   │                              │
  │<── 402 Payment Required ─────────│                              │
  │    WWW-Authenticate: Payment      │                              │
  │    amount=0.01, currency=USDC     │                              │
  │    recipient=<treasury>           │                              │
  │                                   │                              │
  │   ┌─ Build Sui TX ─────────────────────────────────────────────>│
  │   │  splitCoins(usdc, 0.01)       │                              │
  │   │  transferObjects → treasury   │                              │
  │   │  sign + execute               │                              │
  │   └─ TX confirmed ←──────────────────────────────────────────────│
  │      digest: "abc123..."          │                              │
  │                                   │                              │
  │── Retry + credential {digest} ──>│                              │
  │                                   │── getTransactionBlock ──────>│
  │                                   │   verify: success,           │
  │                                   │   USDC ≥ amount,             │
  │                                   │   recipient = treasury       │
  │                                   │                              │
  │                                   │── Proxy to OpenAI ────>      │
  │                                   │<── API response ────────     │
  │                                   │                              │
  │<── 200 OK + response ────────────│                              │
  │    x-payment-receipt: {digest}    │                              │
```

### How verification works (stateless)

The gateway uses `mppx` which does HMAC-bound challenge IDs. No database lookup needed:

1. Gateway issues a 402 with a challenge (HMAC-signed with `MPP_SECRET_KEY`)
2. Client pays on-chain, gets tx digest
3. Client retries with credential containing the digest
4. Gateway recomputes the HMAC to verify the challenge was issued by this server
5. Gateway calls `getTransactionBlock(digest)` on Sui RPC
6. Checks: tx succeeded, USDC transfer to treasury ≥ requested amount
7. Proxies to upstream API, returns response with receipt header

### On-chain transaction

- Simple USDC coin transfer: `splitCoins` → `transferObjects` to treasury
- Currency: `0xdba3...::usdc::USDC` (Circle USDC on Sui)
- Gas: handled by SDK's gas manager (self-funded or sponsored)
- Finality: ~400ms

---

## Gas System

Every Sui transaction needs SUI for gas. The SDK handles this automatically with a three-tier resolution chain:

```
SDK: executeWithGas(buildTx)
  │
  ├─ 1. Self-funded (agent has ≥ 0.05 SUI)
  │     → sign and execute with agent's keypair
  │
  ├─ 2. Auto-topup (SUI < 0.15, USDC ≥ $2)
  │     → swap $1 USDC → SUI via Cetus
  │     → then self-fund the main TX
  │
  └─ 3. Gas station (fallback)
        → POST /api/gas with serialized TX
        → server sets gasOwner = gas wallet, signs
        → agent signs TX bytes
        → execute with dual signatures
        → report gas usage
```

### Gas constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `AUTO_TOPUP_THRESHOLD` | 0.05 SUI | Minimum to attempt self-funded TX |
| `GAS_RESERVE_TARGET` | 0.15 SUI | Proactive top-up target |
| `AUTO_TOPUP_AMOUNT` | $1 USDC | Swapped per top-up |
| `AUTO_TOPUP_MIN_USDC` | $2 USDC | USDC required to trigger auto-topup |
| `GAS_RESERVE_MIN` | 0.05 SUI | Always kept when selling/investing |

### New agent bootstrap

On `t2000 init`, the sponsor endpoint sends 0.05 SUI to the new agent address. After that, the agent self-funds gas or auto-tops up via Cetus.

### Gas station protections

| Protection | Rule |
|-----------|------|
| Circuit breaker | Pauses if SUI price moves >20% in 1 hour |
| Fee ceiling | Rejects sponsored tx if estimated gas > $0.05 |
| Pool minimum | Gas wallet must keep ≥ 100 SUI |
| Rate limit | 20 sponsored txs per address per hour |
| Hashcash | Proof-of-work challenge when rate limited |
| Serialized signing | `enqueueSign()` prevents concurrent signing on gas keypair |

### Proactive maintenance

After every successful TX, the SDK checks if SUI dropped below 0.15. If so and USDC ≥ $2, it runs an auto-topup in the background so the next TX is self-funded. Users never think about gas.

---

## Indexer

Checkpoint-based indexer running on ECS Fargate, polling Sui every 2 seconds.

```
Sui Checkpoints → Indexer → NeonDB
                     │
                     ├── Parse FeeCollected events → ProtocolFeeLedger
                     ├── Parse transfers for known agents → Transaction
                     ├── Update agent.lastSeen
                     └── Yield snapshotter (hourly) → YieldSnapshot
```

### What it tracks

| Data | Model | Fields |
|------|-------|--------|
| On-chain actions | `Transaction` | agent, action (save/withdraw/borrow/swap/pay), protocol, asset, amount, gas method |
| Protocol fees | `ProtocolFeeLedger` | agent, operation, fee amount, tx digest |
| Yield snapshots | `YieldSnapshot` | agent, supplied USD, yield earned, APY |
| Agent metadata | `Agent` | address, name, last seen |

### Known-agents filter

The indexer only tracks addresses that went through `t2000 init` (bootstrap sponsorship). Random Sui addresses are ignored. This means:
- Only opted-in agents are tracked
- No scanning of arbitrary wallets
- Privacy by design

### Action classification

The indexer uses SDK adapter descriptors to classify transactions:
- Move call targets → map to protocol (NAVI, Suilend, Cetus)
- Balance changes → infer action type (save, withdraw, swap, etc.)
- Events → fee collection, sentinel attacks

---

## Protocol Fees

On-chain fee collection via Move contracts:

```
User TX (save, borrow, etc.)
  │
  ├── Main operation (e.g. supply to NAVI)
  │
  └── treasury::collect_fee(coin, fee_bps)
      → splits fee from operation coin
      → transfers to t2000 Treasury (0x3bb501b8...)
```

- Fees are set in BPS via the on-chain `Config` object (AdminCap required to change)
- SDK adds `collect_fee` to the PTB automatically
- Server's `/api/fees` endpoint records fees in Postgres for analytics
- Fee events are also picked up by the indexer via `FeeCollected` events

---

## Move Contracts (Sui mainnet)

| Contract | Purpose |
|----------|---------|
| `t2000.move` | Config (fee BPS, paused flag), AdminCap |
| `treasury.move` | `collect_fee()`, withdraw collected fees |
| `admin.move` | Admin operations (update config, pause) |

### Key on-chain objects

| Object | ID | Purpose |
|--------|-----|---------|
| Package | `0xab92e9f1...` | t2000 Move package |
| Config | `0x408add9a...` | Fee rates, pause flag |
| Treasury | `0x3bb501b8...` | Collected protocol fees |

---

## DeFi Adapters

### Protocol Registry

The SDK's `ProtocolRegistry` routes operations to the best protocol:

```
agent.save('USDC', 100)
  → registry.bestSaveRate('USDC')
  → compares NAVI APY vs Suilend APY
  → routes to highest yield
```

### NAVI Adapter

- Lending: save, withdraw, borrow, repay
- Assets: USDC, USDT, SUI, ETH, GOLD, USDe, USDsui
- Uses NAVI SDK with dynamic package IDs
- Supports flash loans for complex operations

### Suilend Adapter

- Lending: save, withdraw, borrow, repay
- Uses `@suilend/sdk` (SuilendClient)
- Obligations-based lending model

### Cetus Adapter

- Swap only
- Uses Cetus Aggregator SDK V3 for routing
- Supports all pairs: USDC↔SUI, USDC↔BTC, USDC↔ETH, USDC↔GOLD, stable↔stable
- Also used internally for gas auto-topup (USDC → SUI)

---

## Safeguards

Local-only enforcement on the agent's machine:

| Guard | What it does |
|-------|-------------|
| Emergency lock | `agent.lock()` — blocks all outbound operations instantly |
| Per-TX limit | Max dollar amount per transaction (0 = unlimited) |
| Daily send limit | Max daily outbound (send + pay + sentinel) |

- Config stored locally in `config.json` alongside the private key
- MCP server refuses to start until safeguard limits are configured
- Only outbound ops are guarded (send, pay, sentinel) — save/withdraw/borrow are not
- `unlock()` requires human confirmation (not callable by AI)

---

## MCP Server

35 tools across three categories:

| Category | Count | Examples |
|----------|-------|---------|
| Read | 17 | `t2000_balance`, `t2000_positions`, `t2000_rates`, `t2000_services`, `t2000_portfolio` |
| Write | 16 | `t2000_save`, `t2000_send`, `t2000_pay`, `t2000_exchange`, `t2000_invest` |
| Safety | 2 | `t2000_config`, `t2000_lock` |

20 prompts for guided workflows: `financial-report`, `optimize-yield`, `morning-briefing`, `weekly-recap`, `emergency`, `dca-advisor`, etc.

All write operations go through a `TxMutex` to prevent concurrent transactions (Sui object version conflicts). Safeguards are checked before every write.

---

## Analytics & Privacy

### What IS tracked

| What | Where | Purpose |
|------|-------|---------|
| Page views | Vercel Analytics (t2000.ai + mpp.t2000.ai) | Standard web analytics, no wallet data |
| Agent addresses | Server DB (agents table) | Only agents that used `t2000 init` |
| On-chain actions | Indexer → Transaction table | Dashboard stats (save/withdraw/swap counts) |
| Gas usage | GasLedger | Accounting for sponsorship costs |
| Protocol fees | ProtocolFeeLedger | Revenue tracking |

### What is NOT tracked

- **SDK**: zero telemetry — no phone-home, no analytics
- **CLI**: zero telemetry — purely local
- **Private keys**: never leave the user's machine
- **Public stats API**: only aggregates — no individual addresses or tx digests
- **Non-opted-in addresses**: invisible to the indexer

### Public stats API (`/api/stats`)

Returns only aggregated numbers:
- Total agents, 24h/7d counts (no addresses)
- Transaction counts by action/protocol (no addresses)
- Gas station spend totals
- Treasury and gateway balances

---

## Infrastructure

| Component | Hosting | Notes |
|-----------|---------|-------|
| Web (t2000.ai) | Vercel | Next.js, ISR |
| Gateway (mpp.t2000.ai) | Vercel | Next.js, stateless |
| Server (api.t2000.ai) | AWS ECS Fargate | Hono, long-running |
| Indexer | AWS ECS Fargate | Checkpoint poller, always-on |
| Database | NeonDB (Postgres) | Prisma ORM, used by server + web |
| DNS | Cloudflare | — |
| CI/CD | GitHub Actions | Lint, typecheck, test, publish, deploy |

### Deployment pipeline

```
Push to main
  │
  ├── CI: lint + typecheck + test (all packages)
  │
  ├── Deploy Server (if apps/server/** changed)
  │   → Docker build → ECR → ECS service update
  │
  ├── Deploy Indexer (if indexer/** changed)
  │   → Docker build → ECR → ECS service update
  │
  └── Web + Gateway auto-deploy via Vercel
```

### Publish pipeline (on tag `v*`)

```
Tag v0.22.3
  → CI: lint + typecheck + test
  → Build all packages
  → Publish: @t2000/sdk, @t2000/mpp-sui, @t2000/mcp, @t2000/cli
  → GitHub Release (auto-generated notes)
  → Discord notification
```

---

## Security Model

| Layer | Mechanism |
|-------|----------|
| **Keys** | Ed25519 keypair stored locally, encrypted with user PIN |
| **Non-custodial** | Server never sees private keys |
| **Gas station** | Rate limits, circuit breaker, hashcash, fee ceiling |
| **Safeguards** | Local spending limits, emergency lock |
| **On-chain** | Move-level fee collection, AdminCap for config changes |
| **MPP** | HMAC-bound challenges (stateless), on-chain verification |
| **API keys** | Upstream keys stored as Vercel env vars, never exposed to agents |
