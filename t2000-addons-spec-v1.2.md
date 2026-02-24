# t2000 Addon Specifications
## Addon A: Skills Package (`t2000/t2000-skills`) + Addon B: x402 Client Support

**Status:** v1.2 — Reviewer fixes applied  
**Previous version:** v1.0  
**Builds on:** t2000 core spec v4.0 (approved)  
**Hackathon deadline:** March 4, 2026  
**Target ship:** Skills → Week 5 | x402 client → Week 5 | x402 server → post-hackathon

---

## Changelog: v1.0 → v1.2

All issues raised in the spec review are resolved in this version.

### Addon A fixes
| # | Issue | Resolution |
|---|-------|-----------|
| A1 | `--show-limits` flag doesn't exist in CLI | Added `--show-limits` as a new flag on `t2000 balance` (see A.6). Skills updated to reference it correctly. |
| A2 | Swap fee inconsistency (skill said 0.05%, core spec says 0.1%) | **Unified at 0.1%** throughout. Skill and README corrected. Confirm this is your intended margin. |
| A3 | README links wrong (`t2000.sh`, `github.com/t2000/t2000`) | Corrected to `t2000.ai` and `github.com/mission69b/t2000` |
| A4 | `t2000-pay` skill ships before x402 code exists | Skill now has `status: coming-soon` in frontmatter and is excluded from the Week 5 initial publish |
| A5 | "saves everything except $1 gas reserve" — misleading | Rewritten: skill now explains the gas manager mechanic correctly |

### Addon B fixes
| # | Issue | Resolution |
|---|-------|-----------|
| B1 | ~~Critical risk: is Payment Kit on mainnet?~~ | **Resolved — confirmed live.** Namespace objects are hardcoded in official Sui docs (mainnet: `0xccd3...ae7c2`, testnet: `0xa501...78db`). Package is a Mysten Labs standard with TypeScript SDK at `@mysten/payment-kit`. See B.1 for full analysis. |
| B2 | `usdcToMist` is wrong (MIST is a SUI unit) | Renamed to `usdcToRaw` throughout, matching `utils/format.ts` |
| B3 | Race condition on nonce dedup | **Eliminated at the architecture level.** Payment Kit's `EDuplicatePayment` error handles dedup at the Move layer — the PostgreSQL nonce store is now a secondary audit log, not the primary guard. Race condition structurally impossible. |
| B4 | Facilitator as SPOF | Documented clearly; noted that x402 servers can verify directly against Sui RPC in v2. Acceptable for hackathon. |

---

## Sui Payment Kit: Confirmed Live + Relationship to x402

### Is it on mainnet? Yes.

