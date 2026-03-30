# t2000 — Architecture

> Technical reference for how the stack works end-to-end.

---

## System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           User / AI Agent                                │
│                                                                          │
│  Web App · Claude · Cursor · ChatGPT · CLI · any MCP client              │
└──┬─────────┬──────────────┬──────────────┬───────────────────────────────┘
   │         │              │              │
   │    MCP (stdio)    CLI commands    SDK (TypeScript)
   │         │              │              │
   │         ▼              ▼              ▼
   │  ┌──────────────────────────────────────────────────────────────────┐
   │  │                        @t2000/sdk                                │
   │  │                                                                  │
   │  │  Agent core · Safeguards · Gas manager · Protocol registry       │
   │  │  Adapters: NAVI · Suilend · Cetus                                 │
   │  └────────┬──────────────┬──────────────┬───────────────────────────┘
   │           │              │              │
   ▼           ▼              ▼              ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐
│ Web App     │  │ t2000 Server│  │ MPP Gateway │  │   Sui Blockchain     │
│ (Vercel)    │  │ (ECS)       │  │ (Vercel)    │  │                      │
│             │  │             │  │             │  │  USDC · NAVI ·       │
│ zkLogin     │  │ Sponsor API │  │ 40 services │  │  Suilend · Cetus     │
│ Enoki gas   │  │ Gas station │  │ 88 endpoints│  │  t2000 Treasury      │
│ Agent loop  │  │ Fee ledger  │  │ Explorer    │  │  @mppsui/mpp      │
│ Anthropic   │  │ Indexer     │  │ Spec + Docs │  │  (payment method)    │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────────────────────┘
       │                │                │
       ▼                ▼                ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ NeonDB      │  │  NeonDB     │  │ Upstream    │
│ (web app)   │  │  (server)   │  │ APIs        │
│             │  │             │  │             │
│ Users       │  │ Agents      │  │ OpenAI      │
│ Preferences │  │ Transactions│  │ Anthropic   │
│ Sessions    │  │ Gas ledger  │  │ Brave       │
│             │  │ USDC sponsor│  │ + 37 more   │
└─────────────┘  └─────────────┘  └─────────────┘
```

---

## Packages

| Package | npm | What it does |
|---------|-----|-------------|
| `@t2000/sdk` | Published | TypeScript SDK — agent core, adapters, gas manager, safeguards |
| `@t2000/cli` | Published | 29 CLI commands — `t2000 init`, `t2000 save`, `t2000 pay`, etc. |
| `@t2000/mcp` | Published | MCP server — 32 tools, 19 prompts, stdio transport |
| `@mppsui/mpp` | Published | Sui USDC payment method for MPP (client + server verification) |
| `@mppsui/discovery` | Published | Sui-specific discovery validation — OpenAPI checks + 402 probe |
| `mppx` | External (wevm) | MPP protocol middleware — 402 challenge/credential flow |

## Apps

| App | Hosting | Domain | What it does |
|-----|---------|--------|-------------|
| `apps/web-app` | Vercel | app.t2000.ai | Consumer web app — zkLogin, conversational AI, banking |
| `apps/web` | Vercel | t2000.ai | Product site — docs, demos, stats |
| `apps/gateway` | Vercel | mpp.t2000.ai | MPP gateway — 40 services, 88 endpoints, explorer, spec, docs |
| `apps/server` | AWS ECS Fargate | api.t2000.ai | Sponsor, gas station, fee ledger |
| Indexer | AWS ECS Fargate | — | Checkpoint indexer, yield snapshotter |

---

## Web App (`app.t2000.ai`)

Consumer banking product. Anyone with a Google account gets a Sui wallet in 3 seconds.

### Auth: zkLogin + Enoki

```
User clicks "Sign in with Google"
  │
  ├── Google OAuth → JWT (contains `sub` = Google user ID)
  ├── Generate ephemeral Ed25519 keypair (browser-only, session-scoped)
  ├── Enoki creates ZK proof (JWT + ephemeral key → Sui address)
  ├── Address is deterministic: same Google account = same Sui address
  └── Session stored in localStorage (JWT + ephemeral key + proof)
