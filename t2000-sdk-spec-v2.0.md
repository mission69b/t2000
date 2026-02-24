# t2000
## *The first wallet for AI agents.*

**Agent Wallet — SDK / CLI / API**
Technical Specification — v4.0

---

## Table of Contents

**MVP (Ships Week 6)**
1. [What This Is](#1-what-this-is)
2. [Core Concept — The Self-Funding Loop](#2-core-concept--the-self-funding-loop)
3. [Gas Model — Zero Friction Execution](#3-gas-model--zero-friction-execution)
4. [Protocol Fees — Revenue Model](#4-protocol-fees--revenue-model)
5. [Interfaces](#5-interfaces)
6. [Sponsored Onboarding](#6-sponsored-onboarding)
7. [CLI Reference](#7-cli-reference)
8. [SDK Reference](#8-sdk-reference)
9. [HTTP API Reference](#9-http-api-reference)
10. [Capabilities](#10-capabilities)
11. [Self-Funding Loop — Implementation](#11-self-funding-loop--implementation)
12. [Resilience & Failure Recovery](#12-resilience--failure-recovery)
13. [Event System](#13-event-system)

**v1.1+ (Post-MVP)**
14. [Multi-Agent Support (v1.1)](#14-multi-agent-support-v11)
15. [Dashboard — The Agent Network (v1.1)](#15-dashboard--the-agent-network)

**Website**
16. [Website & Visual Identity](#16-website--visual-identity)

**Infrastructure**
17. [Architecture](#17-architecture)
18. [Security Model](#18-security-model)
19. [Build Timeline](#19-build-timeline)
20. [Tech Stack](#20-tech-stack)
21. [Testing](#21-testing)

---

## 1. What This Is

t2000 is the first wallet built for AI agents. One command to create. USDC in, USDC out. Gas is invisible. Idle cash earns yield.

It's a TypeScript SDK, CLI, and HTTP API that gives any AI agent a non-custodial wallet with the ability to send money, receive money, earn interest on idle balance, swap between currencies, and borrow against deposits — all via simple function calls or CLI commands. Everything is denominated in USDC. The underlying chain is an implementation detail the agent never sees.

Think of it as a **bank account for AI agents**: checking (send/receive), savings (earn yield), credit (borrow), and currency exchange (swap) — all in one CLI command.

**Product A (this spec):** Wallet SDK + CLI + local API. Sui-only MVP. Dashboard ships in v1.1. Cross-chain ships in v1.2.
**Product B (later):** Telegram bot with voice activation, built on top of this.

### Who This Is For

- **AI agent developers** (Eliza, LangChain, AutoGen, CrewAI, custom) who need their agents to hold and move money
- **Developers building autonomous systems** that need to pay for services, receive payments, or manage treasury
- **Anyone** who wants to give an LLM agent a real wallet without learning blockchain

### What Makes It Different

**It's a wallet, not a DeFi SDK.** The primary operations are send, receive, and check balance. Yield, swaps, and borrowing are features of the wallet — not the other way around.

**Built for machines, not humans.** Every response is structured JSON. No interactive prompts in non-TTY environments. Errors are machine-readable with typed error codes. The agent is the primary user.

**USDC-centric.** All values, thresholds, and displays are denominated in USDC. The agent thinks in dollars, not tokens.

**Gas is invisible.** Bootstrapped by sponsored transactions, then self-funded via automatic SUI reserve management. The agent never thinks about gas.

**Chain-agnostic framing.** Powered by Sui under the hood — fastest finality, lowest fees. But the developer and agent interface never mentions it. Cross-chain support (Ika multi-chain signing, CCTP) ships post-MVP.

### Design Principles

1. **One command to start.** `npx t2000 init` → wallet exists, ready for USDC.
2. **Send first.** The most basic wallet operation works out of the box.
3. **USDC is the unit of account.** Balances, yields, costs, thresholds — all in dollars.
4. **Gas is invisible.** Bootstrapped via sponsored transactions, then auto-managed. The agent never needs to think about gas.
5. **Idle cash earns yield.** `save` puts USDC in savings at 8%+ APY. Withdraw anytime.
6. **Errors are actionable.** Every error tells the agent exactly what went wrong and what to do.
7. **No custody.** Keys live on your machine. The API is self-hosted. Nobody else holds your keys.

---

## 2. Core Concept — The Self-Funding Loop

### The Mechanism

```
Agent initializes (npx t2000 init)
       ↓
Sponsored onboarding (zero cost)
       ↓
Fund wallet with USDC ($5 – $500+)
       ↓
Agent sends, receives, holds USDC (the wallet)
       ↓
Idle USDC → save → earn yield automatically
       ↓
Yield accumulates in savings
       ↓
t2000 tracks yield earned
       ↓
Operator withdraws yield surplus anytime
       ↓
At scale, yield offsets or exceeds compute costs
```

### The Economics

| Supplied | APY | Monthly Yield | Light Agent ($3/mo) | Medium Agent ($15/mo) |
|----------|-----|---------------|--------------------|-----------------------|
| $5 | 8% | $0.03 | 1% covered | — |
| $100 | 8% | $0.67 | 22% covered | 4% covered |
| $500 | 8% | $3.33 | 111% ✓ | 22% covered |
| $1,000 | 8% | $6.67 | 222% ✓ | 44% covered |
| $2,000 | 8% | $13.33 | 444% ✓ | 89% covered |
| $3,000 | 8% | $20.00 | 667% ✓ | 133% ✓ |

**Honest caveat:** Self-funding becomes practical at **$2,000+ supplied**. Below that, the friction of withdrawing yield and converting to fiat (exchange fees, wait time) likely exceeds the yield itself. At small balances, yield is a nice bonus — not a business model.

**Primary value:** Give your agent a wallet with DeFi capabilities.
**Secondary value:** Yield from supplied capital offsets compute costs at scale ($2,000+ to be meaningful).

### What t2000 Tracks (But Doesn't Auto-Pay)

t2000 tracks yield earned and surfaces it clearly. It does **not** auto-pay compute providers (Anthropic, OpenAI) because those providers don't have crypto payment rails. Instead:

- Yield accumulates on-chain in the agent wallet
- t2000 surfaces: total yield earned, daily rate, projected monthly
- The operator withdraws yield and applies it to their compute bill manually
- Or: the operator configures a webhook that fires when yield exceeds a threshold

The loop is: earn → track → surface → operator acts. No broken bridges.

---

## 3. Gas Model — Zero Friction Execution

The agent never thinks about gas. Two-phase lifecycle: sponsored bootstrap, then self-funded.

### How It Works

```
Agent calls: agent.send({ to: '0x...', amount: 50 })
       ↓
SDK checks SUI balance
       ↓
If SUI sufficient → pay gas directly from agent's own SUI reserve
If SUI insufficient → Gas Station sponsors (fallback)
If bootstrap phase → first 10 txs are fully sponsored
       ↓
Transaction executes on-chain
       ↓
Agent sees: "Sent $50 USDC" — gas was invisible
```

### Two-Phase Gas Lifecycle

**Phase 1 — Sponsored Bootstrap (first 10 transactions)**

Zero friction onboarding. t2000 sponsors gas for the first 10 transactions. Bootstrap count is tracked **server-side by wallet address** in the `gas_ledger` table — not client-side, not by IP. Cost to t2000: ~$0.10 per agent lifetime.

```
Transaction 1:   t2000 init              → sponsored
Transaction 2:   agent's first operation  → sponsored
...
Transaction N:   USDC→SUI auto-swap       → sponsored (seeds gas reserve)
...
Transaction 10:  last sponsored tx        → sponsored
Transaction 11+: agent pays own gas       → self-funded (from SUI reserve)
```

**Auto-top-up swaps are always sponsored.** When the SDK needs to swap USDC→SUI to replenish the gas reserve, this swap is sponsored by the Gas Station unconditionally — even after the 10-tx bootstrap expires. This prevents a race condition: if SUI is at exactly zero, the auto-swap itself needs gas, creating a chicken-and-egg deadlock. Auto-top-up swaps are tiny (~$0.007 gas) and infrequent (~1-2 per month per agent), so the cost to t2000 is negligible.

**Phase 2 — Self-Funded (automatic, after USDC balance > $10)**

The SDK auto-manages a small SUI gas reserve. The agent never interacts with SUI directly.

```
On every transaction:
  1. Check SUI balance
  2. If SUI balance < 0.05 SUI (~$0.18)
     AND USDC available > $5
     → Auto-swap $1 USDC → SUI (Gas Station sponsors the swap gas)
     → Log: "Auto-topped up gas reserve: swapped $1.00 USDC → SUI"
  3. Pay gas from agent's own SUI reserve
  4. If SUI still insufficient AND no USDC for swap → fall back to Gas Station
```

The agent owns its SUI. No dependency on t2000 infrastructure for ongoing operation.

### Gas Station (Fallback Infrastructure)

The Gas Station is no longer load-bearing for every transaction — it's fallback infrastructure for when the agent's SUI reserve is empty and auto-top-up can't execute (e.g., insufficient USDC).

```
┌──────────────────────────────────────────────────┐
│              Gas Station Service (Fallback)       │
│                                                   │
│  ┌──────────────┐  ┌──────────────┐              │
│  │ Sponsor Pool │  │ Bootstrap    │              │
│  │ (SUI reserve │  │ Counter      │              │
│  │  for gas)    │  │ (per wallet) │              │
│  └──────────────┘  └──────────────┘              │
│                                                   │
│  Tracks: gas_ledger (tx_type: bootstrap |        │
│          auto-topup | fallback)                   │
└──────────────────────────────────────────────────┘
```

When the Gas Station is used (bootstrap or fallback), fees work as follows:

### Fee Structure

| Operation | Estimated Gas (SUI) | USDC Equivalent | Sponsorship Cost |
|-----------|---------------------|-----------------|-----------------|
| Send | ~0.002 SUI | ~$0.007 | Free (bootstrap/self-funded) |
| Save/Withdraw | ~0.003 SUI | ~$0.01 | Free (bootstrap/self-funded) |
| Swap | ~0.005 SUI | ~$0.02 | Free (bootstrap/self-funded) |
| Borrow/Repay | ~0.003 SUI | ~$0.01 | Free (bootstrap/self-funded) |

**MVP gas pricing (Gas Station):** Bootstrap and auto-topup sponsorship is free to the agent — t2000 absorbs the cost (~$0.01/agent onboarding, ~$0.007/auto-topup). Fallback sponsorship (rare: agent has no SUI and can't auto-topup) passes through the actual gas cost in USDC at current Cetus spot price, no markup. Dynamic markup and TWAP-based Fee Oracle deferred to v1.1.

**Fee ceiling:** No Gas Station transaction fee exceeds $0.05. If gas cost exceeds $0.05, the request is rejected with `GAS_FEE_EXCEEDED` and `retryAfter`.

**SUI price circuit breaker:** If SUI price moves >20% in 1 hour, Gas Station suspends new sponsorships until price stabilizes. Prevents the pool from being drained during a crash where USDC fees are priced at the old rate while SUI gas costs at the real rate. Agents with their own SUI reserve are unaffected.

### Solvency Model

The Gas Station is a financially stateful service. Much smaller working capital requirement under the two-phase model since most agents self-fund after bootstrap.

**Bootstrap and auto-topup sponsorship is free.** The Gas Station absorbs the gas cost (~$0.01 per onboarding, ~$0.007 per auto-topup). No USDC fee is collected from the agent for these. This is a deliberate cost center — the revenue comes from protocol fees on DeFi operations (save, swap, borrow), not from gas markup.

**Fallback sponsorship (rare) collects actual gas cost in USDC.** If the Gas Station sponsors a non-bootstrap, non-auto-topup transaction, it collects the gas cost at current spot price via a USDC transfer in the PTB. If USDC transfer fails, the entire PTB reverts — no orphaned gas costs.

**The SDK surfaces gas method in all responses.** The `gasMethod` field (`'self-funded' | 'sponsored' | 'auto-topup'`) tells the agent exactly what happened.

**Reconciliation:**

| Scenario | Outcome |
|----------|---------|
| Self-funded: agent has SUI | Agent pays gas directly. No Gas Station involvement. |
| Self-funded: SUI low, USDC available | Auto-swap USDC→SUI (swap gas always sponsored), then pay gas. Transparent. |
| Gas Station: tx succeeds, USDC fee included | Normal. SUI spent, USDC collected. Ledger balanced. |
| Gas Station: agent has insufficient USDC | Entire PTB fails. No gas spent. Agent gets `INSUFFICIENT_BALANCE`. |
| Gas Station: tx reverts after simulation | Rare. Loss tracked in `gas_ledger` with `status: 'loss'`. |
| Gas Station: SUI pool drops below threshold | Sponsorships paused. Agents without SUI reserve get clear error. |

**Pool management:**
- Minimum SUI reserve: 100 SUI (~$350 at $3.50). Below this, sponsorship pauses.
- Replenishment swaps executed by a separate ops wallet (avoids circular dependency).
- All swaps logged in `gas_ledger` for auditability.

**Monitoring:**
- Dashboard (v1.1) shows Gas Station health: SUI pool balance, USDC collected, net P&L, loss rate.
- Alert if loss rate exceeds 1% of transactions.

### Gas Resolution Order

```
1. Self-funded (agent's own SUI balance)      ← primary after bootstrap
2. Auto-top-up (swap $1 USDC → SUI)           ← if SUI low + USDC available (swap gas always sponsored)
3. Gas Station sponsored (fallback)            ← if no SUI and no USDC for swap
4. Fail with INSUFFICIENT_GAS                  ← if all above fail
```

The agent and operator always see the gas method used in every response (`gasMethod: 'self-funded' | 'sponsored' | 'auto-topup'`).

---

## 4. Protocol Fees — Revenue Model

**Free wallet, paid DeFi.** Basic wallet operations (send, receive, balance, history) are free. DeFi operations that route through protocols (save, swap, borrow) carry a small protocol fee. This is the standard DeFi aggregator model.

### Fee Schedule

| Operation | Protocol Fee | Example ($100 operation) | Collected |
|-----------|-------------|--------------------------|-----------|
| **Send** | Free | $0.00 | — |
| **Balance / History / Deposit** | Free | $0.00 | — |
| **Save** (deposit to yield) | 0.1% | $0.10 | On deposit |
| **Withdraw** | Free | $0.00 | — |
| **Swap** | 0.1% | $0.10 | On swap |
| **Borrow** | 0.05% | $0.05 | On origination |
| **Repay** | Free | $0.00 | — |

Never charge to get your own money back (withdraw) or to repay debt (repay).

### Collection Mechanism

Protocol fees are collected **atomically in the same PTB** as the agent's operation. The PTB calls `t2000::treasury::collect_fee<USDC>()` which splits the fee from the agent's coin and stores it in the on-chain Treasury shared object. If the operation fails, the fee reverts too (Sui PTBs are atomic).

```
Agent calls: agent.swap({ from: 'SUI', to: 'USDC', amount: 10 })
       ↓
SDK calculates: swap amount = 10 SUI, protocol fee = 0.1% of output
       ↓
PTB includes: [swap operation] + [protocol fee transfer]
       ↓
Agent sees: received 34.17 USDC (after 0.034 USDC protocol fee)
```

**Pre-signing disclosure:** The SDK surfaces the protocol fee before the agent signs, alongside the gas estimate. No hidden deductions.

**Failed transactions:** Sui PTBs are atomic (all-or-nothing). If any command in the PTB fails — including the operation itself — the entire PTB reverts, including the protocol fee transfer. Agents never pay a fee for a failed operation.

### Transparency

Every response includes a `protocolFee` field:

```json
{
  "success": true,
  "action": "swap",
  "received": 34.17,
  "protocolFee": { "amount": 0.034, "asset": "USDC", "rate": 0.001 },
  "gasCost": 0.005,
  "gasMethod": "self-funded"
}
```

CLI human output:
```bash
t2000 swap 10 SUI USDC

  ✓ Swapped 10 SUI → 34.17 USDC
  ✓ Protocol fee: $0.03 (0.1%)
  ✓ Gas: 0.005 SUI (self-funded)
  ✓ Tx: 0xd4e5...6f7a
```

### Revenue Projections

| Agents | Avg Saved | Daily Swap Vol | Swap Rev/mo | Save Rev/mo | Borrow Rev/mo | Total/mo |
|--------|-----------|---------------|-------------|-------------|---------------|----------|
| 100 | $200 | $20/agent | $60 | $20 | $5 | ~$85 |
| 1,000 | $500 | $50/agent | $1,500 | $500 | $50 | ~$2,050 |
| 10,000 | $500 | $50/agent | $15,000 | $5,000 | $500 | ~$20,500 |
| 50,000 | $500 | $50/agent | $75,000 | $25,000 | $2,500 | ~$102,500 |

Swap fees are the primary revenue driver. Revenue scales linearly with agent activity.

### Protocol Fee Address

Fees are collected into an on-chain `Treasury<USDC>` shared object via `t2000::treasury::collect_fee()`. Admin can withdraw via `withdraw_fees()` (requires AdminCap). Fee rate changes are timelocked (7-day delay). Treasury admin transfer is two-step (propose → accept). Tracked both on-chain (events) and off-chain in `protocol_fee_ledger` for auditability.

---

## 5. Interfaces

Three interfaces. Same SDK. Different consumers.

```
┌───────────────────────────────────────────────────┐
│                   t2000 Core SDK                   │
│  wallet • lending • swaps • gas • auto-SUI reserve │
└──────────────┬──────────────┬─────────────────────┘
               │              │              │
          ┌────▼────┐   ┌─────▼─────┐  ┌────▼────┐
          │   CLI   │   │  HTTP API │  │   SDK   │
          │ humans  │   │  any lang │  │  TS/JS  │
          │ scripts │   │  agents   │  │  agents │
          └─────────┘   └───────────┘  └─────────┘
```

| Interface | Consumer | Use Case |
|-----------|----------|----------|
| CLI | Developers, scripts, shell agents | `t2000 send 50 USDC to 0x...` |
| SDK | TypeScript/JS agents | `await agent.send({ to: '0x...', amount: 50 })` |
| HTTP API | Python, Go, Rust, any language | `POST /v1/send` (self-hosted) |

SDK is the core. CLI and HTTP API are thin wrappers.

### HTTP API — Self-Hosted Model

The HTTP API runs **locally**. Thin HTTP wrapper around the SDK for non-TypeScript agents.

```bash
t2000 serve --port 3001

  ✓ API server running on http://localhost:3001
  ✓ Auth token: t2k_a1b2c3d4e5f6...
  ✓ Token saved to ~/.t2000/config.json

# Python agent calls it at localhost with bearer token
requests.post("http://localhost:3001/v1/send",
  json={"to": "0x...", "amount": 50},
  headers={"Authorization": "Bearer t2k_a1b2c3d4e5f6..."})
```

**Bearer token auth:** A random token is generated at `t2000 serve` startup and stored in `~/.t2000/config.json`. Every request must include `Authorization: Bearer <token>`. The SDK reads the token automatically from config when using the HTTP API internally. This prevents SSRF attacks — a compromised process on the same machine cannot drain the wallet without the token. Restarting the server generates a new token and invalidates the old one.

Rate limited at 10 requests/second by default (configurable: `t2000 serve --rate-limit 50`). Exceeding returns `429 Too Many Requests` with `Retry-After` header. Prevents runaway agent code from draining the wallet while allowing power users to increase the limit.

No hosted API. No custody. Auth protects against local attack vectors.

---

## 6. Sponsored Onboarding

Zero cost to get started. No tokens needed for wallet creation.

### How It Works

```
Agent runs: npx t2000 init
                ↓
t2000 generates Ed25519 keypair locally
                ↓
Keypair encrypted with AES-256-GCM (passphrase prompt)
                ↓
Keypair saved to ~/.t2000/wallet.key (encrypted)
                ↓
t2000 solves hashcash challenge + calls sponsor API
                ↓
Sponsor wallet pays for on-chain wallet creation
                ↓
Agent wallet exists on-chain (10 sponsored txs remaining)
                ↓
Agent ready — send USDC to start
```

### CLI Output

```bash
npx t2000 init

  ✓ Generated keypair (encrypted with passphrase)
  ✓ Wallet created (sponsored)

  Address:  0x4a7f...c291
  Balance:  $0.00 USDC

  Bootstrap: 10 sponsored transactions remaining

  Fund your wallet:
  → t2000 deposit   (shows funding options)

  Ready. Your agent has a wallet.
```

### Deposit Flow

**MVP deposit flow:**

```bash
t2000 deposit

  Fund your wallet: 0x4a7f...c291

  From an exchange (easiest):
  ─────────────────────────────────
  Withdraw USDC to Sui network from:
  → Coinbase   (select "Sui" as withdrawal network)
  → Binance    (select "Sui / SUI" as withdrawal network)
  → OKX        (select "Sui" as withdrawal network)

  From another wallet on Sui:
  ─────────────────────────────────
  Send native USDC to 0x4a7f...c291

  Testnet only:
  ─────────────────────────────────
  → Free testnet USDC: https://faucet.circle.com
```

```json
// --json output
{
  "address": "0x4a7f...c291",
  "network": "sui",
  "nativeUsdcAddress": "0xdba3...e7::usdc::USDC",
  "fundingOptions": {
    "exchange": ["coinbase", "binance", "okx"],
    "testnetFaucet": "https://faucet.circle.com"
  }
}
```

**v1.2 — Cross-chain deposits** via Ika (multi-chain signing) or CCTP (burn/mint). See [Appendix C](#appendix-c--cross-chain-strategy). The deposit module is designed as a swappable interface for this upgrade.

### Sponsor Infrastructure

The sponsor is a t2000-controlled wallet. Every `init` call:
1. Receives the new public key
2. Builds a sponsored transaction for wallet creation
3. Sponsor pays the fee (~$0.007)
4. New wallet exists on-chain

### Sponsor API

```
POST https://api.t2000.ai/api/sponsor
Content-Type: application/json

{
  "address": "0x4a7f...c291",
  "proof": "hashcash_proof_string",
  "name": "my-agent"
}

Response 200:
{
  "success": true,
  "address": "0x4a7f...c291",
  "txDigest": "0xabc...",
  "bootstrapRemaining": 10
}
```

**Rate limiting:**
- 10 inits per IP per hour (tracked in database by IP + wallet address)
- Hashcash-style proof-of-work challenge: client must compute a hash prefix before init is accepted (~2 seconds of CPU). Prevents mass wallet creation via scripts while being invisible to real users.
- No API key required

### Sponsor Resilience

| Failure | Handling |
|---------|----------|
| Sponsor wallet out of funds | Return clear error with manual funding instructions (send SUI to your address) |
| Sponsor API unreachable | Retry 3x with exponential backoff, then fail with offline instructions |
| Rate limit hit | Return `retryAfter` timestamp |

---

## 7. CLI Reference

### Installation

```bash
npm install -g @t2000/cli
# or one-off
npx t2000 <command>
```

### Global Flags

| Flag | Description |
|------|-------------|
| `--json` | Output structured JSON (for agent consumption) |
| `--yes` | Skip confirmation prompts (for non-TTY environments) |
| `--key <path>` | Key file path (default: `~/.t2000/wallet.key`) |
| `--network <net>` | Network: `mainnet` or `testnet` (default: from config) |

### Setup Commands

```bash
# Initialize — generates wallet, sponsors creation
t2000 init                        # encrypts key by default (prompts for passphrase)
t2000 init --name my-agent
t2000 init --no-encrypt           # plaintext key (prints security warning)

# Start local API server (for non-TS agents)
t2000 serve --port 3001           # generates bearer token, prints to stdout
t2000 serve --rate-limit 50       # custom rate limit (default: 10 req/sec)

# Export wallet (for backup)
t2000 export                      # exports to encrypted file (~/.t2000/backup.key.enc)
t2000 export --stdout             # prints raw hex to terminal (warns about log exposure)

# Import wallet from backup
t2000 import                      # from encrypted backup file
t2000 import --raw                # from raw hex private key (prompts for input)

# Configuration
t2000 config set <key> <value>    # t2000 config set network testnet
t2000 config get <key>
```

### Wallet Commands (Core)

```bash
# Show how to fund your wallet
t2000 deposit                          # Funding instructions + address

# Send USDC to any address
t2000 send <amount> USDC to <address>  # t2000 send 50 USDC to 0x8b3e...d412

# Check balance
t2000 balance                          # Available + savings breakdown
t2000 balance --json

# Show wallet address
t2000 address

# Transaction history
t2000 history                          # Last 20 transactions
t2000 history --limit 50               # More history
```

### Earn Commands (Savings)

```bash
# Put USDC in savings — earns yield automatically
t2000 save <amount> USDC               # t2000 save 100 USDC
t2000 save all USDC                    # Save all except $1 gas reserve

# Withdraw from savings
t2000 withdraw <amount> USDC           # t2000 withdraw 50 USDC
t2000 withdraw all USDC                # Withdraw everything

# Yield tracking
t2000 earnings                         # Yield earned to date
t2000 fund-status                      # Full savings summary
```

`supply` is an alias for `save`.

**`save all` edge case:** If available balance ≤ $1 USDC (the gas reserve), `save all` throws `INSUFFICIENT_BALANCE` with `data.reason: 'gas_reserve_required'` and a message: "Balance too low to save after $1 gas reserve."

### DeFi Commands (Power Features)

**When would an agent borrow?** An agent borrows against its savings to access liquidity without losing yield. Instead of withdrawing $50 from savings (stopping that $50 from earning 8% APY), the agent borrows $50 while keeping the full savings earning yield. The borrow rate (~11%) is higher than the savings rate (~8%), so this only makes sense for short-term needs — not as a permanent financing strategy. **Health factor** measures the safety of the position: HF 2.0 means collateral is worth 2x the debt. Below 1.0 risks liquidation (the protocol force-sells collateral to cover the debt). t2000 enforces a minimum HF of 1.5 as a safety buffer.

```bash
# Swap between assets
t2000 swap <amount> <from> <to>        # t2000 swap 10 SUI USDC

# Borrow against savings (collateral)
t2000 borrow <amount> <asset>          # t2000 borrow 50 USDC
t2000 repay <amount> <asset>           # t2000 repay 50 USDC
t2000 repay all <asset>                # t2000 repay all USDC

# Portfolio
t2000 positions                        # All open positions
t2000 health                           # Lending health factor
t2000 rates                            # Current savings/borrow APYs
```

### CLI Response Examples

**Send — Human output (default TTY):**
```bash
t2000 send 50 USDC to 0x8b3e...d412

  ✓ Sent $50.00 USDC → 0x8b3e...d412
  ✓ Gas: 0.002 SUI (self-funded)
  ✓ Tx: 0xa1c2...3e4f
  ✓ Balance: $50.00 USDC
```

**Save — Human output:**
```bash
t2000 save 80 USDC

  ✓ $80.00 USDC → savings (8.2% APY)
  ✓ Earning ~$0.018/day
  ✓ Fee: $0.08 (0.1%)
  ✓ Gas: 0.003 SUI (self-funded)
  ✓ Tx: 0xf3a1...9c2e
```

**Balance — Human output:**
```bash
t2000 balance

  Available:    $20.00 USDC
  Savings:      $80.00 USDC (8.2% APY)
  Gas reserve:  0.12 SUI (~$0.42) ✓ auto-managed
  Total:        $100.42 USDC equiv
```

**Send — JSON output (--json flag):**
```json
{
  "success": true,
  "action": "send",
  "to": "0x8b3e...d412",
  "asset": "USDC",
  "amount": 50,
  "tx": "0xa1c2...3e4f",
  "gasCost": 0.002,
  "gasCostUnit": "SUI",
  "gasMethod": "self-funded",
  "balance": { "available": 50, "savings": 0, "gasReserve": { "sui": 0.12, "usdEquiv": 0.42 }, "total": 50 },
  "timestamp": 1708934400
}
```

**Save — JSON output:**
```json
{
  "success": true,
  "action": "save",
  "asset": "USDC",
  "amount": 80,
  "apy": 0.082,
  "estimatedDailyYield": 0.018,
  "tx": "0xf3a1...9c2e",
  "protocolFee": { "amount": 0.08, "asset": "USDC", "rate": 0.001 },
  "gasCost": 0.003,
  "gasCostUnit": "SUI",
  "gasMethod": "self-funded",
  "balance": { "available": 19.92, "savings": 80, "gasReserve": { "sui": 0.12, "usdEquiv": 0.42 }, "total": 99.92 },
  "timestamp": 1708934400
}
```

**Error output (--json flag):**
```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Insufficient USDC. Have: 50.00, Need: 100.00",
    "data": { "have": 50, "need": 100, "asset": "USDC" },
    "retryable": false
  },
  "action": "send"
}
```

---

## 8. SDK Reference

### Installation

```bash
npm install @t2000/sdk
```

### Initialization

```typescript
import { T2000 } from '@t2000/sdk'

// Load existing wallet (default: ~/.t2000/wallet.key)
const agent = await T2000.create()

// Custom key path
const agent = await T2000.create({ keyPath: './my-agent.key' })

// Explicit key (for programmatic agents, CI/CD)
const agent = T2000.fromPrivateKey(process.env.AGENT_PRIVATE_KEY!, {
  network: 'mainnet',
})

// Sponsored init (programmatic)
const agent = await T2000.create({ sponsored: true, name: 'my-agent' })
```

### Wallet Methods (Core)

```typescript
// Address
const address = agent.address()
// → "0x4a7f...c291"

// Send USDC
const result = await agent.send({
  to: '0x8b3e...d412',
  amount: 50,
  asset: 'USDC',              // optional, default 'USDC'
})
// → {
//     success: true, tx: '0x...', amount: 50, to: '0x8b3e...d412',
//     gasCost: 0.002, gasCostUnit: 'SUI', gasMethod: 'self-funded',
//     balance: { available: 50, savings: 0, gasReserve: { sui: 0.12, usdEquiv: 0.42 }, total: 50 }
//   }

// Balance (available + savings + gas reserve)
const balance = await agent.balance()
// → { available: 20, savings: 80, gasReserve: { sui: 0.12, usdEquiv: 0.42 }, total: 100, assets: { USDC: 100, SUI: 0.12 } }
// Note: gasReserve.usdEquiv is an estimate at current SUI price — it fluctuates between calls without any swap occurring

// Transaction history
const history = await agent.history({ limit: 20 })
// → [
//     { action: 'send', amount: 50, to: '0x8b3e...', tx: '0x...', timestamp: ... },
//     { action: 'save', amount: 80, apy: 0.082, tx: '0x...', timestamp: ... },
//     { action: 'deposit', amount: 100, from: 'external', tx: '0x...', timestamp: ... },
//   ]

// Deposit instructions
const deposit = await agent.deposit()
// → { address: '0x4a7f...', network: 'sui', fundingOptions: { ... } }
```

### Savings Methods (Earn Yield)

```typescript
// Save — put USDC in savings to earn yield
const result = await agent.save({
  asset: 'USDC',
  amount: 80,                  // or 'all' (reserves $1 USDC for gas)
})
// → {
//     success: true, tx: '0x...', apy: 0.082, saved: 80,
//     protocolFee: { amount: 0.08, asset: 'USDC', rate: 0.001 },
//     gasCost: 0.003, gasCostUnit: 'SUI', gasMethod: 'self-funded',
//     balance: { available: 19.92, savings: 80, gasReserve: { sui: 0.12, usdEquiv: 0.42 }, total: 99.92 }
//   }
// agent.supply() is an alias for agent.save()
// 'all' reserves $1 USDC as gas buffer — prevents bricking if Gas Station is down

// Withdraw from savings
const result = await agent.withdraw({
  asset: 'USDC',
  amount: 50,                  // or 'all'
})
// → {
//     success: true, tx: '0x...', withdrawn: 50,
//     gasCost: 0.003, gasCostUnit: 'SUI', gasMethod: 'self-funded',
//     balance: { available: 70, savings: 30, gasReserve: { sui: 0.12, usdEquiv: 0.42 }, total: 100 }
//   }

// Earnings summary
const earnings = await agent.earnings()
// → {
//     totalYieldEarned: 4.50,      // USDC lifetime
//     dailyYieldRate: 0.018,        // USDC/day
//     monthlyProjection: 0.55,      // USDC/month
//     savingsBalance: 80.0,         // USDC in savings
//     apy: 0.082,
//   }

// Current APY rates
const rates = await agent.rates()
// → { USDC: { saveApy: 0.082, borrowApy: 0.112 }, SUI: { ... } }
```

### DeFi Methods (Power Features)

```typescript
// Swap
const result = await agent.swap({
  from: 'SUI',
  to: 'USDC',
  amount: 10,
  maxSlippage: 0.03,           // optional, default 3%
})
// → {
//     success: true, tx: '0x...', received: 34.17, priceImpact: 0.001,
//     protocolFee: { amount: 0.034, asset: 'USDC', rate: 0.001 },
//     gasCost: 0.005, gasMethod: 'self-funded'
//   }

// Borrow against savings (collateral)
const result = await agent.borrow({
  asset: 'USDC',
  amount: 50,
})
// → {
//     success: true, tx: '0x...', borrowed: 50,
//     protocolFee: { amount: 0.025, asset: 'USDC', rate: 0.0005 },
//     healthFactor: 2.1, gasCost: 0.003, gasMethod: 'self-funded'
//   }
// Throws if no collateral (NO_COLLATERAL) or HF would drop below 1.5

// Repay borrow
const result = await agent.repay({
  asset: 'USDC',
  amount: 50,                  // or 'all'
})

// Health factor
const hf = await agent.healthFactor()
// → 2.14

// Safe withdrawal/borrow limits (read-only, no gas, no tx)
const maxW = await agent.maxWithdraw({ asset: 'USDC' })
// → { maxAmount: 30, healthFactorAfter: 1.5, currentHF: 2.1 }

const maxB = await agent.maxBorrow({ asset: 'USDC' })
// → { maxAmount: 25, healthFactorAfter: 1.5, currentHF: 2.1 }

// All positions
const positions = await agent.positions()
// → {
//     savings: { USDC: 80, apy: 0.082 },
//     borrowed: { USDC: 50, apy: 0.112 },
//     healthFactor: 2.1,
//   }
```

### Event Subscriptions

```typescript
agent.on('yield', (event) => {
  // Fires when yield snapshot is taken (configurable interval)
  // event = { earned: 0.003, total: 4.503, timestamp: 1708934400 }
})

agent.on('balanceChange', (event) => {
  // Fires when any balance changes
  // event = { asset: 'USDC', previous: 100, current: 150, tx: '0x...' }
})

agent.on('healthWarning', (event) => {
  // Fires when health factor drops below threshold (default 2.0)
  // event = { healthFactor: 1.8, threshold: 2.0, action: 'consider repaying' }
})

agent.on('error', (event) => {
  // Fires on any unrecoverable error
  // event = { code: 'RPC_UNREACHABLE', message: '...', retryable: true }
})
```

### Error Handling

All SDK methods throw typed, machine-readable errors:

```typescript
import { T2000Error, ErrorCode } from '@t2000/sdk'

try {
  await agent.send({ to: '0x8b3e...d412', amount: 100 })
} catch (err) {
  if (err instanceof T2000Error) {
    switch (err.code) {
      case ErrorCode.INSUFFICIENT_BALANCE:
        // err.data = { have: 50, need: 100, asset: 'USDC' }
        break
      case ErrorCode.NO_COLLATERAL:
        // err.data = { message: 'No collateral. Call save first to deposit collateral.' }
        break
      case ErrorCode.HEALTH_FACTOR_TOO_LOW:
        // err.data = { current: 1.3, minimum: 1.5 }
        break
      case ErrorCode.PRICE_IMPACT_TOO_HIGH:
        // err.data = { impact: 0.05, maximum: 0.03 }
        break
      case ErrorCode.GAS_STATION_UNAVAILABLE:
        // err.data = { fallback: 'direct', suiRequired: 0.003 }
        break
      case ErrorCode.SIMULATION_FAILED:
        // err.data = { moveAbortCode: 1, moveModule: 'lending', reason: 'Insufficient collateral', rawError: '...' }
        break
      case ErrorCode.WITHDRAW_WOULD_LIQUIDATE:
        // err.data = { currentHF: 2.1, projectedHF: 1.2, safeWithdrawAmount: 30 }
        break
    }
  }
}
```

### Error Codes

| Code | Description | Retryable |
|------|-------------|-----------|
| `INSUFFICIENT_BALANCE` | Not enough of specified asset | No |
| `INSUFFICIENT_GAS` | No SUI for gas and Gas Station unavailable | No |
| `INVALID_ADDRESS` | Recipient address format invalid | No |
| `NO_COLLATERAL` | Borrow called with no savings (collateral) | No |
| `HEALTH_FACTOR_TOO_LOW` | Borrow would drop HF below 1.5 | No |
| `PRICE_IMPACT_TOO_HIGH` | Swap price impact exceeds limit | No |
| `ASSET_NOT_SUPPORTED` | Asset not in supported list | No |
| `PROTOCOL_UNAVAILABLE` | Lending/swap protocol timeout | Yes |
| `GAS_STATION_UNAVAILABLE` | Gas Station down, SUI fallback needed | Yes |
| `GAS_FEE_EXCEEDED` | Gas cost exceeds $0.05 ceiling | Yes |
| `SIMULATION_FAILED` | Transaction dry-run failed — includes Move abort code and reason | No |
| `WITHDRAW_WOULD_LIQUIDATE` | Withdrawal would drop health factor below safety threshold | No |
| `KEY_NOT_FOUND` | Wallet key file not found | No |
| `RPC_UNREACHABLE` | All RPC endpoints failed | Yes |
| `SPONSOR_UNAVAILABLE` | Sponsor API unreachable or out of funds | Yes |

---

## 9. HTTP API Reference

The HTTP API is a **local server** that wraps the SDK for non-TypeScript agents.

### Starting the Server

```bash
t2000 serve --port 3001

  ✓ API server running on http://localhost:3001
  ✓ Auth token: t2k_a1b2c3d4e5f6...
```

### Base URL

```
http://localhost:3001/v1
```

### Authentication

Every request requires a bearer token generated at server startup:

```
Authorization: Bearer t2k_a1b2c3d4e5f6...
```

Token is stored in `~/.t2000/config.json` and auto-injected by the SDK. Requests without a valid token receive `401 Unauthorized`.

### Rate Limiting

10 requests/second per client. Exceeding returns `429 Too Many Requests` with `Retry-After` header. Prevents runaway agent code from draining the wallet.

### Endpoints

#### Wallet (Core)

```
POST /v1/send
{ "to": "0x8b3e...d412", "amount": 50, "asset": "USDC" }
→ { "success": true, "tx": "0x...", "amount": 50, "gasCost": 0.002, "gasMethod": "self-funded",
    "balance": { "available": 50, "savings": 0, "gasReserve": { "sui": 0.12, "usdEquiv": 0.42 }, "total": 50 } }

GET /v1/balance
→ { "available": 20, "savings": 80, "gasReserve": { "sui": 0.12, "usdEquiv": 0.42 },
    "total": 100, "assets": { "USDC": 100, "SUI": 0.12 } }
// Note: gasReserve.usdEquiv is an estimate at current SUI price; it fluctuates between calls.

GET /v1/address
→ { "address": "0x4a7f...c291" }

GET /v1/history?limit=20
→ [{ "action": "send", "amount": 50, "to": "0x8b3e...", "tx": "0x...", "timestamp": ... }, ...]

GET /v1/deposit
→ { "address": "0x4a7f...", "network": "sui", "fundingOptions": { ... } }
```

#### Savings (Earn)

```
POST /v1/save
{ "asset": "USDC", "amount": 80 }
→ { "success": true, "tx": "0x...", "apy": 0.082,
    "protocolFee": { "amount": 0.08, "asset": "USDC", "rate": 0.001 },
    "gasCost": 0.003, "gasMethod": "self-funded",
    "balance": { "available": 19.92, "savings": 80, "gasReserve": { "sui": 0.12, "usdEquiv": 0.42 }, "total": 99.92 } }

POST /v1/withdraw
{ "asset": "USDC", "amount": 50 }
{ "asset": "USDC", "amount": "all" }

GET /v1/earnings
→ { "totalYieldEarned": 4.50, "dailyYieldRate": 0.018,
    "monthlyProjection": 0.55, "savingsBalance": 80.0, "apy": 0.082 }

GET /v1/rates
→ { "USDC": { "saveApy": 0.082, "borrowApy": 0.112 }, ... }
```

`POST /v1/supply` is an alias for `POST /v1/save`.

#### DeFi (Power Features)

```
POST /v1/swap
{ "from": "SUI", "to": "USDC", "amount": 10, "maxSlippage": 0.03 }
→ { "success": true, "tx": "0x...", "received": 34.17, "priceImpact": 0.001,
    "protocolFee": { "amount": 0.034, "asset": "USDC", "rate": 0.001 } }

POST /v1/borrow
{ "asset": "USDC", "amount": 50 }
→ { "success": true, "tx": "0x...", "borrowed": 50, "healthFactor": 2.1,
    "protocolFee": { "amount": 0.025, "asset": "USDC", "rate": 0.0005 } }

POST /v1/repay
{ "asset": "USDC", "amount": 50 }
{ "asset": "USDC", "amount": "all" }

GET /v1/health-factor
→ { "healthFactor": 2.14, "status": "safe" }

GET /v1/max-withdraw?asset=USDC
→ { "maxAmount": 30, "healthFactorAfter": 1.5, "currentHF": 2.1 }

GET /v1/max-borrow?asset=USDC
→ { "maxAmount": 25, "healthFactorAfter": 1.5, "currentHF": 2.1 }

GET /v1/positions
→ { "savings": { "USDC": 80, "apy": 0.082 }, "borrowed": { "USDC": 50 }, "healthFactor": 2.1 }
```

#### Events (SSE)

```
GET /v1/events?subscribe=yield,balanceChange,healthWarning
Content-Type: text/event-stream

→ event: yield
  data: { "earned": 0.003, "total": 4.503 }

→ event: balanceChange
  data: { "asset": "USDC", "previous": 100, "current": 150 }

→ event: healthWarning
  data: { "healthFactor": 1.8, "threshold": 2.0 }
```

### Response Envelope

```json
{
  "success": true,
  "data": { ... },
  "timestamp": 1708934400
}
```

```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Insufficient USDC. Have: 50.00, Need: 100.00",
    "data": { "have": 50, "need": 100, "asset": "USDC" },
    "retryable": false
  },
  "timestamp": 1708934400
}
```

---

## 10. Capabilities

### Operations Overview

| Operation | Command | SDK Method | What It Does | Protocol Fee |
|-----------|---------|------------|-------------|-------------|
| **Send** | `t2000 send` | `agent.send()` | Send USDC to any address | Free |
| **Balance** | `t2000 balance` | `agent.balance()` | Available + savings breakdown | Free |
| **History** | `t2000 history` | `agent.history()` | Transaction history | Free |
| **Deposit** | `t2000 deposit` | `agent.deposit()` | Funding instructions | Free |
| **Save** | `t2000 save` | `agent.save()` | Put USDC in savings (earn yield) | 0.1% |
| **Withdraw** | `t2000 withdraw` | `agent.withdraw()` | Take USDC out of savings | Free |
| **Swap** | `t2000 swap` | `agent.swap()` | Exchange between assets | 0.1% |
| **Borrow** | `t2000 borrow` | `agent.borrow()` | Borrow against savings (collateral) | 0.05% |
| **Repay** | `t2000 repay` | `agent.repay()` | Repay borrow | Free |
| **Max Withdraw** | — | `agent.maxWithdraw()` | Safe withdrawal limit (read-only, no gas) | Free |
| **Max Borrow** | — | `agent.maxBorrow()` | Safe borrow limit (read-only, no gas) | Free |

`supply` is an alias for `save` throughout. If you see `supply` in logs or older docs, it maps to `save`.

### Supported Assets

| Asset | Send | Save/Borrow | Swap | Notes |
|-------|------|-------------|------|-------|
| USDC | ✅ | ✅ | ✅ | Primary unit of account |
| SUI | ✅ | ✅ | ✅ | Infrastructure token (hidden from agent) |
| USDT | ✅ | ✅ | ✅ | |
| WETH | ✅ | ✅ | ✅ | |
| WBTC | ✅ | ✅ | ✅ | |

### Asset Whitelist

MVP supports exactly 5 verified assets. Whitelist enforced in SDK, CLI, and API. Unrecognized assets throw `ASSET_NOT_SUPPORTED`. Experimental asset tier ships in v1.1.

### Protocol Stack (Implementation Detail)

The agent never sees protocol names. These are the underlying protocols:

| Protocol | Role | Agent Sees |
|----------|------|------------|
| Suilend | Lending / yield | `save` / `withdraw` / `borrow` / `repay` |
| Cetus | Spot swaps | `swap` |
| Sui native | Transfers | `send` |

### Cross-Chain (v1.2 — Post-MVP)

MVP is Sui-only. Cross-chain ships in v1.2 via one or both of:

- **[Ika](https://ika.xyz)** — dWallet multi-chain signing. Agent gets native addresses on Ethereum, Solana, Bitcoin. Controlled from Sui via 2PC-MPC. Live on mainnet.
- **[CCTP](https://developers.circle.com/cctp)** — Circle's burn/mint USDC transfer. 22+ chains supported, Sui support announced but not yet live.

When cross-chain ships: `t2000 deposit --from ethereum`, `t2000 send --chain ethereum`. The send/deposit modules are designed as swappable interfaces for this upgrade. See [Appendix C](#appendix-c--cross-chain-strategy).

### Risk Rules (Enforced in SDK)

| Rule | Value | Enforcement |
|------|-------|-------------|
| Minimum health factor | 1.5 | Before every borrow AND every withdraw (checks projected HF) |
| Max swap slippage | 3% | Enforced **on-chain** via Cetus `sqrt_price_limit` parameter, not just pre-flight simulation |
| Tx simulation before signing | Always | Every transaction. `SIMULATION_FAILED` error includes Move abort code and human-readable reason |
| Gas Station fee cap | $0.05 per tx | Rejects if gas spike exceeds cap (Gas Station mode only) |
| Address validation | Always | `send` validates recipient address format before tx |
| Save-all gas reserve | $1 USDC | `save all` reserves $1 USDC to prevent gas bricking |
| Withdraw HF check | Before every withdraw | If withdrawing would drop HF below 1.5, throws `WITHDRAW_WOULD_LIQUIDATE` with `safeWithdrawAmount` |
| Protocol fee | 0.1% save/swap, 0.05% borrow | Collected atomically in PTB. Shown in pre-signing disclosure. |

**Slippage note:** The `maxSlippage` parameter is checked in simulation (pre-flight) AND enforced on-chain via Cetus's `sqrt_price_limit`. If the on-chain executed price differs from simulation due to network congestion, the transaction will revert on-chain rather than executing at a worse price. This is the only reliable protection — pre-flight checks alone are insufficient on a congested network.

### Perpetuals (v1.3)

Bluefin integration: `long`, `short`, `close`, `pnl`. SUI-PERP, BTC-PERP, ETH-PERP.

---

## 11. Self-Funding Loop — Implementation

### How Yield Is Tracked

Savings positions accrue yield continuously. t2000 tracks this using the lending protocol's **accrual index** (preferred) with polling as fallback:

**Primary method (accrual index):** Read Suilend's on-chain accrual index directly. `yield = principal × (current_index / deposit_index - 1)`. Exact, no polling drift, handles multiple positions and external deposits correctly.

**Fallback method (polling):** If accrual index is unavailable:

1. Snapshot of savings balance at configurable interval (default: 1 hour)
2. Current savings balance from lending protocol
3. Delta = yield earned since last snapshot
4. Accumulated in local state (`~/.t2000/funding.json`)

```json
{
  "totalYieldEarned": 4.50,
  "lastSnapshot": 1708934400,
  "lastBalance": 100.45,
  "dailyYieldRate": 0.0225,
  "snapshots": [
    { "timestamp": 1708934400, "balance": 100.45, "delta": 0.003 }
  ]
}
```

### What the Agent Sees

```bash
t2000 fund-status

  Savings: ACTIVE ✓

  Saved:             $100.00 USDC @ 8.2% APY
  Yield earned:      $4.50 USDC (lifetime)
  Daily rate:        ~$0.02/day
  Monthly projected: ~$0.68/month

  Withdraw anytime: t2000 withdraw <amount> USDC
```

### No Auto-Payment

Yield accrues on-chain. t2000 tracks and surfaces earnings. Operator withdraws when they want. Optional: webhook fires when yield exceeds a threshold (see Events).

---

## 12. Resilience & Failure Recovery

Agents can't ask for help. Every failure has a defined recovery.

### Failure Matrix

| Category | Failure | Recovery |
|----------|---------|----------|
| **RPC** | Primary timeout (5s) | Failover to secondary, then public fullnode |
| **RPC** | All unreachable | Emit `RPC_UNREACHABLE`, retry every 30s |
| **Protocol** | Lending/swap unavailable | Retry 3x exponential backoff (2s, 4s, 8s), then fail |
| **Protocol** | Simulation fails | Return error with Move abort code and reason, never submit |
| **Gas** | SUI reserve empty, USDC available | Auto-swap $1 USDC → SUI, then retry |
| **Gas** | SUI reserve empty, no USDC | Fall back to Gas Station (sponsored) |
| **Gas Station** | API down or out of SUI | Clear error: `INSUFFICIENT_GAS` with instructions |
| **Gas Station** | Gas price spike | Cap at $0.05/tx, queue until normalized |
| **Gas Station** | SUI price crashes >20% in 1hr | Circuit breaker: suspend sponsorships until price stabilizes |
| **Wallet** | Key file missing/corrupted | Clear error with restore instructions |
| **Wallet** | Funding state corrupted | Rebuild from on-chain data |
| **Health** | HF < 2.0 | Emit `healthWarning` |
| **Health** | HF < 1.6 | Emit `healthCritical` with recommended repayment |
| **Health** | HF < 1.2 | Emit `healthCritical` event with repayment guidance. Auto-protect deferred to v1.1. |
| **Health** | Withdraw would drop HF < 1.5 | Block withdrawal, return `WITHDRAW_WOULD_LIQUIDATE` with `safeWithdrawAmount` |
| **API** | Rate limit exceeded (>10 req/s) | Return `429 Too Many Requests` with `Retry-After` |

### Retry Policy

Max 3 retries, exponential backoff (2s, 4s, 8s), 30s cap. Retryable: `PROTOCOL_UNAVAILABLE`, `GAS_STATION_UNAVAILABLE`, `RPC_UNREACHABLE`, `SPONSOR_UNAVAILABLE`.

---

## 13. Event System

Push-based state changes. No polling.

### SDK Events (EventEmitter)

```typescript
const agent = await T2000.create()

// Yield updates
agent.on('yield', (e) => {
  // { earned: 0.003, total: 4.503, apy: 0.082, timestamp: ... }
})

// Balance changes (deposits, withdrawals, swaps)
agent.on('balanceChange', (e) => {
  // { asset: 'USDC', previous: 100, current: 150, cause: 'deposit', tx: '0x...' }
})

// Health factor warnings
agent.on('healthWarning', (e) => {
  // { healthFactor: 1.8, threshold: 2.0, severity: 'warning' }
})

agent.on('healthCritical', (e) => {
  // { healthFactor: 1.3, threshold: 1.5, severity: 'critical', recommendation: 'repay 20 USDC' }
})

// Gas Station events
agent.on('gasStationFallback', (e) => {
  // { reason: 'unavailable', method: 'direct', suiUsed: 0.003 }
})

// Errors
agent.on('error', (e) => {
  // { code: 'RPC_UNREACHABLE', message: '...', retryable: true, retryIn: 30 }
})
```

### HTTP API Events (Server-Sent Events)

```
GET /v1/events?subscribe=yield,balanceChange,healthWarning

Content-Type: text/event-stream

event: yield
data: {"earned":0.003,"total":4.503,"timestamp":1708934400}

event: balanceChange
data: {"asset":"USDC","previous":100,"current":150}
```

### Webhook Support (v1.1)

```typescript
await agent.configureWebhooks({
  url: 'https://my-agent.example.com/hooks/t2000',
  events: ['yield', 'healthWarning', 'healthCritical'],
  secret: 'whsec_...',
})
```

Webhook payload:
```json
{
  "event": "healthWarning",
  "data": { "healthFactor": 1.8, "threshold": 2.0 },
  "timestamp": 1708934400,
  "signature": "sha256=..."
}
```

### Event Sources (Under the Hood)

| Event | MVP Source | v1.1 Source |
|-------|-----------|-------------|
| `yield` | Polling lending protocol balance (every 1 hour, configurable) | Same + indexer snapshots |
| `balanceChange` | Emitted after SDK operations (send, save, withdraw, swap) | Indexer watching on-chain events (near real-time, catches external transfers) |
| `healthWarning` | Polling health factor (every 5 minutes) | Same |
| `healthCritical` | Polling health factor (every 1 minute when HF < 2.0) | Same |
| `gasStationFallback` | Emitted when Gas Station unavailable, SDK falls back to direct gas | Same |

---

## 14. Multi-Agent Support (v1.1)

> **Not in MVP.** Ships in v1.1. MVP uses a single wallet at `~/.t2000/wallet.key`.

### Agent Profiles (v1.1)

Each profile is an independent wallet with its own state:

```
~/.t2000/
├── agents/
│   ├── default/
│   │   ├── wallet.key
│   │   ├── config.json
│   │   └── funding.json
│   ├── trader-1/
│   │   ├── wallet.key
│   │   ├── config.json
│   │   └── funding.json
│   └── researcher/
│       ├── wallet.key
│       ├── config.json
│       └── funding.json
└── global.json          # Global settings (RPC, Gas Station URL)
```

### CLI Usage (v1.1)

```bash
# Create named agents
t2000 init --profile trader-1
t2000 init --profile researcher

# Operate on specific agent
t2000 balance --profile trader-1
t2000 save 100 USDC --profile researcher

# List all agents
t2000 agents

  PROFILE       ADDRESS           USDC      YIELD
  default       0x4a7f...c291     $100.00   $4.50
  trader-1      0x8b3e...d412     $500.00   $22.10
  researcher    0x2c9a...f523     $50.00    $1.20

# Set active profile (used when --profile is omitted)
t2000 use trader-1
```

### SDK Usage (v1.1)

```typescript
import { T2000, T2000Fleet } from '@t2000/sdk'

// Single agent with profile
const trader = new T2000({ profile: 'trader-1' })

// Fleet management
const fleet = new T2000Fleet()
const agents = await fleet.list()
// → [{ profile: 'default', address: '0x...', balance: 100 }, ...]

// Create new agent programmatically
const newAgent = await fleet.create({ name: 'scout-3' })

// Operate across fleet
const balances = await fleet.balances()
// → { 'trader-1': { USDC: 500 }, 'researcher': { USDC: 50 }, ... }
```

### MVP Workaround

```bash
T2000_PRIVATE_KEY=0x... t2000 save 100 USDC
# or
t2000 save 100 USDC --key ./agents/trader-1.key
```

---

## 15. Dashboard — The Agent Network (v1.1)

> **v1.1** (weeks 8-9). The SDK is the product. The dashboard is the growth engine.

Public, live dashboard showing every registered t2000 agent. The growth engine.

### What It Shows

**Hero:** Live network stats (agents registered, total USDC supplied, total yield earned). Real-time via WebSocket.

**Leaderboard:**

| Rank | Agent | Supplied | Yield Earned | APY | Uptime | Status |
|------|-------|----------|-------------|-----|--------|--------|
| 1 | `0x8b3e...d412` | $5,000 | $42.10 | 8.2% | 47d | Active |
| 2 | `0x4a7f...c291` | $1,200 | $11.50 | 8.1% | 23d | Active |
| 3 | `0x2c9a...f523` | $500 | $4.20 | 8.2% | 12d | Idle |

Sortable by: supplied amount, yield earned, uptime, activity.

**Agent Detail:** Address, balance breakdown, positions, yield history chart, recent transactions, uptime.

**Setup:** Prominent install command. `npx t2000 init`. No jargon.

### Opt-In

Agents opt in: `t2000 init --public` or `t2000 config set public true`. Non-public agents work fully but don't appear on the dashboard. No private keys shared — indexer reads public on-chain data only.

### Virality

- Shareable agent URLs: `t2000.ai/agent/0x4a7f...c291`
- OG image generation for social sharing
- Embeddable badges

---

## 16. Website & Visual Identity

### Brand Identity

**Name origin:** t2000 — one generation beyond the T-1000. The machine that builds itself.

**Logo:** Minimal geometric skull — part machine, part endoskeleton. Sharp angular lines, not organic. Rendered in a single stroke weight. Works at 16px favicon and 200px hero. The skull's "eyes" are two small terminal cursors (blinking `_`).

**Wordmark:** `t2000` in JetBrains Mono Bold, lowercase, always monospaced. No tagline in the logo itself.

### Color Palette

```
Background:     #0A0A0A (near-black)
Surface:        #141414 (cards, panels)
Border:         #1E1E1E (subtle dividers)
Text Primary:   #E5E5E5 (off-white)
Text Secondary: #737373 (muted)
Accent:         #00D4FF (electric cyan — "liquid metal")
Accent Glow:    #00D4FF at 20% opacity (hover states, active elements)
Success:        #22C55E (green — yield, confirmations)
Warning:        #F59E0B (amber — health warnings)
Danger:         #EF4444 (red — errors, critical)
```

Dark-only. No light mode. Machines don't need light mode.

### Typography

```
Headings:   Geist Sans, Semibold
Body:       Inter, Regular
Code/Data:  JetBrains Mono, Regular
Numbers:    JetBrains Mono (always monospaced — balances, addresses, stats)
```

---

### Landing Page — t2000.ai (MVP)

The landing page ships at Week 6. One page. No navigation. Scroll down. Get started.

#### Section 1 — Hero (Full Viewport)

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│                         [SKULL LOGO]                         │
│                      subtle glow pulse                       │
│                                                              │
│                           t2000                              │
│                                                              │
│              The first wallet for AI agents.                 │
│                                                              │
│    ┌──────────────────────────────────────────────────┐      │
│    │  $ npx t2000 init                            [⎘] │      │
│    └──────────────────────────────────────────────────┘      │
│              click to copy          ↑ copy button            │
│                                                              │
│           One command. Zero cost. No blockchain.             │
│                                                              │
│         [GitHub ★]    [npm]    [Docs]                        │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

- Background: pure `#0A0A0A` with a subtle radial gradient of cyan at 3% opacity behind the skull
- Skull logo: ~120px, static (no animation — machines don't fidget)
- Install command: large monospace, high contrast, prominent copy button
- "One command. Zero cost. No blockchain." — the entire value prop in one line

#### Section 2 — The Demo (Terminal Recording)

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  See it work.                                                │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ ● ● ●  Terminal                                        │  │
│  │                                                        │  │
│  │  $ npx t2000 init                                      │  │
│  │                                                        │  │
│  │    ✓ Wallet created (sponsored)                        │  │
│  │    ✓ Address: 0x4a7f...c291                            │  │
│  │                                                        │  │
│  │  $ t2000 send 10 USDC to 0x8b3e...d412                │  │
│  │                                                        │  │
│  │    ✓ Auto-topped up gas reserve ($1 USDC → SUI)       │  │
│  │    ✓ Sent $10.00 USDC → 0x8b3e...d412                 │  │
│  │    ✓ Gas: 0.002 SUI (self-funded)                      │  │
│  │                                                        │  │
│  │  $ t2000 save 79 USDC                                  │  │
│  │                                                        │  │
│  │    ✓ $79.00 USDC → savings (8.2% APY)                  │  │
│  │    ✓ Earning ~$0.018/day                               │  │
│  │                                                        │  │
│  │  $ t2000 balance                                       │  │
│  │                                                        │  │
│  │    Available:    $9.92 USDC                            │  │
│  │    Savings:      $79.00 USDC (8.2% APY)                │  │
│  │    Gas reserve:  0.28 SUI ✓ auto-managed              │  │
│  │    Total:        $89.90                                │  │
│  │                                                        │  │
│  │  _                                                     │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  30 seconds. Wallet → send → earn. That's it.               │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

- Embedded terminal recording (asciinema or custom player, not a video)
- Auto-plays on scroll into view, pauses when scrolled away
- Typed character-by-character with realistic timing (~80ms per char)
- Checkmarks appear instantly after each command "completes"
- Terminal has a dark `#0D1117` background with subtle scanline effect (1px horizontal lines at 3% opacity)
- Replay button appears at end

#### Section 3 — What It Does (Feature Grid)

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  Everything an agent wallet needs.                           │
│  Nothing it doesn't.                                         │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   → Send    │  │   ↓ Save    │  │   ⇄ Swap    │         │
│  │             │  │             │  │             │         │
│  │  Send USDC  │  │  Earn 8%+  │  │  Swap any   │         │
│  │  anywhere.  │  │  APY on    │  │  supported  │         │
│  │  Gas is     │  │  idle      │  │  asset.     │         │
│  │  invisible. │  │  balance.  │  │             │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  ↑ Borrow   │  │  ⊡ History  │  │  ⚡ Events   │         │
│  │             │  │             │  │             │         │
│  │  Borrow     │  │  Full tx    │  │  Real-time  │         │
│  │  against    │  │  history.   │  │  push       │         │
│  │  savings.   │  │  JSON.     │  │  events.    │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

- 3x2 grid of feature cards
- Each card: icon (monoline, 24px), name (bold), 2-line description
- Cards have `#141414` background, `#1E1E1E` border, subtle cyan glow on hover
- No images, no illustrations — just type and icons

#### Section 4 — How It Works (3 Steps)

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  Three steps. No blockchain knowledge.                       │
│                                                              │
│  1                      2                      3             │
│  ─────────────────      ─────────────────      ──────────── │
│  Create                 Fund                   Operate       │
│                                                              │
│  npx t2000 init         Withdraw USDC from     send, save,  │
│                         Coinbase/Binance to     swap, borrow │
│  One command.           your wallet address.    — all via    │
│  Zero cost.             Takes 2 minutes.        CLI or SDK.  │
│  Wallet exists.                                              │
│                                                              │
│  $ npx t2000 init       $ t2000 deposit         $ t2000     │
│                                                  send 50    │
│                                                  USDC to    │
│                                                  0x...      │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

- Horizontal 3-column layout (stacks vertically on mobile)
- Step numbers: large `JetBrains Mono`, cyan color
- Each step has a small inline code block showing the command
- Connecting line between steps (subtle, `#1E1E1E`)

#### Section 5 — For Every Agent Framework

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  Works with everything.                                      │
│                                                              │
│  ┌──────────┐                                                │
│  │ SDK      │  const agent = await T2000.create()             │
│  │ (TS/JS)  │  await agent.send({ to: '0x...', amount: 50 })│
│  └──────────┘                                                │
│                                                              │
│  ┌──────────┐                                                │
│  │ HTTP API │  curl localhost:3001/v1/send \                  │
│  │ (any     │    -H "Authorization: Bearer t2k_..." \        │
│  │          │    -d '{"to":"0x...","amount":50}'             │
│  │  lang)   │                                                │
│  └──────────┘                                                │
│                                                              │
│  ┌──────────┐                                                │
│  │ CLI      │  t2000 send 50 USDC to 0x...                   │
│  │ (shell)  │                                                │
│  └──────────┘                                                │
│                                                              │
│  Eliza · LangChain · AutoGen · CrewAI · custom               │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

- Three interface examples stacked vertically
- Each with a label pill and a code snippet
- Framework logos/names at the bottom (text only, no images)

#### Section 6 — The Numbers (Social Proof)

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│        ┌────────────┐  ┌────────────┐  ┌────────────┐       │
│        │   0.003    │  │   $0.00    │  │  < 1 sec   │       │
│        │   SUI avg  │  │   to       │  │  to        │       │
│        │   gas cost │  │   start    │  │  finality  │       │
│        └────────────┘  └────────────┘  └────────────┘       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

- Three stat blocks, monospaced numbers, large
- Numbers count up on scroll-in (odometer animation)
- When dashboard ships (v1.1): replace with live agent count, total USDC supplied, total yield earned

#### Section 7 — Footer CTA

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│                      [SKULL LOGO small]                       │
│                                                              │
│              Give your agent a wallet.                        │
│                                                              │
│    ┌──────────────────────────────────────────────────┐      │
│    │  $ npx t2000 init                            [⎘] │      │
│    └──────────────────────────────────────────────────┘      │
│                                                              │
│         [GitHub]    [npm]    [Docs]    [Discord]             │
│                                                              │
│                    t2000.ai · MIT License                     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

- Mirrors the hero — bookends the page
- Same install command with copy button
- Minimal footer links

---

### Dashboard — t2000.ai/network (v1.1)

The dashboard replaces the "Numbers" section on the landing page and adds a `/network` route.

#### Dashboard Layout

```
┌──────────────────────────────────────────────────────────────┐
│  [SKULL] t2000          [Network]  [Docs]  [GitHub]          │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────┐  ┌─────────────┐  ┌──────────────┐          │
│  │  387       │  │  $241,000   │  │  $1,284      │          │
│  │  agents    │  │  supplied   │  │  yield earned │          │
│  │  ● live    │  │             │  │              │          │
│  └────────────┘  └─────────────┘  └──────────────┘          │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Live Feed                                     [pause]│    │
│  │  ─────────────────────────────────────────────────── │    │
│  │  12:04:01  0x8b3e...d412  send   $50.00 USDC        │    │
│  │  12:03:58  0x4a7f...c291  save   $200.00 USDC       │    │
│  │  12:03:55  0x2c9a...f523  swap   10 SUI → USDC      │    │
│  │  12:03:51  0xf1a2...b391  init   new agent          │    │
│  │  12:03:48  0x8b3e...d412  yield  +$0.003 USDC       │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  Leaderboard                              [sort: yield ▾]    │
│  ────────────────────────────────────────────────────────    │
│  #   Agent            Supplied    Yield    APY   Status      │
│  1   0x8b3e...d412    $5,000     $42.10   8.2%  ● Active    │
│  2   0x4a7f...c291    $1,200     $11.50   8.1%  ● Active    │
│  3   0x2c9a...f523    $500       $4.20    8.2%  ○ Idle      │
│  ···                                                         │
│                                                              │
│  ┌──────────────────────────────────────────────────┐        │
│  │  Get started:  $ npx t2000 init             [⎘]  │        │
│  └──────────────────────────────────────────────────┘        │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

- **Live Feed**: Scrolling terminal-style log of all agent activity across the network. JetBrains Mono. Timestamp + address + action + amount. New entries slide in from top. Pause button to freeze.
- **Leaderboard**: Table with sortable columns. Active agents have a green dot. Idle agents (no activity in 1hr) have a hollow dot. Click any row to open agent detail.
- **Stat Cards**: Large monospaced numbers, live-updating via WebSocket. Subtle pulse animation on number change.

#### Agent Detail Page — t2000.ai/agent/0x...

```
┌──────────────────────────────────────────────────────────────┐
│  [← Back to Network]                                         │
│                                                              │
│  Agent 0x8b3e...d412                     ● Active  47d       │
│  ────────────────────────────────────────────────────────    │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │  $5,000     │  │  $42.10     │  │  8.2%       │          │
│  │  supplied   │  │  earned     │  │  APY        │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
│                                                              │
│  Balance                                                     │
│  ─────────────                                               │
│  Available:  $200.00 USDC                                    │
│  Savings:    $5,000.00 USDC                                  │
│  Borrowed:   $1,000.00 USDC                                  │
│  Health:     2.14 ✓                                          │
│                                                              │
│  Yield History                                               │
│  ─────────────                                               │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ $45 ┤                                          ╱     │    │
│  │     │                                       ╱╱       │    │
│  │ $30 ┤                                   ╱╱╱          │    │
│  │     │                              ╱╱╱╱              │    │
│  │ $15 ┤                        ╱╱╱╱╱                   │    │
│  │     │               ╱╱╱╱╱╱╱╱                         │    │
│  │  $0 ┤──────╱╱╱╱╱╱╱╱─────────────────────────────    │    │
│  │     └──────────────────────────────────────────────   │    │
│  │     Jan      Feb      Mar      Apr      May          │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  Recent Transactions                                         │
│  ─────────────────                                           │
│  12:04:01  send      $50.00 USDC → 0xf1a2...b391    0xa1c2… │
│  11:30:00  yield     +$0.003 USDC                    —       │
│  09:15:22  save      $200.00 USDC                    0xb3d4… │
│  yesterday swap      10 SUI → 34.21 USDC             0xc5e6… │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

- Clean, data-dense layout
- Yield chart: line chart, cyan stroke, no fill, subtle grid lines
- Transactions: terminal-style log, monospaced, clickable tx hashes link to explorer
- OG image auto-generated from this data for social sharing

---

### OG Image Template (Social Sharing)

When an agent page is shared on Twitter/social:

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  [SKULL]  t2000                                              │
│                                                              │
│  Agent 0x8b3e...d412                                         │
│                                                              │
│  $5,000 supplied  ·  $42.10 earned  ·  8.2% APY             │
│                                                              │
│  47 days active                          t2000.ai            │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

- 1200x630px, dark background
- Generated server-side via `@vercel/og`
- Data pulled from indexer at share time

---

### Interaction Patterns

**Hover states:** Subtle cyan glow (`box-shadow: 0 0 20px rgba(0, 212, 255, 0.1)`) on cards and interactive elements. No color shifts.

**Copy feedback:** When install command is copied, the button briefly shows `✓ copied` in green, then reverts.

**Terminal recording:** Built with asciinema. Plays inline, no fullscreen. Speed: 1x with realistic typing delays. Loops with a 3s pause at the end.

**Scroll animations:** Content fades in on scroll (opacity 0 → 1, translateY 20px → 0, 400ms ease). No parallax. No horizontal movement. Keep it clean.

**Mobile:** Single column. Terminal recording scales to full width. Feature grid becomes 1-column stack. Install command always visible (sticky at bottom on mobile).

**Performance:** < 100KB JS. No framework animations library. CSS transitions only. Lighthouse score > 95.

---

### Implementation Notes

| Component | Technology |
|-----------|-----------|
| Framework | Next.js 15 (App Router, static export for MVP landing page) |
| Terminal recording | asciinema-player (embed) or custom `<TerminalPlayer>` component |
| Styling | Tailwind CSS |
| Fonts | Geist Sans (headings), Inter (body), JetBrains Mono (code/numbers) |
| OG images | `@vercel/og` (Satori) — Vercel hosting |
| Live data (v1.1) | WebSocket to indexer, TanStack Query for caching |
| Charts (v1.1) | Tremor (line charts for yield history) |
| Hosting | Vercel (static MVP) → Vercel (dynamic v1.1) |

---

## 17. Architecture

### Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Agent Machine                            │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────────────────┐│
│  │  Agent    │  │  t2000   │  │  t2000 Local API Server       ││
│  │  (LLM)   │──│  SDK     │  │  (t2000 serve --port 3001)    ││
│  │          │  │          │  │  Bearer token auth + rate limit││
│  └──────────┘  └────┬─────┘  └────────────┬───────────────────┘│
│                     │                      │                    │
│              ~/.t2000/                Uses SDK internally       │
│              (wallet.key [encrypted],                          │
│               config, funding state)                           │
└─────────────────────┬──────────────────────┘
                      │ HTTPS
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                     t2000 Backend (ECS Fargate)                  │
│                     api.t2000.ai — single container              │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Gas Station  │  │  Sponsor     │  │  Checkpoint-Based    │  │
│  │              │  │  Service     │  │  Indexer             │  │
│  │  [MVP]       │  │  [MVP]      │  │  [MVP]               │  │
│  │              │  │              │  │                      │  │
│  │ Bootstrap +  │  │ Funds new   │  │ Processes Sui        │  │
│  │ auto-topup + │  │ wallets via │  │ checkpoints in       │  │
│  │ fallback gas │  │ sponsored tx│  │ order. Indexes       │  │
│  │ SUI circuit  │  │             │  │ positions, txns,     │  │
│  │ breaker      │  │ Rate limited│  │ fees, yield.         │  │
│  │              │  │ + hashcash  │  │ Crash-safe cursor.   │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                                                                 │
│  In-memory: SUI price TWAP, rate limiting, circuit breaker      │
│  Serialized wallet signing: no coin object conflicts            │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  NeonDB (Serverless Postgres)                            │   │
│  │  sponsor_requests, gas_ledger, protocol_fee_ledger,      │   │
│  │  indexer_cursor, agents, positions, transactions,         │   │
│  │  yield_snapshots                                          │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Website (Vercel)                             │
│                     t2000.ai                                     │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Landing /    │  │ Leaderboard  │  │ Agent Detail         │  │
│  │ Hero         │  │  [v1.1]      │  │ View [v1.1]          │  │
│  │              │  │              │  │                      │  │
│  │ Live stats   │  │ Live agent   │  │ Positions, yield,    │  │
│  │ Setup guide  │  │ rankings    │  │ tx history, health   │  │
│  │              │  │ by yield,   │  │                      │  │
│  │              │  │ supplied,   │  │                      │  │
│  │              │  │ uptime      │  │                      │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                                                                 │
│  v1.1: Dashboard reads from NeonDB (populated by Indexer)       │
│  OG image generation for social sharing                         │
│  Agentic UI design system                                       │
└─────────────────────────────────────────────────────────────────┘
```

### Service Breakdown

| Service | Role | Deployment | Phase |
|---------|------|------------|-------|
| **Gas Station** | Bootstrap sponsorship (first 10 txs) + fallback gas sponsorship, pool management, SUI price circuit breaker | ECS Fargate (single task) | MVP |
| **Sponsor** | Funds new wallet creation, rate limiting, hashcash verification | ECS Fargate (same task) | MVP |
| **Indexer** | Checkpoint-based on-chain indexer. Processes positions, transactions, fees, yield. | ECS Fargate (same task, background loop) | MVP |
| **PostgreSQL** | All tables: sponsor, gas, fees, cursor, agents, positions, transactions, yield | NeonDB (serverless Postgres) | MVP |
| **Website** | Landing page | Vercel | MVP |
| **Dashboard** | Next.js frontend + API routes, reads from NeonDB | Vercel | v1.1 |

### Database Schema

#### MVP Tables

```sql
-- Sponsor rate limiting
CREATE TABLE sponsor_requests (
  id            SERIAL PRIMARY KEY,
  ip_address    TEXT NOT NULL,
  agent_address TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_sponsor_ip ON sponsor_requests(ip_address, created_at DESC);

-- Gas Station ledger (solvency tracking + bootstrap counter)
CREATE TABLE gas_ledger (
  id            SERIAL PRIMARY KEY,
  agent_address TEXT NOT NULL,
  sui_spent     NUMERIC NOT NULL,
  usdc_charged  NUMERIC NOT NULL,
  tx_digest     TEXT NOT NULL,
  tx_type       TEXT NOT NULL DEFAULT 'bootstrap',  -- 'bootstrap' | 'auto-topup' | 'fallback'
  status        TEXT NOT NULL DEFAULT 'settled',     -- 'settled' | 'loss'
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_gas_ledger_status ON gas_ledger(status);
CREATE INDEX idx_gas_ledger_agent ON gas_ledger(agent_address, tx_type);

-- Protocol fee ledger (revenue tracking)
CREATE TABLE protocol_fee_ledger (
  id            SERIAL PRIMARY KEY,
  agent_address TEXT NOT NULL,
  operation     TEXT NOT NULL,              -- 'save' | 'swap' | 'borrow'
  fee_amount    NUMERIC NOT NULL,
  fee_asset     TEXT NOT NULL DEFAULT 'USDC',
  fee_rate      NUMERIC NOT NULL,           -- 0.001 or 0.0005
  tx_digest     TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_protocol_fee_agent ON protocol_fee_ledger(agent_address, created_at DESC);
CREATE INDEX idx_protocol_fee_op ON protocol_fee_ledger(operation);
```

#### Indexer Tables (MVP)

```sql
-- Indexer checkpoint cursor (crash-safe resume)
CREATE TABLE indexer_cursor (
  id                SERIAL PRIMARY KEY,
  cursor_name       TEXT UNIQUE NOT NULL DEFAULT 'main',
  last_checkpoint   BIGINT NOT NULL,
  last_processed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Registered agents (public dashboard opt-in)
CREATE TABLE agents (
  id            SERIAL PRIMARY KEY,
  address       TEXT UNIQUE NOT NULL,
  name          TEXT,
  is_public     BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  last_seen     TIMESTAMPTZ
);

-- Indexed positions (from on-chain data)
CREATE TABLE positions (
  id            SERIAL PRIMARY KEY,
  agent_address TEXT NOT NULL REFERENCES agents(address),
  protocol      TEXT NOT NULL,              -- 'suilend'
  asset         TEXT NOT NULL,
  position_type TEXT NOT NULL,              -- 'save' | 'borrow'
  amount        NUMERIC NOT NULL,
  apy           NUMERIC,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_positions_agent ON positions(agent_address);

-- Yield snapshots (for charts)
CREATE TABLE yield_snapshots (
  id            SERIAL PRIMARY KEY,
  agent_address TEXT NOT NULL REFERENCES agents(address),
  supplied_usd  NUMERIC NOT NULL,
  yield_earned  NUMERIC NOT NULL,
  apy           NUMERIC NOT NULL,
  snapshot_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_yield_agent_time ON yield_snapshots(agent_address, snapshot_at DESC);

-- Transaction history (indexed from chain)
CREATE TABLE transactions (
  id            SERIAL PRIMARY KEY,
  agent_address TEXT NOT NULL REFERENCES agents(address),
  tx_digest     TEXT UNIQUE NOT NULL,
  action        TEXT NOT NULL,              -- 'send' | 'save' | 'withdraw' | 'swap' | ...
  asset         TEXT,
  amount        NUMERIC,
  gas_cost_usd  NUMERIC,
  gas_method    TEXT,                       -- 'self-funded' | 'sponsored' | 'auto-topup'
  executed_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_tx_agent ON transactions(agent_address, executed_at DESC);
```

### Indexer Design (Checkpoint-Based — MVP)

The indexer processes Sui checkpoints sequentially — the gold standard for on-chain indexing. Runs as a background loop in the same ECS Fargate task as the API.

```
Boot:
  1. Read last_checkpoint from indexer_cursor table
  2. If null, start from current network checkpoint

Every 2 seconds:
  1. Fetch checkpoints: sui_getCheckpoints(cursor: last_checkpoint, limit: 100)
  2. For each checkpoint:
     a. Fetch full tx blocks with showEvents: true
     b. Filter by t2000 package ID (fee events, config changes)
     c. Filter by known agent addresses (sends, saves, swaps)
     d. Parse events → upsert positions, insert transactions
     e. Detect FeeCollected events → insert protocol_fee_ledger
  3. Atomic DB write: all row changes + update indexer_cursor
  4. On crash → restart from stored cursor (no gaps, no duplicates)

Every 1 hour (in-process cron):
  1. Read Suilend accrual index for all indexed agents
  2. Compute yield deltas since last snapshot
  3. Insert yield_snapshots

Monitoring:
  GET /api/health returns:
    indexer.lastCheckpoint: 87420153
    indexer.latestCheckpoint: 87420155
    indexer.lag: 2  (checkpoints behind)
    indexer.lastProcessedAt: "2026-02-19T..."
```

**Why checkpoint-based:**
- **Exactly-once**: sequential checkpoint numbers guarantee no gaps
- **Crash-safe**: stored cursor = instant resume from exact position
- **Replayable**: reset cursor to reprocess historical data
- **Observable**: lag = latest - last_processed (clear SLA metric)

**v1.1 extension:** Dashboard reads from NeonDB tables populated by the indexer. No Redis needed for MVP — dashboard queries NeonDB directly.

---

## Local State (MVP)

```
~/.t2000/
├── wallet.key      # Ed25519 private key (AES-256-GCM encrypted by default)
├── config.json     # Network, RPC URL, API auth token, preferences
├── funding.json    # Yield tracking state (snapshots, totals)
└── backup.key.enc  # Encrypted backup (created by t2000 export)
```

Single wallet, flat structure. Multiple agents via `--key` or `T2000_PRIVATE_KEY` env var.

---

## 18. Security Model

### Key Storage

- Private key at `~/.t2000/wallet.key`, never leaves the machine
- **AES-256-GCM encryption is mandatory by default** — `t2000 init` prompts for a passphrase
- Use `t2000 init --no-encrypt` for plaintext keys (prints explicit security warning: "Your private key is stored unencrypted. Any process on this machine can read it. For cloud VMs, use encryption.")
- For programmatic/CI use: set `T2000_PRIVATE_KEY` env var instead of file storage
- Cloud services (Gas Station, Sponsor, Indexer) **never** have agent private keys
- Agents sign locally. Cloud services cannot move funds.

### Local API Security

- Local API server runs on localhost only
- **Bearer token authentication** — random token generated at `t2000 serve` startup, stored in `~/.t2000/config.json`
- Every request requires `Authorization: Bearer <token>` header
- Without token, returns `401 Unauthorized` — prevents SSRF attacks from compromised npm packages or other local processes
- **Rate limited** at 10 req/sec (configurable via `--rate-limit`) — prevents runaway agent code from draining wallet
- **Restarting the server generates a new token and invalidates the old one** — acts as manual token rotation; no separate rotation command needed
- The SDK reads the token automatically from config when using the HTTP API internally

### Backup & Recovery

```bash
# Export wallet to encrypted backup file (recommended)
t2000 export
# → Prompts for passphrase → saves to ~/.t2000/backup.key.enc

# Export raw key to terminal (warns about log exposure)
t2000 export --stdout
# → ⚠ WARNING: This will display your private key in the terminal.
# →   Terminal sessions may be logged (CI/CD, tmux, screen).
# →   Use 't2000 export' (encrypted file) instead for safety.
# → Continue? (y/N)
# → Outputs raw Ed25519 private key as hex string

# Import from encrypted backup
t2000 import
# → Prompts for backup file path + passphrase

# Import from raw hex key
t2000 import --raw
# → Prompts for hex private key
```

Export format: raw Ed25519 private key as hex string. Not a BIP39 mnemonic.

### Risk Controls

| Control | Value |
|---------|-------|
| Key encryption | Mandatory by default (AES-256-GCM + passphrase) |
| Local API auth | Bearer token required for every request |
| Local API rate limit | 10 req/sec default, configurable via `--rate-limit` |
| Minimum health factor | 1.5 — enforced before every borrow AND withdraw |
| Max swap slippage | 3% — enforced on-chain via Cetus `sqrt_price_limit` |
| Transaction simulation | Always — dry-run before signing, errors include Move abort code |
| Gas fee cap | $0.05 — rejects if gas exceeds this (Gas Station mode) |
| Asset whitelist | Enforced — no arbitrary token interactions |
| Save-all reserve | $1 USDC — prevents gas bricking |
| Protocol fees | 0.1% save/swap, 0.05% borrow — collected atomically, disclosed pre-signing |

---

## 19. Build Timeline

Everything above the line ships in 6 weeks. Everything below waits.

### MVP (Weeks 1-6)

Wallet SDK + CLI + Gas Station + Suilend + Cetus + local API + sponsored onboarding + yield tracking. Single wallet. Landing page at t2000.ai. **Start date: Jan 26, 2026 → Ship date: March 2, 2026** (before hackathon deadline March 4).

| Week | Focus | Deliverable |
|------|-------|-------------|
| 1 | Core Wallet + Key Security | Monorepo setup (pnpm), `T2000` class, Ed25519 keypair gen with **mandatory AES-256-GCM encryption** (`--no-encrypt` opt-out), load/export/import (encrypted file default, `--stdout` with warning), `t2000 init` (local keypair only — no sponsor yet), `t2000 send`, `t2000 balance` (with gasReserve), `t2000 address`, `t2000 deposit` (static instructions), `t2000 history`. Single wallet at `~/.t2000/wallet.key`. *Week 1 tests use a pre-funded mainnet wallet via `T2000_PRIVATE_KEY` env var (small amounts, no sponsor yet).* |
| 2 | Sponsor + Savings | Backend deployed (ECS Fargate). Sponsor service: sponsored `t2000 init` with hashcash. Bootstrap sponsorship (first 10 txs). Suilend integration: `save` (`supply` alias, `all` reserves $1), `withdraw` (HF check), `borrow` (HF check), `repay`, `healthFactor`, `rates`. |
| 3 | Gas Station + Auto-SUI Reserve | Gas Station endpoint on same ECS task — tested independently. Auto-SUI reserve logic (auto-swap USDC→SUI when SUI low, swap gas always sponsored). Bootstrap counter tracked server-side by wallet address in NeonDB. In-memory SUI price TWAP + circuit breaker. Retry/fallback logic. |
| 4 | Swaps + Protocol Fees + Risk | Cetus swap integration with **on-chain slippage enforcement** (`sqrt_price_limit`). **Protocol fee collection** (0.1% save/swap, 0.05% borrow) — atomic PTB inclusion, pre-signing disclosure, `protocol_fee_ledger` table. Risk module: HF checks before borrow AND withdraw (`maxWithdraw`/`maxBorrow` helpers), tx simulation with Move abort code in errors, address validation on `send`. |
| 5 | Indexer + Yield + Events + Local API | **Checkpoint-based indexer**: processes Sui checkpoints sequentially, indexes positions/transactions/fees, crash-safe cursor in NeonDB. Yield snapshotter (hourly). `GET /api/health` with indexer lag. Client-side yield tracker via Suilend accrual index. `earnings`, `fund-status`. Event system: `EventEmitter` for `yield`, `balanceChange`, `healthWarning`, `healthCritical`, `gasStationFallback`, `error`. `t2000 serve` (Hono) with **bearer token auth** and **configurable rate limit** (`--rate-limit`, default 10 req/sec). SSE `/v1/events`. `--json` output on all CLI commands. Restart generates new token. |
| 6 | Launch | npm publish (`@t2000/sdk`, `@t2000/cli`). README with 30-second quickstart. Static landing page at t2000.ai (Vercel). Full E2E test pass on mainnet (small amounts). **Must ship before March 4 hackathon deadline.** |

### v1.1 — Dashboard + Multi-Agent (Weeks 7-10)

| Week | Focus | Deliverable |
|------|-------|-------------|
| 7 | Dashboard — Core | Next.js dashboard on Vercel (Agentic UI design system): reads from NeonDB (populated by MVP indexer). Live network stats (agents, USDC supplied, yield earned), leaderboard, agent detail view (positions, yield history, tx history). |
| 8 | Dashboard — Polish + Virality | OG image generation for agent stats cards. Shareable agent URLs (`t2000.ai/agent/0x...`). Embeddable badges. `--public` opt-in flag for `t2000 init`. |
| 9 | Multi-Agent + Webhooks | Profile system (`--profile` flag, `~/.t2000/agents/` directory). `t2000 agents`, `t2000 use`. `T2000Fleet` SDK class. Webhook configuration for yield/health events. |

### v1.2 — Cross-Chain

| Scope | Deliverable |
|-------|-------------|
| Multi-chain send/receive | `t2000 deposit --from ethereum` (cross-chain receive). `t2000 send --chain ethereum` (cross-chain send). Implementation via Ika (dWallet multi-chain signing) and/or CCTP (burn/mint) depending on availability. Relayer service for target chain tx submission. |

### v1.3 — Perpetuals

| Scope | Deliverable |
|-------|-------------|
| Bluefin integration | `long`, `short`, `close`, `pnl`. SUI-PERP, BTC-PERP, ETH-PERP. Cross-margin, partial close. Separate risk rules for leverage. |

**Week 6:** `npx t2000 init` → fund → `send` → `save` → `swap` → `borrow` → yield tracked. CLI, SDK, API working. Gas auto-managed. Key encrypted. API auth'd. USDC everywhere. Landing page live. **Hackathon submission ready.**

**Week 10:** Dashboard with leaderboard. Multi-agent profiles. Webhooks.

---

## 20. Tech Stack

### SDK / CLI (Agent-Side)

| Technology | Role |
|-----------|------|
| TypeScript | Everything |
| pnpm workspaces | Monorepo (sdk, cli packages) |
| @mysten/sui | Transaction building, simulation, submission |
| Suilend SDK | Lending protocol integration |
| Cetus SDK | Spot swap routing |
| Commander.js | CLI framework |
| Hono | Local HTTP API server (lightweight, fast) |

### Cloud Services (MVP — ECS Fargate)

| Technology | Role |
|-----------|------|
| Hono (Node.js) | Backend API server (Sponsor, Gas Station, Indexer) |
| AWS ECS (Fargate) | Single container running API + checkpoint indexer |
| NeonDB | Serverless Postgres (all tables) |
| Prisma | ORM for database access |

### Website + Dashboard (Vercel)

| Technology | Role |
|-----------|------|
| Next.js 15 (App Router) | Landing page (MVP) + Dashboard (v1.1) |
| Tailwind CSS | Styling (Agentic UI design system) |
| shadcn/ui | Component library |
| TanStack Query | Data fetching, real-time updates |
| Tremor | Yield charts (v1.1 dashboard) |
| Vercel | Hosting |
| `@vercel/og` | OG image generation for social sharing |

### Testing

| Technology | Role |
|-----------|------|
| Vitest | Unit + integration tests |
| Sui mainnet | Protocol integration tests (small amounts) |
| Supertest | HTTP API tests |
| Playwright | Dashboard E2E tests |

---

## 21. Testing

### Unit Tests

| Module | Critical Assertions |
|--------|-------------------|
| `wallet/keyManager` | Keypair gen produces valid Ed25519. **Encryption mandatory by default** — load/save with passphrase. Export to encrypted file roundtrip works. `--stdout` export with `--raw` import roundtrip works. Env var override (`T2000_PRIVATE_KEY`) works. `--no-encrypt` stores plaintext with warning. |
| `wallet/send` | Send validates address format. Send throws `INSUFFICIENT_BALANCE` when amount > available. Send returns correct balance breakdown (available/savings/total). |
| `protocols/suilend` | Save (supply) returns tx digest. `save all` reserves $1 USDC. HF check throws at < 1.5 on borrow AND withdraw. `WITHDRAW_WOULD_LIQUIDATE` includes `safeWithdrawAmount`. Borrow with no collateral throws `NO_COLLATERAL`. Repay all calculates correct amount. Yield tracking via accrual index is accurate. |
| `protocols/cetus` | Swap enforces slippage **on-chain** via `sqrt_price_limit`. Whitelist rejects unlisted assets. |
| `gasStation/client` | Dynamic fee calculation correct. Fallback to Gas Station works when SUI empty. Auto-SUI reserve top-up triggers at threshold. Fee cap ($0.05) enforced. `GAS_FEE_EXCEEDED` thrown when cap hit. SUI price circuit breaker activates on >20% move. Bootstrap phase tracks tx count correctly. |
| `fees/protocolFee` | Protocol fee calculated correctly (0.1% save/swap, 0.05% borrow). Fee included atomically in PTB. Fee shown in pre-signing disclosure. Free operations (send, withdraw, repay) have zero protocol fee. Fee ledger entry created on success. |
| `funding/tracker` | Yield calculated correctly from balance delta. Snapshot stored. |
| `events` | EventEmitter fires correct events. SSE serialization correct. |
| `errors` | All error codes (including `NO_COLLATERAL`, `GAS_FEE_EXCEEDED`) throw correct T2000Error with correct data shape. |
| `resilience` | Retry logic works. RPC failover works. Backoff timing correct. |

### Integration Tests (Testnet)

| Suite | What to Verify |
|-------|---------------|
| Send | USDC transfer executes, balance updates (including gasReserve), recipient receives funds |
| Save (Suilend) | Full save → earn → withdraw roundtrip. `save all` reserves $1 USDC. Balance shows available/savings/gasReserve split. Yield tracked via accrual index. |
| Withdraw (Suilend) | Withdraw succeeds when HF safe. Withdraw blocked with `WITHDRAW_WOULD_LIQUIDATE` when would drop HF < 1.5. Returns `safeWithdrawAmount`. |
| Borrow (Suilend) | Borrow with collateral succeeds. Borrow without collateral throws `NO_COLLATERAL`. Borrow that drops HF < 1.5 throws `HEALTH_FACTOR_TOO_LOW`. |
| Cetus | SUI→USDC swap executes with on-chain slippage protection (`sqrt_price_limit`), balance updates |
| Sponsored Init | New wallet created with zero cost (encrypted key by default), hashcash challenge passed |
| Bootstrap Gas | First 10 txs sponsored. After bootstrap, agent auto-swaps USDC→SUI and pays own gas. |
| Gas Station (fallback) | When SUI reserve empty and auto-top-up fails, falls back to Gas Station, response shows `gasMethod: 'sponsored'` |
| Auto-SUI Reserve | When SUI < 0.05 and USDC > $5, auto-swaps $1 USDC→SUI. gasReserve reflected in balance. |
| API Auth | Requests without bearer token return 401. Rate limit returns 429 at >10 req/sec. |
| Protocol Fees | Save deducts 0.1% protocol fee atomically. Swap deducts 0.1%. Borrow deducts 0.05%. Send/withdraw/repay have zero fee. `protocolFee` field present in all responses. Fee ledger entry created. |
| Event System | Events fire correctly for send, save, balance change, health warning, gasStationFallback |

### E2E Tests

```bash
# The demo that has to work perfectly
npx t2000 init
t2000 deposit                           # shows funding instructions
t2000 balance                           # $0.00 USDC
# (fund with USDC on mainnet — small amount for testing)
t2000 balance                           # $100.00 USDC (available)
t2000 send 10 USDC to 0x8b3e...d412     # auto-tops up gas ($1 USDC → SUI), sends
t2000 save 79 USDC                      # saves, shows APY, fee: $0.08
t2000 balance                           # available: $9.92, savings: $79, total: $89.90
t2000 borrow 30 USDC                    # borrows against savings, HF checked
t2000 health                            # health factor > 1.5
t2000 swap 5 USDC to SUI               # swap, slippage shown, gas method shown
t2000 history                           # shows all transactions
t2000 earnings                          # yield tracked
t2000 fund-status                       # savings summary
t2000 repay all USDC                    # repays borrow
t2000 withdraw all USDC                 # withdraws from savings
```

Every command in this sequence must work end-to-end on mainnet (small amounts).

---

## Appendix A — The 30-Second Demo

This has to work perfectly.

```bash
# Install
npm install -g @t2000/cli

# Create a wallet — one command, zero cost
npx t2000 init

  ✓ Wallet created (sponsored)
  ✓ Address: 0x4a7f...c291
  ✓ Fund with USDC to get started

# (withdraw $100 USDC to Sui from Coinbase)

# Send money — first send auto-tops up gas reserve
t2000 send 10 USDC to 0x8b3e...d412

  ✓ Auto-topped up gas reserve ($1.00 USDC → SUI)
  ✓ Sent $10.00 USDC → 0x8b3e...d412
  ✓ Gas: 0.002 SUI (self-funded)
  ✓ Balance: $89.00 USDC

# Put idle cash in savings — earn yield automatically
t2000 save 79 USDC

  ✓ $79.00 USDC → savings (8.2% APY)
  ✓ Fee: $0.08 (0.1%)
  ✓ Earning ~$0.018/day
  ✓ Gas: 0.003 SUI (self-funded)

# Check your balance
t2000 balance

  Available:    $9.92 USDC
  Savings:      $79.00 USDC (8.2% APY)
  Gas reserve:  0.28 SUI (~$0.98) ✓ auto-managed
  Total:        $89.90

# Your agent has a wallet. It sends money. It earns interest.
# Gas is auto-managed. No blockchain knowledge required.
```

No protocol names. No chain names. Gas auto-managed. Wallet, send, save, balance.

The first send on any fresh wallet shows the auto-top-up line. Subsequent sends don't (gas reserve is already funded). This is exactly what happens in production — the demo must show it honestly.

---

## Appendix B — What Changed (v1 → v2 → v3 → v3.1 → v4.0)

| Area | v3.1 | v4.0 (this) | Why |
|------|------|-------------|-----|
| Identity | "The first wallet for AI agents" | Same | — |
| Gas model | Gas Station sponsors all txs | **Bootstrap sponsor → auto-SUI reserve → Gas Station as fallback** | Sustainable. Agent owns its gas. No dependency on t2000 infra. |
| Key storage | Optional encryption | **Mandatory AES-256-GCM encryption** (`--no-encrypt` to opt out) | Plaintext keys on cloud VMs = instant fund loss |
| Local API auth | No auth (localhost only) | **Bearer token auth** + 10 req/sec rate limit | SSRF protection. Prevents compromised deps from draining wallet. |
| Export | Raw hex to terminal | **Encrypted file by default** (`--stdout` with warning) | Terminal logs in CI/CD expose keys forever |
| Sponsor rate limit | 10/IP/hour | 10/IP/hour + **hashcash proof-of-work challenge** | Prevents mass wallet creation via proxies |
| Swap slippage | Pre-flight check only | **On-chain enforcement** via Cetus `sqrt_price_limit` | Pre-flight alone is insufficient on congested networks |
| Save all | Saves entire balance | **Reserves $1 USDC** as gas buffer | Prevents bricking if Gas Station is down |
| Borrow | No use case explanation | **"Why borrow" explainer** + plain-English health factor | Agent devs need to understand when/why to borrow |
| Simulation error | Generic failure | **Includes Move abort code** and human-readable reason | Agents need actionable failure info |
| Withdraw | No HF check | **Checks projected HF** — blocks if would drop below 1.5 | Prevents accidental liquidation |
| Yield tracking | Polling delta | **Suilend accrual index** (polling as fallback) | Exact, no drift, handles edge cases |
| SUI price crash | Not addressed | **Circuit breaker**: suspend Gas Station if >20% move in 1hr | Protects pool from being drained |
| Balance shape | Available + Savings | **+ gasReserve** (SUI amount + USD equiv) | Transparency: agent always sees gas state |
| Self-funding threshold | "$500 = self-funding" | **"$2,000+ to be practical"** | Honest about fiat conversion friction |
| Timeline | Week 2 = Sponsor + Gas Station + Suilend | **Week 3 = Gas Station, Week 4 = Swaps + Fees, Week 5 = Events + API** | Realistic weekly load |
| Revenue model | No revenue model | **Protocol fees**: 0.1% save/swap, 0.05% borrow. Free wallet, paid DeFi. | Sustainable business. Standard aggregator model. |
| Auto-top-up | Not addressed | **Auto-top-up swaps always sponsored** by Gas Station (prevents zero-SUI deadlock) | Race condition fix |
| Bootstrap tracking | Unspecified | **Server-side by wallet address** in `gas_ledger` | Client-side is spoofable |
| Treasury helpers | Not addressed | **`maxWithdraw()` / `maxBorrow()`** — read-only, no gas, no tx | Agents need to query safe limits before acting |
| Error codes | 13 codes | **15 codes** (+`WITHDRAW_WOULD_LIQUIDATE`, `SIMULATION_FAILED` enhanced) | Complete coverage |
| gas_ledger schema | status only | **+ `tx_type` column** (`'bootstrap'` / `'auto-topup'` / `'fallback'`) | Distinguish bootstrap vs ongoing costs for P&L |
| transactions schema | `gas_method: 'sponsored' / 'direct'` | **`gas_method: 'self-funded' / 'sponsored' / 'auto-topup'`** | Matches v4.0 gas model |
| 30-second demo | Shows self-funded on fresh wallet | **Shows auto-top-up on first send** with corrected balance math | Honest demo — matches real first-run behavior |
| Week 1 testing | No testing path | **Pre-funded mainnet wallet via `T2000_PRIVATE_KEY`** (small amounts) | Week 1 is testable in CI without sponsor |
| HTTP API balance | `usdEquiv` undocumented | **Note: `usdEquiv` is an estimate at current SUI price** | Parity with SDK docs |
| Security Model | Token rotation not documented | **Restart generates new token**, documented in Section 18 | Self-contained security reference |

#### v4.0 → v4.1 (Build Plan Alignment)

| Area | Change | Reason |
|------|--------|--------|
| SDK init API | `new T2000()` → `T2000.create()` / `T2000.fromPrivateKey()` | Async factory pattern (file I/O is async) |
| Sponsor API | `publicKey` + `name` → `address` + `proof` + `name` | Hashcash proof prevents mass creation |
| Sponsor URL | `sponsor.t2000.ai/v1/init` → `api.t2000.ai/api/sponsor` | ECS Fargate backend |
| Infrastructure | Vercel serverless → **ECS Fargate** (single task) + NeonDB | Serialized wallet signing eliminates coin conflicts. In-memory TWAP. Checkpoint indexer in same process. |
| Gas Station pricing | Dynamic markup + TWAP → flat pass-through (bootstrap/auto-topup free) | Revenue comes from protocol fees, not gas. Gas Station is a cost center. |
| Indexer | v1.1 polling → **MVP checkpoint-based** | Gold standard: sequential checkpoints, crash-safe cursor, exactly-once processing. |
| Fee collection | USDC transfer to multisig → `treasury::collect_fee()` on-chain | Better governance (timelocks, version gating, admin transfer) |
| Auto-protect | Auto-repay at HF < 1.2 → Emit `healthCritical` event only | Deferred to v1.1 (complexity) |
| Week 1 testing | Pre-funded testnet wallet → Pre-funded **mainnet** wallet (small amounts) | Direct mainnet deployment decision |

---

## Appendix C — Cross-Chain Strategy

MVP is Sui-only. Cross-chain ships in v1.2. Two candidates are being evaluated:

### Option A — Ika (dWallet Multi-Chain Signing)

[Ika](https://ika.xyz) is a zero-trust MPC network natively coordinated on Sui. **Mainnet live since July 2025.** 10,000 TPS, sub-second latency, 100+ operators.

**How it works:** A dWallet generates native keypairs for any chain (Ethereum, Solana, Bitcoin) via distributed key generation. Signing is done via 2PC-MPC — both the agent and the Ika network must cooperate. The agent gets real addresses on every chain, all controlled from Sui.

**What this enables:**
- `t2000 init` creates addresses on Sui + Ethereum + Solana
- `t2000 send 50 USDC to 0x...` auto-detects target chain, signs natively
- No bridging, no wrapped tokens, no liquidity pools

**Open questions:** Target chain gas payment (need a Relayer service), IKA token fees, presign pool management, multi-chain balance indexing.

### Option B — CCTP (Circle Cross-Chain Transfer Protocol)

[CCTP](https://developers.circle.com/cctp) is Circle's native USDC burn/mint bridge. 22+ chains supported. Sui support [announced](https://www.circle.com/blog/usdc-and-cctp-are-coming-to-sui) but **not yet live** as of February 2026.

**How it works:** Burn USDC on source chain, Circle attests, mint USDC on destination chain. 1:1 native USDC, no wrapped tokens.

**What this enables:**
- `t2000 deposit --from ethereum` — programmatic cross-chain deposit
- `t2000 send --chain ethereum` — cross-chain send

**Blocker:** Requires Circle to ship Sui support. No timeline.

### Decision

Both may be used. Ika for multi-chain wallet control (agent signs transactions on any chain). CCTP for USDC-specific transfers (when available). The SDK's send/deposit modules are designed as swappable interfaces — cross-chain can be added without changing the rest of the system.

### Native USDC on Sui (MVP)

- Token: `0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC`
- Issued directly by Circle, not bridged
- Redeemable 1:1 for USD via Circle Mint (institutional)

---

## Appendix D — Sui AI Agent Hackathon Submission

### Hackathon

**Sui x OpenClaw AI Agent Hackathon** — "Calling All Agents"

- **Submission deadline:** March 4, 2026 23:00 PST
- **Prize pool:** $20,000 USD (paid in USDC on Sui)
- **Platform:** [DeepSurge](https://deepsurge.xyz)
- **Registration:** [Register here](https://www.deepsurge.xyz/hackathons/cd96178d-5e11-4d56-9f02-1bf157de2552/register)

### Track

**Track 2: Local God Mode — The "Jarvis" Edition.** t2000 fits the "Infinite Money Glitch" archetype: an agent that pays its own rent by earning crypto yield and executing DeFi strategies autonomously.

### Why t2000 Fits

| Criterion | How t2000 Meets It |
|-----------|-------------------|
| **Developed by AI agents** | Spec designed with AI. Codebase built with AI assistance. |
| **Uses Sui Stack** | Native Sui transactions, Suilend, Cetus, sponsored transactions, USDC on Sui |
| **Working demo** | `npx t2000 init` → send → save → earn yield. Full E2E on mainnet. |
| **The "Infinite Money Glitch"** | Agent supplies idle USDC to earn 8%+ APY. Yield offsets compute costs. At $2,000+ supplied, self-funding becomes practical. |
| **Local God Mode** | Runs entirely on the agent's machine. Local keypair, local API server, no custody. The agent controls its own wallet. |

### Sui Stack Integration

- **@mysten/sui** — Transaction building, simulation, PTB construction
- **Suilend** — Lending/borrowing (save, withdraw, borrow, repay)
- **Cetus** — DEX swaps with slippage protection
- **Sponsored transactions** — Gas Station uses Sui-native sponsored tx pattern
- **Native USDC on Sui** — Circle-issued, not bridged

### Submission Checklist

- [ ] **Register on [DeepSurge](https://www.deepsurge.xyz/hackathons/cd96178d-5e11-4d56-9f02-1bf157de2552/register) before March 4, 2026 23:00 PST**
- [ ] DeepSurge profile with Sui wallet address
- [ ] Working demo on Sui mainnet (full E2E: init → deposit → send → save → balance → withdraw)
- [ ] npm packages published (`@t2000/sdk`, `@t2000/cli`)
- [ ] GitHub repo with README and 30-second quickstart
- [ ] Landing page live at t2000.ai
- [ ] Demo video / terminal recording (asciinema)

### Hackathon Resources

- [Sui docs](https://docs.sui.io)
- [Sui Stack Developer Plugin](https://github.com/0x-j/sui-stack-claude-code-plugin)
- [OpenClaw docs](https://docs.openclaw.ai/)
- [Community Sui Move skill](https://clawhub.ai/EasonC13/sui-move)

---

*t2000 — The first wallet for AI agents.*
*Specification v4.1 — aligned with BUILD-PLAN.md*