The Namespace objects are published in the [official Sui documentation](https://docs.sui.io/standards/payment-kit):

```
Mainnet Namespace: 0xccd3e4c7802921991cd9ce488c4ca0b51334ba75483702744242284ccf3ae7c2
Testnet Namespace: 0xa5016862fdccba7cc576b56cc5a391eda6775200aaa03a6b3c97d512312878db
```

Source repositories confirmed:
- Move package: `github.com/MystenLabs/sui-payment-kit` (70 commits, Mysten Labs)
- TypeScript SDK: `github.com/MystenLabs/ts-sdks` → `packages/payment-kit`
- Listed as an official Sui standard alongside Coin, Kiosk, and DeepBook

The `PaymentReceipt` event emission is exactly what the spec requires.
**The v1.0 critical risk is fully resolved.**

Mainnet Package ID: `0xbc126f1535fba7d641cb9150ad9eae93b104972586ba20f3c60bfe0e53b69bc6`
t2000 PaymentRegistry ID: `0x4009dd17305ed1b33352b808e9d0e9eb94d09085b2d5ec0f395c5cdfa2271291`

> **Action required before building:** Fetch the package ID from `Move.lock`
> in the `sui-payment-kit` repo (requires GitHub auth) or query the Namespace
> object on-chain to get the canonical `PAYMENT_KIT_PACKAGE` constant.
> The TypeScript SDK's `package.json` `published-at` field is the fastest path.

### Is Payment Kit x402? No — it's the settlement layer *for* x402 on Sui.

These are two distinct protocol layers that work together:

| Layer | Protocol | Responsibility |
|-------|----------|----------------|
| HTTP negotiation | **x402** | `402 Payment Required` signal, `X-PAYMENT` header, retry flow |
| On-chain settlement | **Sui Payment Kit** | Validates amounts, prevents duplicate payments, emits events, generates receipts |

x402 answers: *"How does a server tell a client payment is required, and how does the client prove it paid?"*

Payment Kit answers: *"How does a Sui transaction enforce payment correctness, prevent replay attacks, and generate verifiable receipts?"*

**For t2000:** When an agent hits a `402` wall, t2000 calls `process_registry_payment`
from Payment Kit to execute the on-chain payment. The resulting `PaymentReceipt`
(nonce, amount, receiver, timestamp) is what the t2000 facilitator reads to verify
the payment happened. Payment Kit's `EDuplicatePayment` error makes replay attacks
structurally impossible at the Move level — no race condition exists in the
facilitator's nonce store because the chain enforces uniqueness first.

---

# ADDON A: t2000 Skills Package

## A.1 What Are Agent Skills

Agent Skills is an open standard adopted by Claude Code, OpenAI Codex, GitHub
Copilot, Cursor, VS Code, and 20+ other platforms. A skill is a folder containing
a `SKILL.md` file with YAML frontmatter and markdown instructions. Agents load
only what they need — name and description (~30 tokens) sit in context at startup;
full instructions only load when that skill is triggered.

The standard is platform-agnostic. A `t2000/t2000-skills` package published to
GitHub is installable on any supporting platform with one command:

```bash
npx skills add t2000/t2000-skills
```

## A.2 Repository Structure

```
t2000-skills/                          # GitHub: github.com/mission69b/t2000-skills
├── README.md
├── LICENSE.md                         # MIT
├── skills/
│   ├── t2000-check-balance/SKILL.md
│   ├── t2000-send/SKILL.md
│   ├── t2000-save/SKILL.md
│   ├── t2000-withdraw/SKILL.md
│   ├── t2000-swap/SKILL.md
│   ├── t2000-borrow/SKILL.md
│   ├── t2000-repay/SKILL.md
│   └── t2000-pay/SKILL.md            # status: coming-soon (ships with Addon B)
```

**Week 5 publish:** Ship all 7 core skills. Hold `t2000-pay` until x402 CLI is functional.

---

## A.3 Skill Specifications

### Skill: `t2000-check-balance`

```markdown
---
name: t2000-check-balance
description: >-
  Check the t2000 agent wallet balance on Sui. Use when asked about wallet
  balance, how much USDC is available, savings balance, gas reserve, total
  funds, or portfolio value. Also use before any send or borrow operation
  to confirm sufficient funds exist.
license: MIT
metadata:
  author: t2000
  version: "1.1"
  requires: t2000 CLI (npm install -g t2000)
---

# t2000: Check Balance

## Purpose
Fetch the current balance across all accounts: available USDC (checking),
savings (NAVI deposit), gas reserve (SUI), and total portfolio value.

## Commands
```bash
t2000 balance                 # human-readable summary
t2000 balance --show-limits   # includes maxWithdraw, maxBorrow, healthFactor
t2000 balance --json          # machine-parseable JSON (use this in agent code)
```

## Output (default)
```
Available:  $XX.XX USDC   (checking — spendable immediately)
Savings:    $XX.XX USDC   (earning ~X.XX% APY in NAVI)
Gas:        X.XX SUI      (~$X.XX at current price)
──────────────────────────
Total:      $XX.XX USDC
```

## Output (--show-limits)
Appends to the above:
```
Limits:
  Max withdraw:   $XX.XX USDC   (safe given current loan position)
  Max borrow:     $XX.XX USDC   (50% LTV ceiling)
  Health factor:  X.XX          (∞ if no active loan)
```

## Notes
- `gasReserve.usdEquiv` is an estimate at current SUI price; it fluctuates
  without any swap occurring
- If balance shows $0.00 available and wallet was just created, fund it first
  via Coinbase Onramp or a direct USDC transfer to the wallet address
```

---

### Skill: `t2000-send`

```markdown
---
name: t2000-send
description: >-
  Send USDC from the t2000 agent wallet to another address on Sui. Use when
  asked to pay someone, transfer funds, send money, tip a creator, or make a
  payment to a specific Sui address. Do NOT use for API payments — use
  t2000-pay for x402-protected services.
license: MIT
metadata:
  author: t2000
  version: "1.1"
  requires: t2000 CLI (npm install -g t2000)
---

# t2000: Send USDC

## Purpose
Transfer USDC from the agent's available balance to any Sui address. Gas is
self-funded from the agent's SUI reserve (auto-topped up if needed).

## Command
```bash
t2000 send <amount> USDC to <address>

# Examples:
t2000 send 10 USDC to 0x8b3e...d412
t2000 send 50 USDC to 0xabcd...1234
```

## Pre-flight checks (automatic)
1. Sufficient available USDC balance (amount + protocol fee)
2. SUI gas reserve present; if not, auto-topup is triggered ($1 USDC → SUI)
3. Transaction simulation before broadcast

## Output
```
✓ Auto-topped up gas reserve ($1.00 USDC → SUI)   [only shown if triggered]
✓ Sent $XX.XX USDC → 0x8b3e...d412
✓ Gas: X.XXX SUI (self-funded)
✓ Balance: $XX.XX USDC available
  Tx: https://suiexplorer.com/tx/0x...
```

## Error handling
- `INSUFFICIENT_BALANCE`: available balance is less than the requested amount
- `INVALID_ADDRESS`: destination is not a valid Sui address
- `SIMULATION_FAILED`: transaction would fail on-chain; details in error message
```

---

### Skill: `t2000-save`

```markdown
---
name: t2000-save
description: >-
  Deposit USDC into savings to earn yield on Sui via NAVI Protocol. Use when asked
  to save money, earn interest, deposit to savings, put funds to work, or
  maximize yield on idle USDC. Not for sending to other addresses — use
  t2000-send for that.
license: MIT
metadata:
  author: t2000
  version: "1.1"
  requires: t2000 CLI (npm install -g t2000)
---

# t2000: Save (Deposit to NAVI)

## Purpose
Deposit USDC into NAVI to earn yield. Funds remain non-custodial and
withdrawable at any time (subject to utilization).

## Command
```bash
t2000 save <amount> USDC
t2000 save all

# Examples:
t2000 save 80 USDC
t2000 save all
```

## Important: how `save all` works
`save all` deposits everything except what the gas manager needs. It does NOT
simply reserve $1 USDC liquid. Instead: if the SUI gas reserve is low, the gas
manager will auto-convert up to $1 USDC → SUI before depositing the remainder.
The exact USDC deposited = available balance minus any gas conversion amount.
If no gas conversion is needed, the full available balance is deposited.

Example:
```
Available:  $100.00 USDC
Gas:        0.00 SUI  (low — gas manager triggers)

→ Gas manager converts $1.00 USDC → SUI
→ Deposits $99.00 USDC to NAVI
→ Protocol fee: $0.099 USDC (0.1%)
→ Net deposited: $98.90 USDC
```

## Fees
- Protocol fee: 0.1% of the deposit amount
- Fee is collected atomically — no fee charged if transaction fails

## Output
```
✓ Gas manager: $1.00 USDC → SUI          [only shown if triggered]
✓ Deposited $XX.XX USDC to NAVI
✓ Protocol fee: $0.XX USDC (0.1%)
✓ Current APY: X.XX%
✓ Savings balance: $XX.XX USDC
  Tx: https://suiexplorer.com/tx/0x...
```

## Notes
- APY is variable based on NAVI utilization
- If available balance is $0 after gas conversion, returns INSUFFICIENT_BALANCE
```

---

### Skill: `t2000-withdraw`

```markdown
---
name: t2000-withdraw
description: >-
  Withdraw USDC from savings back to the available (checking) balance. Use
  when asked to withdraw savings, access deposited funds, move money from
  savings to checking, or liquidate a savings position. Will be blocked if
  the withdrawal would put any active loan at risk.
license: MIT
metadata:
  author: t2000
  version: "1.1"
  requires: t2000 CLI (npm install -g t2000)
---

# t2000: Withdraw from Savings

## Purpose
Move USDC from NAVI savings back to the available balance.

## Command
```bash
t2000 withdraw <amount> USDC
t2000 withdraw all

# Examples:
t2000 withdraw 50 USDC
t2000 withdraw all
```

## Safety check
If the wallet has an active borrow position, withdrawal is blocked if it
would drop the health factor below 1.5. The error includes `safeWithdrawAmount`.

## Query safe limits first (recommended before withdrawing with active loan)
```bash
t2000 balance --show-limits
# Returns: maxWithdraw, maxBorrow, currentHealthFactor
```

## Output
```
✓ Withdrew $XX.XX USDC from NAVI
✓ Available balance: $XX.XX USDC
  Tx: https://suiexplorer.com/tx/0x...
```

## Errors
- `WITHDRAW_WOULD_LIQUIDATE`: withdrawal would drop health factor below 1.5
  → data includes `safeWithdrawAmount` (the safe maximum)
- `INSUFFICIENT_SAVINGS`: savings balance is less than the requested amount
- `NAVI_LIQUIDITY_UNAVAILABLE`: pool utilization too high; retry later
```

---

### Skill: `t2000-swap`

```markdown
---
name: t2000-swap
description: >-
  Swap one token for another using Cetus DEX on Sui. Use when asked to
  exchange tokens, convert USDC to SUI, trade one asset for another, or
  change currency. A 0.1% protocol fee applies. Slippage is enforced
  on-chain.
license: MIT
metadata:
  author: t2000
  version: "1.1"
  requires: t2000 CLI (npm install -g t2000)
---

# t2000: Swap Tokens

## Purpose
Execute a token swap through Cetus DEX with on-chain slippage protection.

## Command
```bash
t2000 swap <amount> <from> <to>
t2000 swap <amount> <from> <to> --slippage <percent>

# Examples:
t2000 swap 5 USDC SUI
t2000 swap 100 USDC SUI
t2000 swap 10 USDC SUI --slippage 0.5
```

## Fees
- Protocol fee: 0.1% of the swap amount
- DEX fee: Cetus standard (typically 0.01–0.05%)
- Both shown in the pre-flight preview before execution

## Output
```
Preview:
  Sending:           XX.XX USDC
  Receiving:         ~XX.XX SUI (at current price)
  Protocol fee:      $0.XX USDC (0.1%)
  Slippage tolerance: 1.00%
  Min received:      XX.XX SUI (guaranteed on-chain)

✓ Swapped XX.XX USDC → XX.XX SUI
  Tx: https://suiexplorer.com/tx/0x...
```

## Notes
- Slippage is enforced on-chain via Cetus `sqrt_price_limit` — transaction
  reverts if actual price moves beyond tolerance
- Default slippage: 1%. Reduce for large swaps on thin markets.
- Supported: any Cetus-listed pair (USDC, SUI, USDT, and more)
```

---

### Skill: `t2000-borrow`

```markdown
---
name: t2000-borrow
description: >-
  Borrow USDC against savings collateral on NAVI. Use when asked to take
  out a loan, borrow against deposits, get credit, leverage a position, or
  access liquidity without selling savings. Requires an active savings
  (deposit) position as collateral.
license: MIT
metadata:
  author: t2000
  version: "1.1"
  requires: t2000 CLI (npm install -g t2000)
---

# t2000: Borrow Against Savings

## Purpose
Take a collateralized loan from NAVI using savings deposits as collateral.
Borrowed USDC goes to the available balance. A 0.1% protocol fee applies.

## Command
```bash
t2000 borrow <amount> USDC

# Example:
t2000 borrow 40 USDC
```

## Before borrowing: check limits
```bash
t2000 balance --show-limits
# Returns: maxBorrow, currentHealthFactor, liquidationThreshold
```

## Health factor rules
- Health factor must stay ≥ 1.5 after borrowing (enforced on-chain)
- If borrow would drop HF below 1.5, error includes `safeMaxBorrow`
- Health factor = (collateral value × liquidation threshold) / borrowed value
- HF below 1.0 → position eligible for liquidation on NAVI

## Output
```
✓ Borrowed $XX.XX USDC from NAVI
✓ Protocol fee: $0.XX USDC (0.1%)
✓ Health factor: X.XX (safe above 1.5)
✓ Available balance: $XX.XX USDC
  Tx: https://suiexplorer.com/tx/0x...
```

## Errors
- `BORROW_WOULD_EXCEED_HEALTH_FACTOR`: borrow drops HF below 1.5
  → data includes `safeMaxBorrow`
- `NO_COLLATERAL`: no savings deposited to borrow against
- `BORROW_CAP_REACHED`: NAVI pool borrow cap reached; retry later
```

---

### Skill: `t2000-repay`

```markdown
---
name: t2000-repay
description: >-
  Repay an outstanding loan on NAVI. Use when asked to repay a loan,
  pay back borrowed funds, reduce debt, improve health factor, or close a
  borrow position. Funds are taken from the available (checking) balance.
license: MIT
metadata:
  author: t2000
  version: "1.1"
  requires: t2000 CLI (npm install -g t2000)
---

# t2000: Repay Loan

## Purpose
Return borrowed USDC to NAVI to reduce loan balance and improve health factor.

## Command
```bash
t2000 repay <amount> USDC
t2000 repay all          # repays full outstanding balance including interest

# Examples:
t2000 repay 20 USDC
t2000 repay all
```

## Output
```
✓ Repaid $XX.XX USDC to NAVI
✓ Outstanding loan: $XX.XX USDC (was $XX.XX)
✓ Health factor: X.XX → X.XX
✓ Available balance: $XX.XX USDC
  Tx: https://suiexplorer.com/tx/0x...
```

## Notes
- No protocol fee on repayment
- `repay all` calculates full outstanding principal + accrued interest
  The amount deducted may be slightly more than the original borrow
- Repayment improves health factor immediately
```

---

### Skill: `t2000-pay` *(coming soon — requires Addon B)*

```markdown
---
name: t2000-pay
description: >-
  Pay for an x402-protected API service using the t2000 wallet. Use when an
  API returns a 402 Payment Required response, when asked to "call that paid
  API", "pay for data from", "access the x402 service at", or when fetching
  a resource that requires micropayment. Handles the full x402 handshake
  automatically.
license: MIT
status: coming-soon
metadata:
  author: t2000
  version: "1.1"
  requires: t2000 CLI with x402 addon (npm install -g t2000 && t2000 addon install x402)
  available: false
---

# t2000: Pay for x402 API Service

## Status
⚠️ This skill requires the x402 addon which is not yet released.
Install when available: `t2000 addon install x402`

## Purpose
Make a paid HTTP request to any x402-protected endpoint. Handles the 402
handshake, signs the USDC payment from the available balance, and returns
the API response.

## Command
```bash
t2000 pay <url> [--method GET|POST] [--data '<json>'] [--max-price <amount>]

# Examples:
t2000 pay https://api.example.com/data
t2000 pay https://api.example.com/analyze --method POST --data '{"text":"hello"}'
t2000 pay https://api.example.com/premium --max-price 0.10
```

## Flow (automatic)
1. Makes initial HTTP request to the URL
2. If 402: reads PAYMENT-REQUIRED header for amount and terms
3. If price ≤ --max-price (default: $1.00): signs and broadcasts USDC payment
4. Retries with X-PAYMENT proof header
5. Returns the API response body

## Safety
- If requested price exceeds --max-price, payment is refused (no funds spent)
- Default max-price: $1.00 USDC per request
- Payment only broadcast after 402 terms are validated

## Errors
- `PRICE_EXCEEDS_LIMIT`: API asking more than --max-price
- `INSUFFICIENT_BALANCE`: not enough available USDC
- `UNSUPPORTED_NETWORK`: 402 requires a network other than Sui
```

---

## A.4 README for `t2000/t2000-skills`

```markdown
# t2000 Agent Skills

Agent Skills for the t2000 bank account on Sui. Install once and your AI
agent gains the ability to check balances, send payments, earn yield, swap
tokens, borrow, and pay for x402 API services — all on Sui.

## Install

```bash
npx skills add t2000/t2000-skills
```

Works with Claude Code, OpenAI Codex, GitHub Copilot, Cursor, VS Code, and
any platform supporting the [Agent Skills standard](https://agentskills.io).

## Available Skills

| Skill | Trigger |
|-------|---------|
| `t2000-check-balance` | "check balance", "how much USDC do I have" |
| `t2000-send` | "send 10 USDC to...", "pay X" |
| `t2000-save` | "deposit to savings", "earn yield on..." |
| `t2000-withdraw` | "withdraw from savings", "access my deposits" |
| `t2000-swap` | "swap USDC for SUI", "convert..." |
| `t2000-borrow` | "borrow 40 USDC", "take out a loan" |
| `t2000-repay` | "repay my loan", "pay back..." |
| `t2000-pay` | *(coming soon — x402 addon required)* |

## Prerequisites

```bash
npm install -g t2000
t2000 init
```

## What is t2000?

t2000 is the first bank account for AI agents on Sui — checking (send/receive),
savings (earn yield), credit (borrow), and currency exchange (swap) in one CLI.

[Documentation](https://t2000.ai) | [GitHub](https://github.com/mission69b/t2000)
```

---

## A.5 Build Effort

| Task | Effort |
|------|--------|
| Write 7 core SKILL.md files | 1 day |
| Write README + publish to GitHub | 2 hours |
| Test with Claude Code + verify trigger phrases | 2 hours |
| Write `t2000-pay` skill (ships with Addon B CLI) | 1 hour |
| **Total** | **~2 days** |

**Timeline:** Deliver alongside Week 5. Can be written in parallel with core work.

---

## A.6 New CLI Addition: `t2000 balance --show-limits`

This flag is added to the core spec as a minor addition to support the skills.
It extends `t2000 balance` with safe operating limits computed from the current
position — no separate command needed.

```bash
t2000 balance --show-limits
```

**Additional output:**
```
Limits:
  Max withdraw:   $XX.XX USDC   (safe given current health factor)
  Max borrow:     $XX.XX USDC   (50% LTV, maintains HF ≥ 1.5)
  Health factor:  X.XX          (∞ if no active loan)
```

**JSON output (`--json --show-limits`):**
```json
{
  "available": "68.91",
  "savings": "80.00",
  "gas": { "sui": "0.12", "usdEquiv": "0.42" },
  "loan": "0.00",
  "total": "148.91",
  "limits": {
    "maxWithdraw": "80.00",
    "maxBorrow": "40.00",
    "healthFactor": null
  }
}
```

`healthFactor: null` means no active loan (effectively infinite). Agents should
treat `null` as safe for any withdrawal or borrow up to the stated maximums.

---

---

# ADDON B: x402 Client + Server Support

## B.1 Overview

x402 is the HTTP-native payment protocol for agentic commerce. It uses the
HTTP 402 "Payment Required" status code to enable machine-to-machine
micropayments without accounts, API keys, or subscriptions.

t2000 adds two x402 capabilities:

| Feature | CLI command | Who uses it |
|---------|------------|-------------|
| **x402 Client** (`t2000 pay`) | Consume paid APIs | Agent is the buyer |
| **x402 Server** (`t2000 monetize`) | Expose paid APIs | Agent is the seller |

**Sui x402 gap:** Coinbase's hosted x402 facilitator supports Base and Solana
only. No production Sui x402 facilitator exists. t2000 ships its own, making
it the only x402 implementation on Sui.

**What x402 is NOT:** x402 is the HTTP signaling layer only. The on-chain
settlement layer for Sui is the Sui Payment Kit (confirmed live on mainnet).
These are complementary: x402 handles the HTTP negotiation; Payment Kit handles
the on-chain execution and receipt generation.

## B.2 x402 Protocol Flow

```
Client → GET /api/resource
Server ← 402 Payment Required
         PAYMENT-REQUIRED: {
           amount: "0.01",
           asset: "USDC",
           network: "sui",
           payTo: "0x8b3e...d412",
           nonce: "uuid-v4",          ← UUIDv4, ≤ 36 chars
           expiresAt: 1234567890
         }
Client → calls process_registry_payment via Sui Payment Kit
         nonce + amount + receiver → composite key prevents any replay
         broadcasts transaction, gets txHash
Client → GET /api/resource
         X-PAYMENT: {
           txHash: "0xabc...",
           network: "sui",
           amount: "0.01",
           nonce: "uuid-v4"
         }
Server → POST /x402/verify to api.t2000.ai
Facilitator → fetches tx from Sui RPC
              finds PaymentEvent emitted by Payment Kit
              confirms: amount, receiver, nonce all match
              ← if nonce was already used on-chain: EDuplicatePayment was
                already thrown by Move — transaction never landed
Facilitator ← { verified: true, receiptId: "0x..." }
Server → 200 OK (returns resource)
```

**Key insight on replay prevention:** Because the x402 client uses
`process_registry_payment` (not a plain transfer), duplicate nonces are
rejected by the Move contract before the transaction even lands on-chain.
The facilitator's PostgreSQL nonce table is an **audit log**, not the
primary duplicate guard. This eliminates the race condition noted in the
v1.0 review.

## B.3 Architecture

```
┌─────────────────────────────────────────────────────┐
│  t2000 x402 Components                              │
│                                                     │
│  ┌─────────────┐    ┌──────────────────────────┐   │
│  │ t2000 pay   │    │ t2000 monetize           │   │
│  │ (CLI client)│    │ (CLI server — post-launch│   │
│  └──────┬──────┘    └──────────┬───────────────┘   │
│         │                      │                   │
│  ┌──────▼──────────────────────▼───────────────┐   │
│  │   @t2000/x402  (SDK package)                │   │
│  │   ├── client.ts    (x402 handshake)         │   │
│  │   ├── server.ts    (middleware / paywall)   │   │
│  │   ├── facilitator.ts (Sui tx verification) │   │
│  │   ├── payment-kit.ts (Payment Kit PTB)     │   │
│  │   └── types.ts     (shared types)          │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │  Facilitator (routes on api.t2000.ai server) │   │
│  │  POST /x402/verify  → checks Sui RPC          │   │
│  │  POST /x402/settle  → confirms settlement    │   │
│  │  PostgreSQL    → audit log (not primary dedup│   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

## B.4 Feature 1: x402 Client (`t2000 pay`)

### CLI Specification

```bash
t2000 pay <url> [options]

Options:
  --method <method>       HTTP method: GET, POST, PUT (default: GET)
  --data <json>           Request body for POST/PUT requests
  --header <key=value>    Additional HTTP headers (repeatable)
  --max-price <amount>    Maximum USDC price to auto-approve (default: 1.00)
  --timeout <seconds>     Request timeout (default: 30)
  --json                  Output raw JSON response
  --dry-run               Show what would be paid without paying

Examples:
  t2000 pay https://api.weather.com/forecast
  t2000 pay https://api.data.com/prices --max-price 0.05
  t2000 pay https://api.ai.com/analyze --method POST --data '{"text":"hello"}'
  t2000 pay https://api.news.com/premium --dry-run
```

### SDK: `x402Client`

```typescript
import { x402Client } from '@t2000/x402';

const client = new x402Client(wallet); // T2000 instance

const response = await client.fetch('https://api.example.com/data', {
  maxPrice: 1.00,
  onPayment: (details) => {
    console.log(`Paying ${details.amount} USDC to ${details.payTo}`);
  }
});
// response is a standard fetch Response
```

### Client Implementation Details

**Step 1: Initial request**
```typescript
const initial = await fetch(url, { method, headers, body });
if (initial.status !== 402) return initial;
```

**Step 2: Parse PAYMENT-REQUIRED header**
```typescript
const paymentRequired = parsePaymentRequired(
  initial.headers.get('PAYMENT-REQUIRED')
);
// Validate: network === 'sui'          → else UNSUPPORTED_NETWORK
// Validate: asset === 'USDC'
// Validate: amount ≤ maxPrice          → else PRICE_EXCEEDS_LIMIT
// Validate: expiresAt > Date.now()/1000 → else PAYMENT_EXPIRED
```

**Step 3: Build payment PTB using Sui Payment Kit**

```typescript
// Mainnet Namespace: 0xccd3e4c7802921991cd9ce488c4ca0b51334ba75483702744242284ccf3ae7c2
// PAYMENT_KIT_PACKAGE: 0xbc126f1535fba7d641cb9150ad9eae93b104972586ba20f3c60bfe0e53b69bc6
// T2000_PAYMENT_REGISTRY_ID: 0x4009dd17305ed1b33352b808e9d0e9eb94d09085b2d5ec0f395c5cdfa2271291

const tx = new Transaction();
tx.moveCall({
  target: `${PAYMENT_KIT_PACKAGE}::payment_kit::process_registry_payment`,
  arguments: [
    tx.object(T2000_PAYMENT_REGISTRY_ID),  // t2000's own PaymentRegistry (created at deploy time)
    tx.pure.string(paymentRequired.nonce), // UUIDv4 — Move enforces uniqueness
    tx.pure.u64(usdcToRaw(paymentRequired.amount)),
    tx.object(usdcCoinId),
    tx.pure.option('address', paymentRequired.payTo),
    tx.object('0x6'),                      // Sui clock
  ],
  typeArguments: [USDC_TYPE],
});
const result = await wallet.signAndExecute(tx);
// If nonce was previously used: Move throws EDuplicatePayment → tx fails
// No race condition possible — chain enforces uniqueness atomically
```

**Step 4: Retry with payment proof**
```typescript
const paid = await fetch(url, {
  method,
  headers: {
    ...headers,
    'X-PAYMENT': JSON.stringify({
      txHash: result.digest,
      network: 'sui',
      amount: paymentRequired.amount,
      nonce: paymentRequired.nonce,
    })
  },
  body
});
return paid;
```

### Error Types (x402 Client)

| Error Code | Meaning | Data |
|-----------|---------|------|
| `PRICE_EXCEEDS_LIMIT` | Server asking more than --max-price | `{ requested, limit }` |
| `UNSUPPORTED_NETWORK` | 402 requires non-Sui chain | `{ network }` |
| `PAYMENT_EXPIRED` | 402 challenge expired | `{ expiresAt }` |
| `DUPLICATE_PAYMENT` | Nonce already used — caught by Move before broadcast | `{ nonce }` |
| `INSUFFICIENT_BALANCE` | Not enough USDC | `{ required, available }` |
| `FACILITATOR_REJECTION` | Facilitator returned verified: false | `{ reason }` |

---

## B.5 Feature 2: x402 Server (`t2000 monetize`)

**Post-hackathon priority.** Specced for completeness; implement after March 4.

### CLI Specification

```bash
t2000 monetize [options]

Options:
  --port <port>           Port for the paywall (default: 4402)
  --price <amount>        USDC price per request (required)
  --target <url>          Upstream service to proxy to (required)
  --path <path>           URL path to protect (default: /*)
  --name <n>              Service name shown in 402 response
  --description <text>    Service description for x402 bazaar
  --free-paths <paths>    Comma-separated bypass paths

Examples:
  t2000 monetize --price 0.01 --target http://localhost:8080 --name "Weather API"
  t2000 monetize --price 0.10 --target http://localhost:3000 --path /analyze
  t2000 monetize --price 0.01 --target http://localhost:8080 \
    --free-paths /health,/docs
```

### Middleware SDK

```typescript
import { x402Middleware } from '@t2000/x402';

app.use('/premium', x402Middleware({
  price: '0.01',
  asset: 'USDC',
  network: 'sui',
  payTo: wallet.address(),
  description: 'Premium data endpoint',
  facilitatorUrl: 'https://api.t2000.ai/x402/verify',
}));

app.get('/premium', (req, res) => {
  // Only reached after payment verified by facilitator
  res.json({ data: 'premium content' });
});
```

---

## B.6 t2000 Facilitator Service

### Role and Architecture

The facilitator is a set of routes (`/x402/verify`, `/x402/settle`) on the
existing `api.t2000.ai` Hono server — not a standalone service. x402 servers
call `POST /x402/verify` to confirm a payment landed on-chain before returning
the resource.

**SPOF acknowledgment:** For the hackathon, the facilitator runs as part of the
single ECS server task. This is acceptable. In v2, x402 servers can verify
directly against Sui RPC (the `PaymentEvent` is public) — eliminating the
facilitator entirely for operators who want to self-host. The facilitator is a
convenience layer, not a trust requirement.

### Facilitator API

**`POST /x402/verify`** — Verify a payment before returning a resource

```typescript
// Request
{
  txHash: "0xabc...",
  network: "sui",
  amount: "0.01",       // USDC string
  asset: "USDC",
  payTo: "0x8b3e...d412",
  nonce: "550e8400-e29b-41d4-a716-446655440000",
  expiresAt: 1740000000
}

// Response (success)
{
  verified: true,
  txHash: "0xabc...",
  settledAmount: "0.01",
  settledAt: 1739999900,
  receiptId: "0xreceipt..."   // Payment Kit PaymentReceipt object ID
}

// Response (failure)
{
  verified: false,
  reason: "amount_mismatch" | "wrong_recipient" | "expired"
         | "no_payment_event" | "tx_not_found"
  // Note: "duplicate" is not a valid failure reason here —
  // duplicate nonces are rejected by Move before tx lands on-chain
}
```

**`POST /x402/settle`** — Confirm settlement after resource delivery

```typescript
{ txHash: "0xabc...", nonce: "..." } → { settled: true }
```

### Facilitator Verification Logic

```typescript
async function verify(req: VerifyRequest): Promise<VerifyResponse> {
  // 1. Check expiry
  if (Date.now() / 1000 > req.expiresAt) {
    return { verified: false, reason: 'expired' };
  }

  // 2. Fetch transaction from Sui RPC
  const tx = await suiClient.getTransactionBlock(req.txHash, {
    options: { showEffects: true, showEvents: true }
  });
  if (!tx) return { verified: false, reason: 'tx_not_found' };

  // 3. Find PaymentEvent from Sui Payment Kit
  const receiptEvent = tx.events?.find(e =>
    e.type.includes('payment_kit::PaymentEvent')
  );
  if (!receiptEvent) return { verified: false, reason: 'no_payment_event' };

  // 4. Validate payment fields
  const { amount, receiver, nonce, coin_type } = receiptEvent.parsedJson;
  if (amount !== usdcToRaw(req.amount))  // ← usdcToRaw, not usdcToMist
    return { verified: false, reason: 'amount_mismatch' };
  if (receiver !== req.payTo)
    return { verified: false, reason: 'wrong_recipient' };
  if (nonce !== req.nonce)
    return { verified: false, reason: 'nonce_mismatch' };

  // 5. Log to audit table (not primary dedup — Move already handled that)
  await logVerifiedPayment(req.nonce, req.txHash);

  return {
    verified: true,
    txHash: req.txHash,
    settledAmount: req.amount,
    settledAt: Math.floor(Date.now() / 1000),
    receiptId: receiptEvent.parsedJson.receipt_id,
  };
}
```

**Note on nonce deduplication:** The v1.0 spec had a race condition between
`nonceUsed()` check and `markNonceUsed()`. This is now a non-issue: because
the x402 client uses `process_registry_payment`, Move enforces nonce uniqueness
atomically before the transaction lands on-chain. If a duplicate nonce is
attempted, the Move contract throws `EDuplicatePayment` and the transaction
fails — it never produces a `PaymentEvent`, so the facilitator would return
`no_payment_event`. The PostgreSQL table is an audit log for accounting/analytics,
not a security control.

### Facilitator Infrastructure

| Component | Implementation |
|-----------|---------------|
| Runtime | Node.js / Hono (same pattern as Gas Station) |
| Hosting | Same cloud instance as Gas Station |
| Sui RPC | Mysten Labs public (testnet) / Triton One (mainnet) |
| Audit log | PostgreSQL `x402_payments` table |
| Rate limiting | 100 verifications/minute per IP |

### Facilitator Database Schema

```sql
-- Audit log for verified x402 payments
-- NOT the primary dedup mechanism (Move handles that)
CREATE TABLE x402_payments (
  nonce       TEXT PRIMARY KEY,
  tx_hash     TEXT NOT NULL,
  pay_to      TEXT NOT NULL,
  amount      TEXT NOT NULL,               -- USDC string, e.g. "0.01"
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  settled     BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_x402_payments_expires ON x402_payments (expires_at);
CREATE INDEX idx_x402_payments_pay_to  ON x402_payments (pay_to);
```

---

## B.7 SDK Package Structure

```
packages/
└── x402/                              # @t2000/x402
    ├── src/
    │   ├── client.ts                  # x402Client class
    │   ├── server.ts                  # x402Middleware (Express/Hono)
    │   ├── facilitator.ts             # Facilitator verification logic
    │   ├── payment-kit.ts             # Sui Payment Kit PTB construction
    │   ├── types.ts                   # PaymentRequired, PaymentPayload, etc.
    │   └── index.ts
    ├── package.json
    └── README.md
```

---

## B.8 Timeline & Build Effort

### Week 5 (x402 Client — hackathon target)

| Task | Effort |
|------|--------|
| Confirm Payment Kit package ID from Move.lock or SDK | 1 hour |
| `@t2000/x402` package scaffold + types | 0.5 day |
| x402Client — 402 detection + header parsing | 0.5 day |
| x402Client — Payment Kit PTB construction | 1 day |
| x402Client — retry with X-PAYMENT header | 0.5 day |
| Facilitator service — `/verify` endpoint | 1 day |
| Facilitator database schema + audit log | 0.5 day |
| `t2000 pay` CLI command | 0.5 day |
| `t2000-pay` SKILL.md (enable in Addon A package) | 0.5 day |
| Integration tests (testnet) | 1 day |
| **Total** | **~6 days** |

### Post-Hackathon (x402 Server)

| Task | Effort |
|------|--------|
| `x402Middleware` (Express/Hono) | 1 day |
| `t2000 monetize` CLI command | 0.5 day |
| Facilitator `/settle` endpoint | 0.5 day |
| `t2000-monetize` skill | 0.5 day |
| x402 Bazaar registration | 0.5 day |
| **Total** | **~3 days** |

---

## B.9 Error Taxonomy

All errors follow the core t2000 shape: `{ code, message, data }`.

| Code | Layer | Description |
|------|-------|-------------|
| `PRICE_EXCEEDS_LIMIT` | Client | Server price > agent's maxPrice |
| `UNSUPPORTED_NETWORK` | Client | 402 requires non-Sui chain |
| `PAYMENT_EXPIRED` | Client | 402 challenge expired |
| `DUPLICATE_PAYMENT` | Move (client-side) | EDuplicatePayment — tx rejected on-chain |
| `AMOUNT_MISMATCH` | Facilitator | Payment amount ≠ required amount |
| `WRONG_RECIPIENT` | Facilitator | Payment went to wrong address |
| `NO_PAYMENT_EVENT` | Facilitator | Tx exists but no PaymentEvent found |
| `TX_NOT_FOUND` | Facilitator | Transaction hash not found on Sui |
| `FACILITATOR_TIMEOUT` | Client | Facilitator didn't respond in time |
| `FACILITATOR_REJECTION` | Client | Facilitator returned verified: false |
| `PAYWALL_PRICE_REQUIRED` | Server | `--price` missing from monetize command |
| `PAYWALL_TARGET_REQUIRED` | Server | `--target` missing from monetize command |

---

## B.10 Testing Strategy

### x402 Client Tests

```typescript
describe('parsePaymentRequired', () => {
  it('parses valid PAYMENT-REQUIRED header', () => { ... });
  it('throws UNSUPPORTED_NETWORK for non-Sui', () => { ... });
  it('throws PAYMENT_EXPIRED for past expiresAt', () => { ... });
  it('throws PRICE_EXCEEDS_LIMIT above maxPrice', () => { ... });
});

describe('x402Client (testnet)', () => {
  it('pays for a real x402 endpoint and receives 200 response', async () => {
    const client = new x402Client(testWallet);
    const response = await client.fetch(TEST_PAID_ENDPOINT);
    expect(response.ok).toBe(true);
  });

  it('refuses payment when price exceeds maxPrice', async () => {
    const client = new x402Client(testWallet);
    await expect(
      client.fetch(EXPENSIVE_ENDPOINT, { maxPrice: 0.001 })
    ).rejects.toThrow('PRICE_EXCEEDS_LIMIT');
  });
});
```

### Facilitator Tests

```typescript
describe('facilitator /verify', () => {
  it('verifies a valid Sui payment and returns receiptId', async () => { ... });
  it('rejects expired challenge', async () => { ... });
  it('rejects wrong recipient', async () => { ... });
  it('rejects amount mismatch', async () => { ... });
  it('returns no_payment_event for plain USDC transfer (not Payment Kit)', async () => { ... });
});
```

### End-to-End: Full x402 Flow

```bash
TEST_SERVER=https://x402-testnet.t2000.ai

t2000 pay $TEST_SERVER/data
# → GET https://x402-testnet.t2000.ai/data
# ← 402 Payment Required: $0.001 USDC (Sui)
# ✓ Paid $0.001 USDC (tx: 0xabc...)
# ← 200 OK
# {"message": "payment verified, here is your data"}
```

---

## B.11 Demo Sequence (Hackathon Appendix)

Add to existing Appendix A demo after the core flow:

```bash
# === x402: Pay for an external API ===

$ t2000 balance
Available:  $78.92 USDC
Savings:    $80.00 USDC (4.21% APY)
Gas:        0.12 SUI

$ t2000 pay https://weather.t2000demo.sh/forecast?city=sydney
→ GET https://weather.t2000demo.sh/forecast?city=sydney
← 402 Payment Required: $0.01 USDC (Sui)
✓ Paid $0.01 USDC (tx: 0x9f2c...a801)
← 200 OK

{"city":"Sydney","temp":22,"condition":"partly cloudy"}

$ t2000 balance
Available:  $78.91 USDC   (-$0.01)
Savings:    $80.00 USDC
Gas:        0.12 SUI

# Total time: ~820ms including Sui finality
```

---

## B.12 Positioning

The x402 client + Sui Payment Kit integration + t2000 facilitator makes t2000
the **only x402 implementation on Sui**. This is directly aligned with Mysten
Labs' positioning of Sui as a key chain for agentic commerce and Google's AP2
(co-developed by Mysten).

When x402 server support ships post-hackathon, any t2000 agent can both consume
*and* produce paid API services — completing the agentic commerce loop.

**Hackathon framing:** t2000 is not just a bank account. It is the **economic
runtime for AI agents on Sui** — treasury management, DeFi yield, credit, and
full x402 commerce in one CLI command.

---

## Appendix: Updated Messaging

### Primary tagline
> **t2000 — The first bank account for AI agents.**  
> Checking. Savings. Credit. Currency exchange. In one CLI command.

### Competitive differentiator table

| Feature | Coinbase Agentic Wallet | t2000 |
|---------|------------------------|-------|
| Chain | Base only | Sui |
| Send / receive | ✅ | ✅ |
| Earn yield | ❌ | ✅ NAVI (~4–8% APY) |
| Borrow | ❌ | ✅ Collateralized via NAVI |
| Swap | ✅ Base tokens | ✅ Cetus DEX |
| x402 client | ✅ Base / Solana | ✅ Sui (first on Sui) |
| x402 server | ✅ | ✅ post-hackathon |
| Agent Skills | ✅ | ✅ |
| Gas abstraction | ✅ Gasless (Base) | ✅ Auto-topup (Sui) |
| DeFi composability | ❌ | ✅ Atomic PTB composition |
| Move-level nonce enforcement | — (EIP-3009 replay protection) | ✅ Sui Payment Kit (`EDuplicatePayment` in Move) |