```

No private key to manage. No seed phrase. The wallet address is derived from the Google JWT. Ephemeral keys are session-scoped and never persisted to a server.

### Transaction flow (sponsored)

```
User taps "Save $50"
  │
  ├── SDK builds a Transaction (gasless — no gas owner set)
  ├── Serialize TX → POST to Enoki sponsorship endpoint
  ├── Enoki sets gasOwner = Enoki gas wallet, signs as sponsor
  ├── User signs TX with ephemeral key (dual-signed)
  └── Submit to Sui fullnode → finality ~400ms
```

All transactions are gas-free for the user. Enoki sponsors gas.

### Agent loop (Anthropic Claude)

For complex queries typed into the chat, an LLM agent loop processes the request:

```
User types "search for flights from NYC to Tokyo"
  │
  ├── POST /api/agent/chat (conversation history + system prompt)
  ├── Anthropic Claude responds with tool_use (search_flights)
  ├── POST /api/agent/tool (executes tool via MPP gateway)
  │   └── Pays USDC on Sui via Enoki-sponsored tx
  ├── Tool result → sent back to Claude for final response
  └── Response rendered in feed with cost breakdown
```

Simple actions (Save, Send, Swap) use client-side chip flows with zero LLM cost.

### Stack

| Component | Technology |
|-----------|-----------|
| Framework | Next.js (App Router) |
| Auth | zkLogin via `@mysten/enoki` |
| Gas | Enoki sponsored transactions |
| LLM | Anthropic Claude (for agent queries) |
| Database | NeonDB (Prisma) — users, preferences, contacts |
| Styling | Tailwind CSS + shadcn/ui patterns |
| Analytics | Vercel Analytics |
| State | TanStack Query + custom hooks |

---

## MPP Gateway (`mpp.t2000.ai`)

Payment infrastructure for machine-to-machine commerce. 40 services, 88 endpoints.

### Pages

| Page | URL | What it shows |
|------|-----|-------------|
| Homepage | `/` | Pitch, live payment feed, stats bar |
| Services | `/services` | Full catalog with search, categories, code examples |
| Explorer | `/explorer` | Payment history, volume chart, service breakdown |
| Spec | `/spec` | MPP protocol specification for Sui |
| Docs | `/docs` | Developer guides — "Pay for APIs" + "Accept payments" |

### Payment logging

Every MPP payment is logged to a dedicated NeonDB (separate from banking DB):

| Field | Type | Description |
|-------|------|------------|
| `service` | String | Service name (e.g. "openai") |
| `endpoint` | String | Endpoint path (e.g. "/v1/chat/completions") |
| `amount` | String | USDC amount charged |
| `digest` | String | Sui transaction digest |
| `sender` | String | Sender Sui address |
| `createdAt` | DateTime | Timestamp |

### API routes

| Route | What it returns |
|-------|----------------|
| `GET /api/mpp/payments?limit=N` | Recent payments (live feed) |
| `GET /api/mpp/stats` | Aggregates: total payments, volume, unique services |
| `GET /api/mpp/volume` | 7-day payment volume by day |
| `GET /api/services` | JSON service catalog |
| `GET /llms.txt` | Agent-readable service catalog |

### Service categories

| Category | Count | Examples |
|----------|-------|---------|
| AI & ML | 12 | OpenAI, Anthropic, Gemini, DeepSeek, Groq, Together, Perplexity, Replicate, Stability AI, Mistral, Cohere |
| Media | 3 | fal.ai, ElevenLabs, AssemblyAI |
| Search & Web | 7 | Brave, Firecrawl, Exa, Jina Reader, Serper, SerpAPI, ScreenshotOne |
| Data & Intelligence | 8 | OpenWeather, Google Maps, CoinGecko, Alpha Vantage, NewsAPI, IPinfo, Hunter.io, ExchangeRate |
| Communication | 2 | Resend, Pushover |
| Translation & Docs | 4 | Google Translate, PDFShift, QR Code, Short.io |
| Compute | 1 | Judge0 |
| Commerce | 2 | Lob, Printful |
| Security | 1 | VirusTotal |

---

## Agent Init (`t2000 init`)

Three-step guided setup that takes a new user from zero to a fully operational AI agent:

```
t2000 init
  │
  ├─ Step 1: Wallet
  │   ├─ Generate Ed25519 keypair
  │   ├─ User sets a PIN (passphrase)
  │   ├─ Encrypt with AES-256-GCM (scrypt-derived key)
  │   ├─ Write to ~/.t2000/wallet.key (mode 0600)
  │   ├─ Cache PIN in ~/.t2000/.session (mode 0600)
  │   ├─ POST /api/sponsor → receive 0.05 SUI bootstrap
  │   └─ POST /api/sponsor/usdc → receive $1 USDC onboarding
  │
  ├─ Step 2: MCP platforms
  │   ├─ Detect installed: Claude Desktop / Cursor / Windsurf
  │   ├─ Add mcpServers.t2000 = { command: 't2000', args: ['mcp'] }
  │   └─ Skip platforms already configured
  │
  └─ Step 3: Safeguards
      ├─ Set maxPerTx (default $500)
      ├─ Set maxDailySend (default $1000)
      └─ Write to ~/.t2000/config.json
```

### Key encryption

| Parameter | Value |
|-----------|-------|
| Algorithm | AES-256-GCM |
| Key derivation | scrypt (N=2¹⁴, r=8, p=1) |
| Salt | 32 bytes random |
| IV | 16 bytes random |
| Auth tag | 16 bytes |
| File format | JSON: `{ version, algorithm, salt, iv, tag, ciphertext }` |
| File path | `~/.t2000/wallet.key` (mode `0600`) |
| Key format | Sui bech32 (`suiprivkey...`) |

### PIN resolution chain

When the SDK needs to decrypt the wallet, it resolves the PIN in this order:

1. `T2000_PIN` or `T2000_PASSPHRASE` env var
2. `~/.t2000/.session` file (cached after first use)
3. Interactive terminal prompt (CLI only)

`t2000 lock` deletes `.session`, forcing re-entry on next use.

### MCP config paths

| Platform | Config file |
|----------|------------|
| Claude Desktop (macOS) | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Desktop (Windows) | `~/AppData/Roaming/Claude/claude_desktop_config.json` |
| Cursor | `~/.cursor/mcp.json` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |

### Bootstrap sponsorship (SUI gas)

- `POST https://api.t2000.ai/api/sponsor` with `{ address, name? }`
- Server splits 0.05 SUI from sponsor wallet → transfers to new agent
- Records in `SponsorRequest` + `GasLedger` (txType: `bootstrap`)
- Upserts agent in DB (makes address "known" to the indexer)
- Rate limited: 10 per IP per hour, hashcash proof above limit

### USDC sponsorship (onboarding)

One-time $1 USDC airdrop to new wallet addresses. Removes the #1 friction point — users sign up with $0 balance.

- `POST https://api.t2000.ai/api/sponsor/usdc` with `{ address, source }`
- Server fetches USDC coins from sponsor wallet, splits 1 USDC, transfers to user
- Records in `UsdcSponsorLog` (address is `@unique` — one-time per address)
- Upserts agent in DB

**Auth per client:**

| Client | Auth | Detail |
|--------|------|--------|
| Web app | `x-internal-key` header | Next.js server-side proxy route holds the secret — browser never sees it |
| CLI | Global rate limit + hashcash | 20/hour free, then proof-of-work challenge (same as SUI gas) |

**Flow (web app):**
```
User signs in with Google → zkLogin → wallet derived
  → useUsdcSponsor hook fires (localStorage check)
  → POST /api/sponsor/usdc (Next.js server route)
    → adds x-internal-key, proxies to api.t2000.ai
  → Server sends 1 USDC from sponsor wallet
  → Hook marks address in localStorage
  → Dashboard shows $1 USDC balance
```

### What exists after init

```
~/.t2000/
  ├── wallet.key       # AES-256-GCM encrypted Ed25519 keypair
  ├── config.json      # Safeguard limits + daily usage tracking
  └── .session         # Cached PIN (deleted on lock)
```

The agent now has:
- A Sui address with 0.05 SUI for gas + $1 USDC (sponsored)
- Safeguard limits configured
- MCP server registered in AI clients
- Ready for `t2000 save`, `t2000 pay`, or any MCP tool call

---

## MPP Payment 

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

1. SDK builds a Transaction (gasless) and serializes it
2. Sends to your gas station server (POST /api/gas)
3. Server adds gas objects, dry-runs, signs as sponsor
4. Returns txBytes + sponsorSignature to SDK
5. SDK signs with user's ephemeral key (dual-signed)
6. Submits to fullnode

### Gas constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `AUTO_TOPUP_THRESHOLD` | 0.05 SUI | Minimum to attempt self-funded TX |
| `GAS_RESERVE_TARGET` | 0.15 SUI | Proactive top-up target |
| `AUTO_TOPUP_AMOUNT` | $1 USDC | Swapped per top-up |
| `AUTO_TOPUP_MIN_USDC` | $2 USDC | USDC required to trigger auto-topup |
| `GAS_RESERVE_MIN` | 0.05 SUI | Always kept when selling/trading |

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
- Events → fee collection

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
| Daily send limit | Max daily outbound (send + pay) |

- Config stored locally in `config.json` alongside the private key
- MCP server refuses to start until safeguard limits are configured
- Only outbound ops are guarded (send, pay) — save/withdraw/borrow are not
- `unlock()` requires human confirmation (not callable by AI)

---

## MCP Server

32 tools across three categories:

| Category | Count | Examples |
|----------|-------|---------|
| Read | 15 | `t2000_balance`, `t2000_positions`, `t2000_rates`, `t2000_services`, `t2000_portfolio` |
| Write | 15 | `t2000_save`, `t2000_send`, `t2000_pay`, `t2000_swap`, `t2000_invest` |
| Safety | 2 | `t2000_config`, `t2000_lock` |

19 prompts for guided workflows: `financial-report`, `optimize-yield`, `morning-briefing`, `weekly-recap`, `emergency`, `dca-advisor`, etc.

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
| Web App (app.t2000.ai) | Vercel | Next.js, zkLogin + Enoki, Anthropic |
| Web (t2000.ai) | Vercel | Next.js, ISR |
| Gateway (mpp.t2000.ai) | Vercel | Next.js, payment logging, explorer |
| Server (api.t2000.ai) | AWS ECS Fargate | Hono, long-running |
| Indexer | AWS ECS Fargate | Checkpoint poller, always-on |
| Database (web app) | NeonDB (Postgres) | Users, preferences, contacts |
| Database (server) | NeonDB (Postgres) | Agents, transactions, gas ledger |
| Database (gateway) | NeonDB (Postgres) | MPP payment logs |
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
  → Publish: @t2000/sdk, @mppsui/mpp, @t2000/mcp, @t2000/cli
  → GitHub Release (auto-generated notes)
  → Discord notification
```

---

## Security Model

### Overview

| Layer | Mechanism |
|-------|----------|
| **Keys** | Ed25519 keypair, AES-256-GCM encrypted at rest with scrypt-derived key |
| **Non-custodial** | Private key never leaves `~/.t2000/wallet.key` — server never sees it |
| **Gas station** | Rate limits, circuit breaker, hashcash, fee ceiling, tx simulation |
| **Safeguards** | Local spending limits, emergency lock, daily budgets |
| **On-chain** | Move-level fee collection, AdminCap-gated config, pause flag |
| **MPP** | HMAC-bound challenges (stateless), on-chain USDC verification |
| **API keys** | Upstream keys stored as Vercel env vars, never exposed to agents |

### Key management

- **Algorithm**: Ed25519 (`@mysten/sui/keypairs/ed25519`)
- **Encryption at rest**: AES-256-GCM with scrypt(PIN, salt) → 256-bit key
- **No mnemonic**: Raw keypair only — no seed phrase to leak
- **Import/export**: `t2000 importKey` / `t2000 exportKey` for migration

### Safeguard enforcement

```
Any write operation (send, save, pay, etc.)
  │
  ├── SafeguardEnforcer.assertNotLocked()
  │   └── If locked: reject immediately
  │
  ├── SafeguardEnforcer.check(metadata)
  │   ├── Is this an outbound op? (send / pay only)
  │   ├── Amount ≤ maxPerTx? ($500 default)
  │   └── dailyUsed + amount ≤ maxDailySend? ($1000 default)
  │
  ├── TxMutex.acquire()  ← serializes all writes
  │
  ├── Build + sign + execute TX
  │
  ├── SafeguardEnforcer.recordUsage(amount)  ← outbound ops only
  │
  └── TxMutex.release()
```

**Outbound ops** (guarded by daily limit): `send`, `pay`
**Non-outbound ops** (no daily limit): `save`, `withdraw`, `borrow`, `repay`, `swap`, `rebalance`, `buy`, `sell`

The daily budget resets automatically when the date changes.

### Emergency lock

```
t2000 lock
  → sets config.locked = true
  → deletes ~/.t2000/.session (forces PIN re-entry)
  → all operations blocked immediately

t2000 unlock
  → requires valid PIN (env var, or interactive prompt)
  → sets config.locked = false
  → restores .session

MCP: t2000_lock tool
  → AI can lock (emergency protection)
  → AI cannot unlock (requires human with PIN)
```

The MCP server exposes `t2000_lock` but not `t2000_unlock`. An AI agent can freeze the wallet in an emergency but cannot unfreeze it — only a human with the PIN can.

### Gas station security

| Protection | How it works |
|-----------|-------------|
| **Rate limiting** | 20 gas requests per address per hour |
| **Hashcash proof-of-work** | When rate limited, client must solve 20-bit PoW (~1–2s) |
| **TX simulation** | `dryRunTransactionBlock` before signing — rejects if gas estimate > $0.05 |
| **Circuit breaker** | Polls Cetus USDC/SUI pool every 30s, trips if >20% price swing in 1 hour |
| **Pool minimum** | Rejects sponsorship when gas wallet < 100 SUI |
| **Serialized signing** | `enqueueSign()` queues gas wallet signing to prevent nonce conflicts |
| **Sponsor rate limit** | 10 bootstrap requests per IP per hour |
| **USDC sponsor limit** | 1 USDC per address (ever), 20/hr global, hashcash above limit |

### Hashcash flow

```
Client                                  Server
  │                                       │
  │── POST /api/gas ─────────────────────>│
  │                                       │── Rate check: over limit
  │<── 200 { error: 'RATE_LIMITED',  ─────│
  │         challenge: 'abc...' }         │
  │                                       │
  │── Compute SHA-256 until 20 leading ─  │
  │   zero bits found (~1M hashes)        │
  │                                       │
  │── POST /api/gas { proof: '...' } ────>│
  │                                       │── Verify PoW, check stamp reuse
  │<── 200 { signedTx: '...' } ──────────│
```

Stamps are tracked in memory with 24h TTL to prevent reuse.

### MPP verification (stateless)

The gateway verifies payments without a database:

1. **Challenge**: HMAC-sign a challenge ID with `MPP_SECRET_KEY`
2. **Verify origin**: Recompute HMAC to confirm challenge was issued by this server
3. **Verify payment**: `getTransactionBlock(digest)` on Sui RPC
   - TX status: success
   - USDC transfer amount ≥ requested amount
   - Recipient = treasury address
4. No replay protection needed — each challenge is single-use via HMAC binding

### Upstream API key isolation

```
Agent (local)                    Gateway (Vercel)              Upstream API
  │                                │                              │
  │── Pay USDC on Sui ──────────>│                              │
  │── POST /openai/... ─────────>│                              │
  │   (no API key)                │── Add Authorization header ─>│
  │                                │   (from env: OPENAI_API_KEY) │
  │<── Response ─────────────────│<── Response ──────────────────│
```

- Agents never see upstream API keys
- Keys live as Vercel environment variables
- `chargeProxy()` injects headers server-side via `upstreamHeaders`
- Response is proxied back without exposing internal headers

### Transaction serialization (TxMutex)

All write operations go through a `TxMutex` that ensures only one transaction executes at a time per agent. This prevents Sui object version conflicts that occur when concurrent transactions try to use the same coin objects.

### What the server knows vs doesn't

| Server knows | Server does NOT know |
|-------------|---------------------|
| Agent Sui address (public) | Private key |
| Gas usage amounts | Wallet balance |
| Sponsored TX digests | What the TX does (opaque bytes) |
| Bootstrap requests (IP, address) | CLI usage, local commands |
| USDC sponsorship (address, amount, digest) | — |
| Protocol fee events (from chain) | Which AI client is used |
