# audric — Product Roadmap

*Your money, handled.*

*Version 1.0 · April 2026 · Confidential*

## Executive summary

Audric is a conversational banking app built on Sui. Users sign in with Google, get a non-custodial USDC wallet in 3 seconds, and manage their money by chatting. The infrastructure (t2000) is open source and powers the MCP server, SDK, CLI, and MPP pay-per-API gateway.

This roadmap covers the path from 100 beta users to a product people open every day without being asked. The central thesis: Audric must shift from reactive (you ask, it does) to proactive (it watches your money and acts on your behalf). The killer loop is a financial copilot that runs on USDC micropayments from the user's own wallet — costing less per day than a fraction of a cent, funded many times over by the yield it helps generate.

- 100 beta users
- Save, Send, Credit, Swap live (Swap replaced Pay chip in pre-work)
- Receive coming soon
- All reactive — user must ask
- No notification infrastructure
- MPP gateway: 40 services, 88 endpoints
- Chip bar: Save | Send | Swap | Credit | Receive (guided multi-step flows)

- Daily habit via morning briefing + goals
- Proactive agent: HF alerts, yield optimisation, DCA
- Receive: payment links, QR, invoices
- Allowance model: user-funded micropayment features
- Async job queue: video, music, long-form gen
- MPP discovery: consumers know what Pay can do

## Strategic context

### Why not pivot to Web2?

The non-custodial architecture, Sui's 400ms settlement, zkLogin with Google, and USDC micropayments are genuine moats — not technical choices. A Web2 version of Audric is just another neobank competing with Revolut on their home turf. The edge comes from onchain primitives: real yield, trustless custody, and machine-to-machine payments that no Web2 product can replicate.

The goal is to make Audric feel like a consumer app while keeping the blockchain completely invisible. Users should never see a Sui address, a gas fee, or the word 'mainnet'.

### Why Sui?

- 400ms finality — fast enough to feel instant to users

- zkLogin: Google OAuth maps to a deterministic Sui address, no seed phrase

- Enoki gas sponsorship: users never pay gas, Audric absorbs it

- Circle USDC native on Sui, not bridged

- NAVI Protocol: battle-tested lending with real yield (3–8%+ APY)

### The two products inside Audric

Audric has two distinct user types that need different experiences but share the same infrastructure:

**Consumer (audric.ai)**

- Signs in with Google
- Saves, sends, borrows, swaps by chat (or guided chip flows)
- Morning briefings, goals, alerts
- Doesn't know or care about Sui
- Target: anyone with a smartphone

**Developer / agent builder (mpp.t2000.ai)**

- Builds AI agents needing API access
- No API key management
- Pay per request in USDC
- 40 services, 88 endpoints
- Target: AI developers, agent builders

## Feature audit — current state

### Save

- NAVI lending integration: working

- APY display: ✅ Fixed — showing live NAVI rate (~3–8%) via `rates_info` tool

- Save asset: USDC only. ✅ Enforced at SDK level (`assertAllowedAsset`), engine tool descriptions, LLM system prompt, and all UI flows (chips, smart cards, contextual suggestions). `balance.usdc` used everywhere instead of `balance.cash` for save-related amounts.

- Protocol: NAVI only. ProtocolRegistry retained for future multi-protocol support, but single-asset path kept clean

- Pending rewards (NAVX + vSUI/CERT): `claim_rewards` tool already built in engine + SDK. Manual claim working. Next step: auto-compound (Phase 3.1)

### Send

- Contacts system in SDK: working

- Cross-border, sub-second, gas-only fees: working

- Send supports USDC and all Tier 2 assets (SUI, ETH, etc.) — users can transfer any featured token they hold

- Gap: payment memo field — recipients get USDC with no context

- Gap: non-Audric recipients see no explanation of what arrived

### Credit

- NAVI collateralised lending: USDC only. Collateral, borrow, and repay all denominated in USDC — no cross-asset collateral positions

- Borrow APR display: verify — 0.06% may be a per-period rate shown as APR

- Gap: liquidation education — non-crypto users don't know what liquidation means

- Gap: health factor not surfaced prominently enough for new users

### Pay (MPP)

- 40 services, 88 endpoints: working

- Gap: consumer discovery — users don't know what they can ask Audric to do

- Gap: spend tracker — no visibility into API usage costs

- Gap: async services (Suno, Runway, Heygen) blocked by sync-only architecture

### Receive

- Deposit address + QR code: ✅ Live — tapping the Receive chip shows the user's Sui address with a QR code, network label (Sui mainnet), token label (USDC), and step-by-step instructions for depositing from Binance, Coinbase, or any Sui wallet

- Warning: "Only send USDC on the Sui network. Other tokens or networks may result in lost funds."

- Phase 2 expansion: payment links, invoices, AlchemyPay fiat on/off-ramp (see Phase 2 spec below)

- NFC: out of scope — requires native app + payment processor certification

### Swap

- Cetus Aggregator integration: ✅ Live — supports all 13 Tier 2 assets + USDC

- 0.1% overlay fee on output: ✅ Live — sent to treasury address

- Available via LLM chat ("swap 1 USDC to USDT") or guided chip flow (see below)

- Dust filtering: amounts floored (never rounded up) to prevent "insufficient balance" errors

## Chip flows — guided multi-step interactions

The chip bar at the bottom of the dashboard provides guided flows for users who prefer tapping over typing. Each chip follows the same pattern: **select target → select amount → review confirmation → execute**. LLM chat remains available for all the same operations with more flexibility.

**Chip bar:** `Save | Send | Swap | Credit | Receive`

### Save chip flow

```
[Save] → "Save to earn 5.0%. You have $44 USDC available."
       → Amount presets: $5 | $10 | $25 | All $44 | Custom
       → Confirmation card: Deposit $25 USDC · 5.0% APY · Gas Sponsored ✓
       → Execute → Success card with tx link
```

- Amount source: `balance.usdc` (USDC-only — never total cash)
- "All" uses floored USDC balance to prevent insufficient balance errors

### Send chip flow

```
[Send] → "Who do you want to send to?"
       → Address input or contact picker
       → Amount presets based on held balance
       → Confirmation card: Send $10 USDC to 0x... · Gas Sponsored ✓
       → Execute → Success card with tx link
```

### Swap chip flow

```
[Swap] → "What do you want to swap? Select an asset:"
       → Asset picker grid: USDC $44 | GOLD $2.01 | SUI $1.01
       → Auto-selects USDC as target for non-USDC assets (and vice versa)
       → "How much [ASSET] to swap for [TARGET]?"
       → Amount presets: 25% | 50% | 75% | All [amount] | Custom
       → "Change target" link to override auto-selected target
       → Live quote fetched from /api/swap/quote (Cetus Aggregator)
       → Confirmation card: Sell 1.12 SUI · Receive ~1.01 USDC
         Rate · Price impact · Fee 0.1% · Gas Sponsored ✓
       → Execute → Success card with actual received amount from balance changes
```

- Amount presets use dynamic precision: ≥1 → 2dp, ≥0.01 → 4dp, smaller → 8dp
- All amounts floored (never rounded up) to prevent "insufficient balance" on "All"
- Quote refreshes on amount change
- Any Tier 2 ↔ Tier 2 swap supported (not just to/from USDC)

### Credit chip flow

```
[Credit] → "Borrow against your savings. You can borrow up to $12."
         → Amount presets: $1 | $5 | $10 | Max $12 | Custom
         → Confirmation card: Borrow $5 USDC · APR · Health factor preview
           Gas Sponsored ✓
         → Execute → Success card
```

- Max borrow calculated from current savings collateral
- If user has no savings: suggests saving USDC first before borrowing
- Health factor shown in confirmation

### Receive chip flow

```
[Receive] → Deposit address screen:
          → QR code for user's Sui address
          → Network: Sui (mainnet) · Token: USDC
          → Copy address button
          → Step-by-step instructions:
            From Binance: Withdraw → USDC → Sui network → paste address
            From Coinbase: Send → USDC → Sui network → paste address
            From any Sui wallet: Send USDC to address
          → Warning: "Only send USDC on the Sui network"
```

- Phase 2 expansion adds: payment links, invoices, AlchemyPay on/off-ramp
- Currently read-only — no transaction executed

### Contextual chips + smart cards

In addition to the chip bar, the dashboard shows contextual suggestion chips and smart cards based on account state:

- **Idle USDC nudge:** "Save $44 idle — 5.0%" (only when `balance.usdc > 5`)
- **What-if projections:** "What if I save it all?" → agent prompt
- **Rates card:** Shows current USDC savings APY with "Save" button
- **Post-action suggestions:** After balance check, "What if I save it all?"

All contextual chips use `balance.usdc` for save-related amounts, never `balance.cash`.

## The allowance model

Proactive features (morning briefing, alerts, scheduled actions) require Audric to initiate actions on behalf of the user. Because Audric is non-custodial, the user's USDC sits in their zkLogin wallet — Audric cannot push charges. The solution is a pre-authorised spending allowance: the user approves a USDC cap once, and Audric deducts only for features they have explicitly enabled.

This model is crypto-native, transparent, and consumer-friendly. It is not a subscription — the remaining allowance always stays in the user's wallet, features can be toggled off instantly, and the cost is low enough that yield covers it many times over.

### Move contract — allowance.move — ✅ DEPLOYED

> **Deployed:** Fresh deploy on mainnet (`0xd775…968ad`). Scoped allowance with `permitted_features` bitmask, `expires_at`, `daily_limit`, daily spend tracking. 23 Move tests + 24 SDK tests.

The allowance model requires a new Move contract. Because Audric is non-custodial, the user's USDC sits in their zkLogin wallet — Audric cannot push charges when the user is offline. The solution is an on-chain escrow: the user deposits USDC into a shared `Allowance` object, and Audric's admin key can deduct from it for enabled features. The user can withdraw remaining balance at any time.

**Contract spec (`packages/contracts/sources/allowance.move`):**

```
module t2000::allowance;

struct Allowance has key {
    id: UID,
    owner: address,
    balance: Balance<USDC>,
    total_deposited: u64,
    total_spent: u64,
    created_at: u64,
}

public fun deposit(allowance: &mut Allowance, coin: Coin<USDC>)
public fun deduct(allowance: &mut Allowance, admin_cap: &AdminCap, amount: u64, feature: u8)
public fun withdraw(allowance: &mut Allowance, ctx: &mut TxContext) -> Coin<USDC>
public fun balance(allowance: &Allowance): u64
```

**Three functions, type-safe `Balance<USDC>`, no ERC-20 approval footgun.** The `deduct` function is admin-only (requires `AdminCap` from the existing `core.move` module). The `feature` parameter is a u8 tag for analytics (0 = briefing, 1 = alert, 2 = session, etc.).

**Why a Move contract is the right answer:** There is no way to do non-custodial micro-deductions when the user is offline without some form of on-chain escrow. Alternatives considered: (a) sponsored transaction approach — requires user's ephemeral key which expires after session, (b) off-chain ledger with batch settlement — loses non-custodial guarantee, (c) savings yield deduction — only works for users with savings. The Move contract is the simplest, most trustless option.

**Integration:** ECS cron calls `deduct()` via the admin key for each enabled feature charge. The audric web app calls `deposit()` during the onboarding flow. `withdraw()` is available in settings at any time.

### Onboarding flow — full-screen wizard — ✅ DONE

> **Deployed:** Live at `audric.ai/setup`. 4-step wizard with two-tx flow (create → deposit), `useAllowanceStatus` hook (localStorage + prefs API + on-chain RPC), `/new` → `/setup` redirect, Settings budget card with top-up link, top-up mode (skips creation), zero-balance UX (wallet address + copy + skip). SDK 0.23.0 published with `buildCreateAllowanceTx`, `addDepositAllowanceTx`, `getAllowance`.

The allowance onboarding is the single most trust-sensitive UX in the product. It must be a **dedicated full-screen flow** — not a modal, not a chat message, not a bottom sheet. A modal feels like a paywall popup. A chat message feels too casual for a financial commitment. Full-screen communicates "this matters, take a moment."

**Route:** `audric.ai/setup` — shown once after first sign-in when the user has no Allowance object on-chain. Accessible again from Settings > Features > Top Up.

**Trigger:** After auth callback redirects to `/new`, `useAllowanceStatus` hook checks localStorage → `/api/user/preferences` → on-chain RPC. If no allowance and user hasn't skipped, redirect to `/setup`. Skip state persists in localStorage.

```
┌─────────────────────────────────────────────┐
│                                             │
│  Step 1 of 4                    [Skip →]    │
│  ━━━━━━━━━━━━━━━━━━━━━━━░░░░░░░░░░░░░░░░   │
│                                             │
│  Audric can watch your money                │
│  while you sleep.                           │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  ☀️  Morning briefing          $0.005/day│
│  │  Your balance, yield, and one       │    │
│  │  action item — every morning.       │    │
│  ├─────────────────────────────────────┤    │
│  │  📈  USDC rate alerts          $0.002/ea │
│  │  Know when USDC savings rate moves. │    │
│  ├─────────────────────────────────────┤    │
│  │  💸  Payment alerts            $0.001/ea │
│  │  Instant notification when USDC     │    │
│  │  arrives in your wallet.            │    │
│  ├─────────────────────────────────────┤    │
│  │  🛡️  Health factor alerts       FREE    │
│  │  Always on. Liquidation warnings    │    │
│  │  are a safety feature, not premium. │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  [ Continue →                             ] │
│                                             │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│                                             │
│  Step 2 of 4                    [← Back]    │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━░░░░░░░░░░   │
│                                             │
│  You set a spending cap.                    │
│  Audric never exceeds it.                   │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │                                     │    │
│  │  Your USDC sits in a spending cap   │    │
│  │  you control. Audric deducts tiny   │    │
│  │  amounts only for features you      │    │
│  │  turn on. Withdraw the rest any     │    │
│  │  time — it never leaves your        │    │
│  │  control.                           │    │
│  │                                     │    │
│  │  ✓  Not a subscription              │    │
│  │  ✓  Withdraw remaining balance      │    │
│  │     any time in Settings            │    │
│  │  ✓  Toggle features on/off          │    │
│  │     instantly                        │    │
│  │  ✓  Yield on $5K savings covers     │    │
│  │     costs 100x over                 │    │
│  │                                     │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  [ Continue →                             ] │
│                                             │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│                                             │
│  Step 3 of 4                    [← Back]    │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━░░░░░   │
│                                             │
│  Set your features budget.                  │
│                                             │
│         ┌──────────────┐                    │
│         │    $0.50     │ ← large, editable  │
│         └──────────────┘                    │
│                                             │
│    [$0.25]   [$0.50]   [$1.00]   [Custom]   │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  Daily cost      ~$0.008            │    │
│  │  Monthly cost    ~$0.24             │    │
│  │  Lasts           ~62 days           │    │
│  │  Your yield on $500 savings covers  │    │
│  │  this 10x over.                     │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  [ Approve $0.50 →                        ] │
│                                             │
│  This approves a one-time transfer from     │
│  your wallet. You can withdraw the          │
│  remaining balance at any time.             │
│                                             │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│                                             │
│  Step 4 of 4                                │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│                                             │
│  ✓ You're all set.                          │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  Features budget     $0.50          │    │
│  │  Features enabled    3              │    │
│  │  First briefing      Tomorrow 8am   │    │
│  │  Estimated duration  ~62 days       │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ☀️  Morning briefing         ON            │
│  📈  USDC rate alerts         ON            │
│  💸  Payment alerts           ON            │
│  🛡️  Health factor alerts    Always ON     │
│                                             │
│  [ Start using Audric →                   ] │
│                                             │
│  Manage anytime in Settings > Features.     │
│                                             │
└─────────────────────────────────────────────┘
```

**Implementation (shipped):**

- Route: `audric.ai/setup` — `app/setup/page.tsx`, protected by `AuthGuard`
- State: local React state for step progression, no server round-trips between steps
- Two-tx flow: Step 3 calls `allowance-create` (via `/api/transactions/prepare` + `/api/transactions/execute`), extracts allowance ID from `objectChanges`, then calls `allowance-deposit` with the ID. Top-up mode skips creation
- `useAllowanceStatus` hook: checks localStorage → `/api/user/preferences` → on-chain RPC (`getObject`). Inlined RPC query to avoid pulling SDK server-only deps (`@naviprotocol/lending` → `node:buffer`) into the client bundle
- `flowType` state locked at mount (`'setup'` or `'topup'`) so step 4 heading doesn't flip when `setAllowanceId` is called mid-flow
- Zero-balance UX: if wallet USDC < selected budget, shows warning with wallet address (copyable) + "Skip for now" link. Approve button disabled
- Top-up mode: Settings > Features "Top Up" link → `/setup` starts at step 3 with "Cancel" (→ `/settings`) instead of "Back"
- Race condition fix: hook keeps `loading=true` until `fetchStatus` completes with a real address — prevents premature redirect on `/new` when `useZkLogin()` resolves `address` asynchronously

**Critical UX rules (all followed in implementation):**

- Never show raw USDC decimals (show "$0.50" not "500000")
- Never use the word "contract" — frame as "spending cap you control"
- Never show Sui addresses or transaction hashes during onboarding (exception: zero-balance state shows wallet address for receiving USDC)
- The progress bar is continuous, not segmented — feels like one smooth flow
- Back button on Steps 2-3, skip only on Step 1 — once they start, guide them forward
- Pre-select $0.50 on Step 3 — don't make the user choose from scratch

### Feature pricing

|                            |                 |               |                             |
|----------------------------|-----------------|---------------|-----------------------------|
| **Feature**                | **Cost**        | **Delivery**  | **Notes**                   |
| Morning briefing           | \$0.005 / day   | MPP → Resend  | 8am user timezone, ECS cron |
| USDC rate alerts           | \$0.002 / alert | MPP → Resend  | NAVI USDC rate monitoring   |
| Payment received alert     | \$0.001 / alert | Direct Resend | Indexer detection, urgent   |
| Scheduled action reminders | \$0.001 / run   | MPP → Resend  | Night-before confirmation   |
| Health factor alerts       | Free            | Direct Resend | Always on, non-custodial    |

Health factor alerts are always free and always on. Liquidation protection is a safety feature, not a premium one — charging for it would be the wrong signal entirely.

### Notification routing

|                                              |                               |              |
|----------------------------------------------|-------------------------------|--------------|
| **Trigger**                                  | **Method**                    | **Priority** |
| Health factor critical / liquidation risk    | Direct Resend from ECS        | **URGENT**   |
| Morning briefing, yield alerts, job complete | Via MPP gateway (Resend)      | **ASYNC OK** |
| Inbound USDC received                        | Indexer event → direct Resend | **URGENT**   |
| Scheduled action reminder                    | Via MPP gateway (Resend)      | **ASYNC OK** |
| Allowance running low                        | Direct Resend from ECS        | **ASYNC OK** |

Urgent notifications (health factor, inbound payments) bypass MPP and call Resend directly from ECS — zero latency. Non-urgent notifications route via MPP gateway, dogfooding the product's own micropayment infrastructure.

## Pre-work — ✅ COMPLETE (10/10)

|                                                    |
|----------------------------------------------------|
| > ~4 days | foundation for everything that follows |
| > **Status:** All 10 items complete. Allowance top-up (0.8) deferred to Phase 1 but all other pre-work shipped. |
| > **Releases:** t2000 v0.26.2 (SDK 0.22.3, Engine 0.7.6). Audric deployed with USDC-only enforcement, Swap chip, dust filtering, financial amount safety (flooring), and Cursor rules. |

### 0.1 Conversation logging

Add one DB write per engine turn to the SSE handler. Every day without this is fine-tuning data permanently lost. With 100 users at daily use, you will have thousands of real financial conversations within weeks — enough to fine-tune a domain-specific model by Q3.

**Schema — ConversationLog table (NeonDB, audric web app DB)**

- userId, sessionId, role (user | assistant)

- content (text), toolCalls (JSON)

- tokensUsed, costUsd

- createdAt

Effort: ~2 hours

### 0.2 Strip multi-asset save/borrow — USDC-only financial layer ✅

USDC-only enforcement is live at every layer: SDK (`assertAllowedAsset` rejects non-USDC with `INVALID_ASSET` error), engine tool descriptions (forbid auto-chain swap+deposit), LLM system prompt (explicit USDC-only savings section), and UI (all save flows use `balance.usdc`, contextual chips/smart cards reference idle USDC only).

**What to change:**

- `packages/sdk/src/t2000.ts`: `save()` — remove `asset` parameter, hardcode USDC. Add guard: reject non-USDC with `INVALID_ASSET` error
- `packages/sdk/src/t2000.ts`: `borrow()` — already hardcodes `asset = 'USDC'`, verify and add explicit guard
- `packages/engine/src/tools/save.ts`: remove `asset` from zod schema, hardcode USDC
- `packages/engine/src/tools/withdraw.ts`: same treatment
- `audric/apps/web/app/api/transactions/prepare/route.ts`: remove `asset` from prepare payload, always USDC
- Existing multi-asset NAVI positions (USDe, SUI, USDsui) stay untouched — users can still withdraw them. Only **new** save/borrow operations are USDC-only. ✅ Enforced at SDK level with `assertAllowedAsset()`

Effort: ~3 hours

### 0.3 Add User table to Prisma

Multiple Phase 1+ features depend on a `User` table that does not exist. Currently the Prisma schema only has `UserPreferences`. The notification system, savings goals, scheduled actions, allowance model, and email delivery all need a proper user record.

**Schema — User table (NeonDB, audric web app DB)**

- id (cuid), suiAddress (unique), email (nullable, unique), emailVerified (boolean, default false)
- displayName (nullable), timezoneOffset (int, default 0) — for notification scheduling
- onboardedAt (nullable datetime) — tracks first-run completion
- createdAt, updatedAt

**Relation:** `UserPreferences.userId` → `User.id`

Effort: ~2 hours

### 0.4 Email capture + verification for notifications

No notification feature works without a verified email address. Add email capture to the post-login flow. Store in the new `User.email` field. Required before Phase 1 notifications can ship.

**Trigger:** After first successful sign-in via zkLogin, when `User.email` is null. Also accessible from Settings > Account > Email.

**Capture modal — full spec:**

```
┌─────────────────────────────────────┐
│                                     │
│   Get a morning briefing of         │
│   your finances.                    │
│                                     │
│   Audric sends a daily summary      │
│   of your balance, yield earned,    │
│   and one action item — straight    │
│   to your inbox.                    │
│                                     │
│   ┌─────────────────────────────┐   │
│   │  Email address              │   │
│   │  jane@example.com           │   │
│   └─────────────────────────────┘   │
│                                     │
│   [ Continue →                    ] │
│                                     │
│   Skip — I'll add this later        │
│                                     │
└─────────────────────────────────────┘

        ↓ After "Continue"

┌─────────────────────────────────────┐
│                                     │
│   Check your inbox.                 │
│                                     │
│   We sent a verification link to    │
│   jane@example.com                  │
│                                     │
│   ●●● (animated dots)              │
│   Waiting for verification...       │
│                                     │
│   Didn't receive it?                │
│   [Resend email]  [Change email]    │
│                                     │
│   Skip — I'll verify later          │
│                                     │
└─────────────────────────────────────┘

        ↓ After click in email

┌─────────────────────────────────────┐
│                                     │
│   ✓ Email verified.                 │
│                                     │
│   You'll receive your first         │
│   morning briefing tomorrow at      │
│   8am.                              │
│                                     │
│   [ Continue to dashboard →       ] │
│                                     │
└─────────────────────────────────────┘
```

**Verification flow:**

1. Client sends email to `POST /api/user/email` — validates format, stores in `User.email` with `emailVerified: false`, generates a `verificationToken` (nanoid, 32 chars), stores in `User.emailVerifyToken` with `emailVerifyExpiry` (24 hours)
2. Server sends verification email via Resend with link: `audric.ai/verify?token=xxx`
3. `app/verify/page.tsx` — reads token from query param, calls `POST /api/user/verify-email`, sets `emailVerified: true`, clears token
4. The capture modal polls `GET /api/user/email-status` every 3 seconds. When `emailVerified: true`, auto-transitions to the "verified" state — the user sees it update in real-time without refreshing
5. If the user closes the modal and verifies later (e.g., on their phone), the next time they open the app the `useUser` hook picks up `emailVerified: true` and never shows the modal again

**Edge cases:**

- Token expired: verification page shows "This link has expired" with a "Send new link" button
- Wrong email: "Change email" link on the waiting screen loops back to the input field, invalidates old token
- Resend cooldown: 60-second cooldown on "Resend email" button (client-side timer + server-side rate limit)
- Already verified: if user already has verified email, skip modal entirely — checked via `useUser()` hook
- Cross-device: user opens verification link on phone → works fine, desktop modal auto-detects via polling
- Unauthenticated verify click: `/verify` page works without auth (token is the auth), then redirects to sign-in

Effort: ~4 hours

### 0.5 Asset architecture — token-registry.ts update

The USDC-only financial layer and two-tier asset model must be implemented in the token registry before any feature work begins. This is the foundation that makes the operation matrix enforceable in code.

**What to change in `packages/sdk/src/token-registry.ts`:**

- Add `tier: 1 | 2` to `CoinMeta` interface. Only Tier 1 and Tier 2 tokens exist in the registry
- USDC: `tier: 1`
- 13 swap assets (SUI, BTC, ETH, GOLD, DEEP, WAL, NS, IKA, CETUS, NAVX, vSUI, LOFI, MANIFEST): `tier: 2`
- Remove all other tokens from the registry entirely. Tokens not in the registry do not exist in Audric
- Export helpers: `isTier1(coinType)`, `isSupported(coinType)`
- Portfolio UI: show all registry tokens. Unknown tokens are invisible

**Canonical coin type table:** see Asset architecture section below for full list.

Effort: ~3 hours

### 0.6 Fix savings APY display — root cause

The savings and credit pages show incorrect APY (e.g. 0.05% instead of 5%).

**Root cause:** `formatRate()` in `audric/apps/web/lib/product-stats.ts` displays the raw decimal without multiplying by 100. NAVI returns rates as decimals (0.05 = 5%), but `rate.toFixed(2)` renders `"0.05%"`. The same bug appears in `ToolResultCard.tsx` yield pool display: `p.apy.toFixed(2)%`.

**Fix approach:**

1. Verify the exact format from `registry.allRatesAcrossAssets()` — confirm whether NAVI returns 0.05 or 5.0 for 5%
2. Fix `formatRate()` accordingly — likely `(rate * 100).toFixed(2)%`
3. Fix `ToolResultCard.tsx` yield pool display with the same conversion
4. For static marketing pages (`/savings`, `/credit`): use ISR with 5-minute revalidation to pull live rates. Fallback to hardcoded sensible defaults (“~5% APY”, “~6% APR”) if the API call fails — better to show approximate truth than broken decimals

Effort: ~1 hour

### 0.7 Add swap fee via Cetus Overlay Fee

The swap fee is the highest-priority missing revenue stream. Instead of modifying the swap PTB with `treasury::collect_fee`, use the **Cetus Aggregator Overlay Fee** — a built-in SDK feature that automatically deducts a configurable percentage from swap output and sends it directly to a receiver address. Zero PTB changes, zero Move contract changes.

**Implementation — 2 lines in `packages/sdk/src/protocols/cetus-swap.ts`:**

```typescript
clientInstance = new AggregatorClient({
  signer: walletAddress,
  env: Env.Mainnet,
  overlayFeeRate: 0.001,               // 0.1% on output
  overlayFeeReceiver: TREASURY_ADDRESS, // admin wallet
});
```

**Why this is better than PTB collect_fee injection:**

- Works automatically for ALL swap paths — multi-hop, split routes, single-pool
- Slippage calculation already accounts for the fee (built into Cetus pre-calculation)
- No Move contract changes needed
- Fee is deducted from output amount — user sees slightly less output than raw quote
- Maximum configurable threshold is 1% (we use 0.1%)

**Fee collection:** Set `overlayFeeReceiver` to the admin wallet. Periodically sweep accumulated fees into the treasury contract via `receive_coins()` for on-chain tracking, or simply track revenue from the receiver address balance.

**Applies automatically** to all swap paths: manual swaps via chat (LLM + chip flow), DCA executions, and auto-compound NAVX→USDC swaps — all use the same `AggregatorClient` instance.

**Disclosure:** Add one line to terms of service: “Audric charges a 0.1% platform fee on all swaps”

Effort: ~30 minutes (✅ DONE — live in SDK + Audric)

### 0.8 Allowance top-up flow

When the user’s allowance balance drops below \$0.05 (roughly 10 days of daily briefings), Audric sends a single top-up prompt. This is the most churn-sensitive moment in the allowance model — if the top-up experience is confusing or slow, users disable features rather than refill. The flow must be one tap.

- Trigger: ECS cron checks allowance balance after each deduction. If remaining < \$0.05, fire once-only top-up notification

- Flag: set `AllowanceTopUpSent: true` on User record when notification fires. Do not send again until user either tops up or 48 hours pass (reset flag after 48hr to allow one re-send)

- Grace period: features continue working for 48 hours after the low-balance notification. Do not cut off mid-morning-briefing — abrupt loss of features causes churn faster than a gentle nudge

- Email template: “Your Audric features budget is running low (\$0.03 remaining). Top up \$0.50 to keep your morning briefing, alerts, and savings running — takes 2 seconds.”

- Deep link: email CTA links directly to `audric.ai/settings/allowance?topup=0.50` which pre-fills the deposit flow. One tap confirm

- If user ignores both notifications (48hr apart), features pause silently. No third notification. When user next opens the app, show an inline banner: “Your features are paused — top up to resume”

- Never frame as “you ran out of money” — frame as “your features budget needs a top-up”

Effort: ~2 hours

### 0.9 Settings page architecture

The current settings is a right-hand slide-over panel (`SettingsPanel.tsx`). By Phase 1, the product adds: allowance balance/top-up, notification preferences per feature, auto-compound toggle, DCA schedule management, daily API budget, timezone, email management, marketplace suggestion toggle, and savings goals. That's 15+ controls — far too many for a narrow drawer.

**Solution:** Migrate to a proper `/settings` route with section-based navigation. The slide-over panel becomes a "quick settings" shortcut that links to the full page.

**Route:** `audric.ai/settings` — protected by `AuthGuard`

```
┌─────────────────────────────────────────────────────┐
│  ← Back to chat                    Settings         │
│                                                     │
│  ┌──────────────┐  ┌────────────────────────────┐   │
│  │              │  │                            │   │
│  │  Account  ●  │  │  Account                   │   │
│  │  Features    │  │                            │   │
│  │  Safety      │  │  Email                     │   │
│  │  Contacts    │  │  jane@example.com  ✓       │   │
│  │  Sessions    │  │  [Change]                  │   │
│  │              │  │                            │   │
│  │              │  │  Timezone                  │   │
│  │              │  │  UTC+10 (Sydney)  [Edit]   │   │
│  │              │  │                            │   │
│  │              │  │  Wallet address             │   │
│  │              │  │  0x7f20...f6dc  [Copy]     │   │
│  │              │  │                            │   │
│  │              │  │  Sign-in session            │   │
│  │              │  │  Expires in 47 minutes      │   │
│  │              │  │  [Refresh] [Sign out]       │   │
│  │              │  │                            │   │
│  └──────────────┘  └────────────────────────────┘   │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  ← Back to chat                    Settings         │
│                                                     │
│  ┌──────────────┐  ┌────────────────────────────┐   │
│  │              │  │                            │   │
│  │  Account     │  │  Features                  │   │
│  │  Features ●  │  │                            │   │
│  │  Safety      │  │  Features budget           │   │
│  │  Contacts    │  │  ┌──────────────────────┐  │   │
│  │  Sessions    │  │  │  $0.42 remaining     │  │   │
│  │              │  │  │  ████████░░  ~52 days│  │   │
│  │              │  │  │  [Top up $0.50]      │  │   │
│  │              │  │  └──────────────────────┘  │   │
│  │              │  │                            │   │
│  │              │  │  Active features            │   │
│  │              │  │  ☀️ Morning briefing   [ON] │   │
│  │              │  │  📈 USDC rate alerts   [ON] │   │
│  │              │  │  💸 Payment alerts     [ON] │   │
│  │              │  │  ⏰ DCA / scheduled   [ON] │   │
│  │              │  │  🛡️ Health alerts   Always  │   │
│  │              │  │  🛒 Recommendations   [OFF]│   │
│  │              │  │                            │   │
│  │              │  │  Auto-compound rewards      │   │
│  │              │  │  [ON] Claim NAVX + vSUI    │   │
│  │              │  │  and re-deposit as USDC     │   │
│  │              │  │                            │   │
│  │              │  │  [Withdraw all remaining]   │   │
│  │              │  │                            │   │
│  └──────────────┘  └────────────────────────────┘   │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  ← Back to chat                    Settings         │
│                                                     │
│  ┌──────────────┐  ┌────────────────────────────┐   │
│  │              │  │                            │   │
│  │  Account     │  │  Safety                    │   │
│  │  Features    │  │                            │   │
│  │  Safety   ●  │  │  Transaction limits         │   │
│  │  Contacts    │  │  Max per transaction  $500  │   │
│  │  Sessions    │  │  Daily limit         $2,000 │   │
│  │              │  │  Agent budget         $100  │   │
│  │              │  │                            │   │
│  │              │  │  Daily API budget           │   │
│  │              │  │  $0.50 / day  [Edit]        │   │
│  │              │  │  Used today: $0.08          │   │
│  │              │  │                            │   │
│  └──────────────┘  └────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

**Two budget concepts — important distinction:**

| Budget | Purpose | Where it lives | Scope |
|--------|---------|-----------------|-------|
| **Features budget** (allowance) | Pays for proactive features: briefings, alerts, DCA, AI sessions | On-chain `Allowance` contract (USDC escrow) | $0.25–$1.00, lasts weeks–months |
| **Agent budget** (auto-approve) | Max USDC value Audric can auto-approve per transaction without user confirmation | Client-side preference in `UserPreferences` | e.g., $5 — transactions above this require manual confirm |

These are deliberately separate. The features budget is a pre-funded pool for micro-charges. The agent budget is a safety threshold for how much the LLM can spend in a single action without asking. Both appear in Settings but under different sections (Features vs Safety) to avoid confusion.

**Mobile:** On mobile (<640px), the left nav collapses into a horizontal tab bar at the top: `Account | Features | Safety | Contacts | Sessions`. Each tab scrolls the right panel to the relevant section. Single column layout.

**Migration path:** In pre-work, scaffold the `/settings` route with Account section only (email, address, session). The slide-over panel stays but becomes a shortcut — "Settings" link at the bottom opens `/settings`. Feature toggles, allowance, and safety sections are added incrementally as their features ship in Phase 1-3.

Effort: ~3 hours (scaffold route + migrate Account section, rest added incrementally per phase)

### 0.10 Error boundaries + route loading states

The app has no `error.tsx` or `global-error.tsx` — an unhandled exception shows a blank white screen. There's also no `loading.tsx` for route transitions. With 100 beta users these silent failures destroy confidence.

**What to add:**

- `app/error.tsx` — catch-all error boundary with friendly message and retry button
- `app/global-error.tsx` — catches root layout errors (required by Next.js as separate file)
- `app/loading.tsx` — route-level suspense fallback with the Audric mark + subtle pulse animation
- `app/new/loading.tsx` — dashboard-specific loading with balance skeleton + feed skeleton
- `app/settings/loading.tsx` — settings-specific loading skeleton

```
┌─────────────────────────────────────┐
│                                     │
│                                     │
│           ◉  (Audric mark)          │
│          pulse animation            │
│                                     │
│     Loading your finances...        │
│                                     │
│                                     │
└─────────────────────────────────────┘
         app/loading.tsx

┌─────────────────────────────────────┐
│                                     │
│                                     │
│          Something broke.           │
│                                     │
│   We hit an unexpected error.       │
│   Your funds are safe — this is     │
│   a display issue only.             │
│                                     │
│        [ Try again ]                │
│        [ Go to dashboard ]          │
│                                     │
│                                     │
└─────────────────────────────────────┘
         app/error.tsx
```

**Critical copy rule for error.tsx:** Always reassure that funds are safe. The first thing a user thinks when a finance app crashes is "is my money gone?" — answer that immediately.

Effort: ~1 hour

---

## Phase 1 — Daily habit loop

> ~2 weeks | Retention foundation

Everything proactive depends on the notification infrastructure built in this phase. Build it once here — it powers every alert, briefing, and scheduled action that follows. The morning briefing is the forcing function that makes you build the backbone.

**Hard blocker: `allowance.move` contract.** ✅ DEPLOYED — fresh deploy with scoped allowance on mainnet (`0xd775…968ad`). **Onboarding wizard** ✅ DONE — live at `audric.ai/setup`, SDK 0.23.0 published. Paid features are now unblocked. Notification infrastructure (1.1), health factor alerts (1.2, free), activity feed (1.6), and CostTracker are all done. **Week 1 complete.** Morning briefing (1.3) + deep links (1.3.1) are done. **Next: 1.4 (savings goals).**

### 1.1 Notification infrastructure — ✅ DONE

- ECS cron scheduler (EventBridge rules on existing Fargate cluster) ✅

- Single hourly EventBridge cron (not per-user). Handler queries NeonDB for users whose `timezoneOffset` maps to 8am local time at the current UTC hour. Batches notifications in a single execution. Scales to 100K+ users without additional cron rules ✅

- Resend direct client in ECS server for urgent notifications ✅

- MPP gateway Resend routing for async notifications

- NotificationPrefs + NotificationLog tables in NeonDB ✅

- Settings UI toggles (hf_alert, briefing, rate_alert) ✅

- Internal API auth (`T2000_INTERNAL_KEY`) between t2000 ECS and audric Vercel ✅

- `CRON_OVERRIDE_HOUR` env var for manual testing ✅

Effort: 3 days

### 1.2 Health factor alerts — ✅ DONE (shipped with 1.1)

- Indexer HF hook: real-time critical alerts via `POST /api/internal/hf-alert` on audric ✅

- Cron batch: hourly warn-level alerts via `getFinancialSummary()` + direct Resend from ECS ✅

- Alert deduplication: 30min for critical, 4h for warn ✅

- Email templates: plain English explanation of what HF means and what to do (both warn + critical) ✅

- Deep link to `/action?type=repay` in both email templates ✅

- Settings UI toggle for `hf_alert` ✅

Effort: 2 days (shipped as part of 1.1)

### 1.3 Morning briefing — email + in-app card ✅

**Status:** Shipped. ECS cron `runBriefings()` live. DailyBriefing table, BriefingCard, deep link system deployed. First paid feature ($0.005/day via allowance deduct).

Single hourly ECS cron fires for all users whose timezone maps to 8am at the current UTC hour. Queries: yesterday's USDC yield earned, current NAVI USDC APY, health factor if the user has debt, idle USDC balance, one suggested action. 40 words maximum. Sent via MPP Resend (user's allowance pays).

- Template: 'Good morning. Your savings earned \$X yesterday. Current APY: Y%. \[One action if applicable.\]'

- Only sends if user has a balance — no empty briefings

- Respect opt-out: if user turns off in settings, cron skips them

- Source data: balance_check + rates_info + savings_info tools (already in engine)

- **No-savings variant:** If user has idle USDC but no savings, the briefing shifts from "earned $X overnight" to "You have $44 idle USDC. Save it to start earning 5.0% APY." — the briefing is always useful, never an empty report

**In-app briefing card:**

The morning briefing isn't just an email — it must also appear in-app. When the user opens Audric after their daily briefing was generated, show it as a pinned card at the top of the feed. This serves users who don't check email, and makes the app feel alive.

```
┌─────────────────────────────────────────────┐
│  ☀️  Morning Briefing · Apr 6             × │
│                                             │
│  ┌─────────────┐ ┌─────────────────────┐    │
│  │ Earned      │ │ USDC Savings APY    │    │
│  │ $0.27       │ │ 5.00%               │    │
│  │ yesterday   │ │                     │    │
│  └─────────────┘ └─────────────────────┘    │
│                                             │
│  Your $500 USDC savings earned $0.27        │
│  overnight at 5.00% APY. You have $44       │
│  idle USDC — saving it would add ~$0.006    │
│  per day.                                   │
│                                             │
│  ┌──────────────────────┐                   │
│  │  Save idle USDC →   │  ← one-tap CTA    │
│  └──────────────────────┘                   │
│                                             │
│  [Dismiss]        [View full report →]      │
│                                             │
└─────────────────────────────────────────────┘
```

**Implementation:**

- ECS cron generates briefing data and stores it in a `DailyBriefing` table: `userId`, `date`, `content (JSON)`, `emailSentAt`, `dismissedAt`
- `GET /api/user/briefing` returns today's briefing if not dismissed
- `useOvernightBriefing()` hook fetches on mount. If exists and not dismissed, render `BriefingCard` pinned above the feed
- Dismissing sets `dismissedAt` via `POST /api/user/briefing/dismiss`
- "View full report" sends "Give me my daily briefing" to the engine — triggers the `WEEKLY REPORT` action chip flow with today's data
- One-tap CTA is context-dependent (USDC-only logic): if idle USDC > $5, show "Save idle USDC"; if savings goal is behind, show "Deposit $X to catch up"; if health factor < 2, show "Repay debt"; otherwise omit CTA

**Email template:**

```
Subject: ☀️ Your $0.27 overnight — Apr 6

Your USDC savings earned $0.27 overnight.

  USDC savings: $500.00 at 5.00% APY

You have $44 idle USDC. Saving it would
add ~$0.006 per day.
→ Save idle USDC (one tap)

— Audric
```

- Email CTA links to `audric.ai/action?type=save&amount=44` (deep link system, see 1.3.1 below)
- Plain text email, no HTML templates — clean, fast, trustworthy. HTML templates look like marketing spam
- Unsubscribe footer: "Turn off in Settings" — links to `audric.ai/settings?section=features`

Effort: 3 days

### 1.3.1 Deep link action system ✅

**Status:** Shipped. `/action` page routes save/repay/briefing/topup. `/new?prefill=` auto-sends to engine. `/settings?section=` deep links to features tab.

Every email CTA and notification needs to open the app in the right state and trigger the right action. Without a deep link system, users click "Save idle USDC" in an email and land on an empty dashboard with no context. This is the plumbing that makes one-tap email actions work.

**URL scheme:** `audric.ai/action?type=<action>&<params>`

| Deep link | Action | Opens as |
|-----------|--------|----------|
| `/action?type=save&amount=50` | Quick save | Pre-fills chat with "Save $50 USDC" |
| `/action?type=topup&amount=0.50` | Allowance top-up | Opens Settings > Features with top-up pre-filled |
| `/action?type=goal&id=xxx&deposit=50` | Goal deposit | Pre-fills chat with "Save $50 toward [goal name]" |
| `/action?type=briefing` | View today's briefing | Opens dashboard, scrolls to briefing card |
| `/action?type=repay&amount=100` | Repay debt | Pre-fills chat with "Repay $100" |
| `/action?type=cancel-dca&id=xxx` | Cancel scheduled action | Opens Settings > Schedules with cancel confirmation |
| `/settings?section=features` | Feature settings | Opens Settings on Features tab |

**Implementation:**

- `app/action/page.tsx` — reads query params, redirects to `/new` with `?prefill=<encoded message>` or to `/settings` with section param
- If user is not authenticated: redirect to sign-in, then complete the action after auth callback
- The `prefill` param on `/new` auto-populates the chat input and auto-sends — the user sees the engine processing immediately on load
- Track deep link clicks in analytics: `deepLinkType`, `source` (email/notification/share)

**Security:** Action links don't execute anything directly — they only pre-fill prompts. The user still sees the confirmation card for any write action. No way to move funds via URL alone.

Effort: 1 day (simple routing page, shares infra with auth callback pattern)

### 1.4 Savings goals — chat + management UI

Users set a USDC savings target and optional deadline via chat or a goals screen. Audric tracks progress against USDC savings balance and includes it in the morning briefing. Milestones (25%, 50%, 75%, 100%) trigger a celebratory email. Makes passive USDC savings emotionally engaging.

- SavingsGoal table: userId, name, targetAmount, deadline, createdAt

- Progress computed at briefing time from current savings balance

- Chat: 'Save \$500 for a trip by August' creates a goal automatically

- Morning briefing addition: 'Tokyo fund: \$312 of \$500 — 3 days ahead of schedule'

**Goals management — accessible from Settings > Savings Goals or via "My goals" action chip:**

Goals need a persistent visual presence beyond chat. When the user sets a goal via conversation, it should also appear in a dedicated management view. This prevents the "I set a goal but forgot about it" problem.

```
┌─────────────────────────────────────────────┐
│  ← Back                 Savings Goals       │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  🏖️  Tokyo trip                     │    │
│  │                                     │    │
│  │  $312 of $500           62%         │    │
│  │  ██████████████░░░░░░░░             │    │
│  │                                     │    │
│  │  Deadline: Aug 15 · 3 days ahead    │    │
│  │  Earning: $0.04/day at 5.00% APY    │    │
│  │                                     │    │
│  │  [Save $50 USDC →]    [Edit] [···]  │    │
│  │                                     │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  🎧  New headphones                 │    │
│  │                                     │    │
│  │  $89 of $350            25%         │    │
│  │  ██████░░░░░░░░░░░░░░░░             │    │
│  │                                     │    │
│  │  No deadline · $89 USDC saved       │    │
│  │  Earning: $0.01/day at 5.00% APY    │    │
│  │                                     │    │
│  │  [Save $25 USDC →]    [Edit] [···]  │    │
│  │                                     │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐    │
│  │  + Set a new savings goal          │    │
│  │  "Save $500 for a trip by August"  │    │
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘    │
│                                             │
└─────────────────────────────────────────────┘
```

**Interaction model:**

- "Save $50 USDC" on a goal card sends the message to the engine with the goal context — goes through the normal USDC save flow with one confirmation
- "Edit" opens an inline editor for name, target, deadline
- "..." menu: Delete goal, Share progress (future Phase 5 social feature)
- "Set a new savings goal" taps open the chat with a pre-filled prompt
- Progress bars use the app's accent color and animate on changes
- When a goal reaches 100%, the card transforms into a celebratory state with confetti animation and "Goal reached!" header. The card stays for 7 days before auto-archiving

**Empty state** (no goals set):

```
┌─────────────────────────────────────────────┐
│  ← Back                 Savings Goals       │
│                                             │
│                                             │
│        🎯                                   │
│                                             │
│   Save with a purpose.                      │
│                                             │
│   Set a goal and Audric tracks your         │
│   progress in every morning briefing.       │
│                                             │
│   [ "Save $500 for a trip by August" →  ]   │
│                                             │
│                                             │
└─────────────────────────────────────────────┘
```

**Milestone notifications:**

| Milestone | Email subject | In-app |
|-----------|-------------|--------|
| 25% | "Tokyo trip: quarter of the way there" | Feed card with progress ring |
| 50% | "Tokyo trip: halfway!" | Feed card + confetti burst |
| 75% | "Tokyo trip: almost there" | Feed card with progress ring |
| 100% | "Tokyo trip: goal reached!" | Full celebration card |

Effort: 3 days

### 1.5 New user onboarding — meet your copilot

Users who sign up receive \$0.25 USDC sponsored from the Sponsor address managed by the ECS server (already implemented — Enoki sponsors gas, the \$0.25 USDC comes from the sponsor wallet). Without guidance, many will see a small balance and leave. The onboarding converts that sponsored amount into an activated user who understands what Audric *is*, not just one feature.

#### Terms of Service gate (ships with 1.5)

Already charging via allowance without ToS — fix this first.

- **Update existing `/terms` page:** Add "Fees and Charges" section disclosing: swap overlay fee (0.1%), allowance model (on-chain USDC escrow deducted for paid features), session charge (\$0.01/AI session), morning briefing (\$0.005/day), yield spread. Add "Allowance System" section explaining non-custodial spending cap, deposit/withdraw anytime.
- **Add `tosAcceptedAt DateTime?` to User model** — Prisma migration.
- **Consent gate in `/setup` wizard:** Checkbox "I agree to the Terms of Service" (linked) required before allowance creation. Stamps `tosAcceptedAt` on proceed.
- **Existing user catch-up:** On `/new`, if `tosAcceptedAt` is null, show a non-dismissible bottom banner: "We've updated our Terms of Service." Tap to review → accept → stamps `tosAcceptedAt` via API. Cannot dismiss without accepting.

Effort: 0.5 days

#### Welcome card — product surface, not just savings

- **Trigger:** `onboardedAt === null` on User record when loading `/new` dashboard.

- **WelcomeCard component** (pinned at top of chat tab, similar style to `BriefingCard`):

```
Welcome to Audric

Your AI copilot for money on Sui.

You signed in with Google — no seed phrase, no extension.
That's your Audric Passport. A wallet you already own.

You have $0.25 USDC to explore:

💰 Save      Earn 4.85% APY while you sleep
💱 Swap      Trade tokens in one message
💸 Send      Pay anyone, anywhere
🤖 Ask       Translate, weather, images — Audric pays

               [Save $0.25]  [Ask Audric]
```

- **Two CTAs:** "Save \$0.25" pre-fills the save chip flow. "Ask Audric" pre-fills a message: "What can you do?" — lets the copilot showcase itself.
- **Content adapts** to balance state: if USDC > 0 show save amount, if already saved show "You're earning" variant, if zero balance show wallet address + copy + "Fund your wallet" CTA.
- **Stamps `onboardedAt`** when user interacts with any CTA or dismisses the card.

#### Follow-up email (24h)

Uses existing ECS cron + Resend infra (same pattern as morning briefing). One-time, not recurring.

- **Query:** Users where `onboardedAt` is 24–48h ago AND no `DailyBriefing` record (i.e., haven't been active long enough for briefings) AND no savings position (checked via `getFinancialSummary()`).
- **Content adapts to behavior:**
  - Saved → "Your \$0.25 is earning. Try asking Audric to translate something or check the weather."
  - Used Pay → "You tried Audric Pay. Did you know you can earn yield on your USDC?"
  - Did nothing → "Your \$0.25 is waiting. Here are 3 things to try." + deep links to `/action?type=save`, `/new?prefill=what+can+you+do`
- **Idempotency:** Store as `AppEvent` type `onboarding_followup` — skip if already exists for this user.

#### Future expansion (Phase 5)

"Create and sell" — once the marketplace launches, the welcome card adds a 5th row: "🎨 Create — Generate AI content and sell it." This turns the \$0.25 from a financial demo into a creative tool.

**Already implemented:** Sponsor address funding, chip flows (Save, Swap, Receive), `/setup` wizard, `BriefingCard` pattern, `?prefill` deep links, existing `/terms` page (13 sections). **Still needed:** fee disclosure sections in ToS, `tosAcceptedAt` field + consent gate, first-run detection (`onboardedAt`), WelcomeCard component, follow-up cron job, catch-up banner for existing users.

Effort: 1.5 days (1d onboarding + 0.5d ToS)

### 1.6 Unified activity feed — with filter navigation — DONE

A single chronological view across all activity: save, send, receive, swap, yield earned, alerts fired, goals updated. This makes Audric feel like it is watching over your money even when you are not in the app. It is also the data source for the morning briefing summary.

**Shipped:** DashboardTabs (Chat/Activity with red dot unread indicator), FilterChips (All/Savings/Send/Receive/Swap/Pay), ActivityCard (individual transaction cards with icons, natural language titles, amounts, Suiscan links), ActivityFeed (date-grouped sections, skeleton loading, per-filter empty states with contextual CTAs, "Load more" pagination). AppEvent NeonDB table for future-proof event sourcing. GET /api/activity merges Sui RPC on-chain history + AppEvent rows with timestamp-based cursor pagination, type filtering, digest deduplication (AppEvent preferred over chain when digest matches), and allowance transaction filtering (internal budget ops excluded). useActivityFeed hook with useInfiniteQuery, date grouping by local timezone, red dot tracking via localStorage. Event writers wired: ServicePurchase + HF alerts both create AppEvent rows.

- Pull from Sui RPC on-chain history + NeonDB AppEvent table (merged, deduplicated)

- Natural language titles generated server-side: "Saved $50 USDC into NAVI", "Received $10 USDC from 0x1bf...", "Paid $0.003 for web search"

- Filter by type: All, Savings, Send, Receive, Swap, Pay

- Accessible from dashboard and as /history chat command

**Activity feed navigation:**

The current `UnifiedTimeline` interleaves chat and feed items. The activity feed needs a dedicated entry point for users who want to browse, not chat. On desktop, this is a tab at the top of the timeline. On mobile, it's a bottom nav icon.

```
┌─────────────────────────────────────────────┐
│  $54.96                                     │
│  available $34 · earning $19 ▾              │
│                                             │
│  [ Chat ]   [ Activity ● ]                  │
│  ─────────────────────────                  │
│                                             │
│  ┌─ Filter: ─────────────────────────────┐  │
│  │ [All] [Savings] [Send] [Swap] [Pay] [DCA]│
│  └───────────────────────────────────────┘  │
│                                             │
│  Today                                      │
│  ┌─────────────────────────────────────┐    │
│  │  ↑  Saved $50 USDC into NAVI       │    │
│  │  5.00% APY · 2 hours ago            │    │
│  │  [View on Suiscan]                  │    │
│  └─────────────────────────────────────┘    │
│  ┌─────────────────────────────────────┐    │
│  │  ↓  Received $10 USDC from 0x1bf.. │    │
│  │  3 hours ago                        │    │
│  │  [View on Suiscan]                  │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  Yesterday                                  │
│  ┌─────────────────────────────────────┐    │
│  │  ☀️ Morning briefing                │    │
│  │  Earned $0.27 · USDC 5.00% APY     │    │
│  │  [View details]                     │    │
│  └─────────────────────────────────────┘    │
│  ┌─────────────────────────────────────┐    │
│  │  ↑→ Sent $2 USDC to funkii         │    │
│  │  Yesterday 3:42pm                   │    │
│  │  [View on Suiscan]                  │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  [Load more ↓]                              │
│                                             │
└─────────────────────────────────────────────┘
```

**Filter chips:**

- `All` — everything (default)
- `Savings` — deposits, withdrawals, yield earned, auto-compound
- `Send` — outgoing transfers
- `Swap` — token swaps (LLM or chip flow)
- `Receive` — incoming transfers (detected by indexer)
- `Pay` — MPP service calls
- `DCA` — scheduled action executions (visible after Phase 3)

**Red dot on "Activity" tab:** Appears when there's unread activity since last visit. Clears on tab switch.

**Empty state per filter:**

```
┌─────────────────────────────────────────────┐
│  No savings activity yet.                   │
│                                             │
│  Save USDC to start earning yield.          │
│  [ Save USDC → ]                            │
└─────────────────────────────────────────────┘
```

Each empty state has a contextual CTA that sends the relevant action to the chat.

**Pagination:** Infinite scroll with `cursor` param on `GET /api/history?type=savings&cursor=xxx`. Load 20 items at a time. Show "Load more" button at bottom (not infinite scroll autofetch — saves API calls for mobile users).

Effort: 3 days

## Phase 2 — Receive + fiat on-ramp

|                                              |
|----------------------------------------------|
> ~3 weeks | Open Audric to inbound money

Receive breaks Audric out of its closed loop. Every payment link shared is a marketing impression. Freelancers invoicing clients, bill-splitting, creator tips — this is a new acquisition channel that does not require a marketing budget.

### 2.1 Payment links + QR codes

audric.ai/pay/\[slug\] — a public page showing amount, label, and recipient. QR generated client-side. No app required for USDC senders. The indexer detects arrival and triggers an immediate push notification to the recipient.

- PaymentLink table: id (slug), userId, amount, label, createdAt, expiresAt (optional), paidAt (nullable), paidTxHash (nullable), status (active/paid/expired/cancelled)

- Public page: clean, no Audric account required to view

- QR: generated via qrcode.js, downloadable as PNG

- Shareable URL: copy button, WhatsApp/Telegram/email share intents

- Arrival detection: indexer watches for transfers to recipient address, matches by amount + label

- Notification: 'You received \$50 USDC from \[sender\] — saved to your balance'

**Payment link page — all states:**

The payment link page is the first thing non-Audric users see. It must be fast, professional, and zero-friction. Every confusing element is a lost payment.

```
State: Active (awaiting payment)

┌─────────────────────────────────────────────┐
│                                             │
│           ◉ audric                          │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │                                     │    │
│  │         $50.00 USDC                 │    │
│  │                                     │    │
│  │  To: jane (0x7f20...f6dc)          │    │
│  │  For: Logo design work              │    │
│  │                                     │    │
│  │  ┌─────────────┐                   │    │
│  │  │   ██  ██    │                   │    │
│  │  │   ██  ██    │  ← QR code       │    │
│  │  │   ██  ██    │  (scan to pay)    │    │
│  │  └─────────────┘                   │    │
│  │                                     │    │
│  │  Sui address:                       │    │
│  │  0x7f2059fb1c39...208d2f6dc [Copy]  │    │
│  │                                     │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  Send exactly $50.00 USDC to the address    │
│  above. Payment will be confirmed           │
│  automatically.                             │
│                                             │
│  Don't have USDC?                           │
│  [ Buy USDC with card → ]  (AlchemyPay)     │
│                                             │
│  ─────────────────────────────────────      │
│  Want to get paid like this?                │
│  [ Try Audric → ]                           │
│                                             │
└─────────────────────────────────────────────┘

State: Paid (payment confirmed)

┌─────────────────────────────────────────────┐
│                                             │
│           ◉ audric                          │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │                                     │    │
│  │  ✓ Payment confirmed                │    │
│  │                                     │    │
│  │  $50.00 USDC                        │    │
│  │  To: jane · For: Logo design work   │    │
│  │                                     │    │
│  │  Paid 2 minutes ago                 │    │
│  │  Tx: 8LFiTm...NBrp3D               │    │
│  │  [View on Suiscan]                  │    │
│  │                                     │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ─────────────────────────────────────      │
│  Payments without processing fees.          │
│  [ Try Audric → ]                           │
│                                             │
└─────────────────────────────────────────────┘

State: Expired

┌─────────────────────────────────────────────┐
│                                             │
│           ◉ audric                          │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │                                     │    │
│  │  This payment link has expired.     │    │
│  │                                     │    │
│  │  It was for $50.00 USDC.            │    │
│  │  Contact the recipient to request   │    │
│  │  a new link.                        │    │
│  │                                     │    │
│  └─────────────────────────────────────┘    │
│                                             │
└─────────────────────────────────────────────┘

State: Loading (checking status)

┌─────────────────────────────────────────────┐
│                                             │
│           ◉ audric                          │
│          (pulse animation)                  │
│                                             │
│   Checking payment status...                │
│                                             │
└─────────────────────────────────────────────┘

State: Not found (invalid slug)

┌─────────────────────────────────────────────┐
│                                             │
│           ◉ audric                          │
│                                             │
│  This payment link doesn't exist.           │
│                                             │
│  [ Go to audric.ai → ]                      │
│                                             │
└─────────────────────────────────────────────┘
```

**Implementation notes:**

- Route: `app/pay/[slug]/page.tsx` — server component, fetches payment link status on load
- Polling: for "active" state, poll `GET /api/pay/[slug]/status` every 5 seconds to auto-detect payment arrival and transition to "paid" state in real-time
- Meta tags: `generateMetadata()` returns amount + label for link previews in WhatsApp/iMessage/Slack — "Pay $50.00 USDC · Logo design work"
- Open Graph image: dynamically generated OG image showing amount and Audric brand
- Acquisition CTA: "Try Audric" link at the bottom is the primary acquisition path from payment links. Links to `audric.ai/?ref=paylink` with attribution tracking
- Mobile-first: the page must be gorgeous on mobile — most recipients will open links from messaging apps on their phone
- Accessibility: QR code has a text alternative ("Sui address" + copy button below it)

Effort: 4 days

### 2.2 Invoices

Named invoices with line items, due date, and total. Generates a payment link automatically. Marks as paid when the USDC transfer is detected. Designed for freelancers, consultants, and small businesses.

- Invoice table: id, userId, recipientName, lineItems (JSON), dueDate, status (draft/sent/paid)

- Chat: 'Create an invoice for \$500 for design work due May 1' generates automatically

- PDF export via existing PDFShift MPP endpoint (eats its own dog food)

- Overdue detection: cron checks unpaid invoices past due date, sends reminder

Effort: 3 days

### 2.3 AlchemyPay fiat on/off-ramp (optional, on payment page)

A 'Don't have USDC?' link on the payment page opens an AlchemyPay embed. The sender buys USDC via card, bank transfer, Apple Pay, or regional mobile wallet — destination is the recipient's Sui address. Audric touches zero fiat — AlchemyPay handles KYC (via Sumsub), compliance, and FX. Fee is ~1–2% on AlchemyPay's end, still beating the 3% card processing story.

- AlchemyPay page integration: iframe/redirect embed with custom parameters. Native API available for programmatic flows (CLI `t2000 onramp` in future). Well-documented SDK, 40+ countries, bank transfer + mobile wallets + cards.

- Off-ramp also available: users can sell USDC back to fiat via bank account. AlchemyPay handles the conversion and withdrawal. This closes the full loop — on-chain yield → fiat cashout.

- Position as secondary option — USDC-first is the primary pitch

- Copy: 'Save 3% vs card processing. Your clients pay USDC, you receive instantly.'

- v1 scope: AlchemyPay only. Do not build custom fiat rails. KYC is handled by AlchemyPay (Sumsub) — Audric does not own KYC.

Effort: 2 days

### 2.4 Send UX improvements

- Payment memo field: optional note stored in NeonDB, shown in activity feed

- Recipient landing: when a non-Audric user receives USDC, show a page explaining what they received and how to access it

Effort: 1 day

### 2.5 Mini-storefront (sync products only)

The Phase 2 Receive infrastructure (payment links, public pages, indexer detection) is everything needed to run a basic storefront. Rather than waiting until Phase 5, ship a minimal storefront in Phase 2 with sync-only products — no async queue required. This provides real validation data before investing weeks into the async music and video features in Phase 5.

- Storefront UI: audric.ai/\[username\] public page, Listing table in NeonDB, grid of listed items

- Sync-only products at launch: art print packs (Stability AI), t-shirts (Printful), prompt packs (Claude), short guides (Claude + PDFShift), personalised greeting cards (Stability AI + Lob)

- Validation gate: if no sales within 4 weeks of launch, pause Phase 5 music investment and diagnose why. If sales are happening, proceed to Phase 5 with confidence.

- 8% platform fee applies from day one. Powered by Audric badge on every storefront page.

Effort: 2 days (Listing table + public page + payment link wiring, reuses Receive infrastructure)

## Phase 3 — Proactive agent + MPP discovery

|                          |
|--------------------------|
> ~3 weeks | The moat

This phase shifts Audric from a tool to a financial copilot. It requires the notification infrastructure from Phase 1. The DCA/scheduled actions feature is the highest retention unlock and the most trust-sensitive — build the confirmation mechanic carefully.

### 3.1 Auto-compound rewards

NAVI distributes both NAVX and vSUI (CERT) as lending rewards in addition to base yield. The `claim_rewards` tool is already built in the SDK and engine. Auto-compound extends this by automatically claiming all reward types and re-depositing as USDC via Cetus swaps — all in a single atomic PTB.

- Daily ECS cron: check pending NAVX rewards for each user with savings

- Threshold: only compound if pending rewards exceed \$0.10 (gas not worth it below this)

- PTB: claim_rewards (already built) → Cetus reward→USDC swaps (NAVX→USDC + CERT→USDC) → NAVI deposit — single atomic transaction

- Morning briefing addition: 'Auto-compounded \$0.43 of NAVX rewards yesterday'

- Technical note: verify NAVX→USDC→NAVI deposit PTB end to end before shipping

- Settings: toggle on/off, shown as 'Auto-compound rewards' in savings settings

Effort: 3 days

### 3.2 USDC rate monitoring alerts

Since savings are USDC-only on NAVI, yield optimization is simpler — monitor NAVI's USDC supply rate and alert on significant changes. No cross-asset rebalancing needed.

- Hourly cron: fetch NAVI USDC supply rate via MCP, compare to last notified rate

- Alert threshold: notify if rate change exceeds ±1% (e.g., 5% → 6.5% or 5% → 3.5%)

- Rate increase message: 'USDC savings rate jumped to 6.5% — your $500 now earns $0.09/day'

- Rate decrease message: 'USDC savings rate dropped to 3.0%. Your $500 earns $0.04/day. Consider withdrawing.'

- Idle USDC nudge: 'You have $44 idle USDC earning 0%. Save it to earn 5.0% APY → one tap'

- One-tap action in email: deep link to `/action?type=save&amount=44`

- Max one rate alert per 24 hours per user

Effort: 2 days (simpler than multi-asset — single rate to track)

### 3.3 Scheduled actions — DCA and recurring saves

Users set standing instructions via chat: 'Save \$50 every Friday', 'Buy \$20 SUI every Monday'. Stored in DB. ECS cron executes. This is the feature that makes Audric an agent, not just a tool.

- ScheduledAction table: userId, actionType, amount, asset, cronExpr, nextRunAt, enabled, confirmationsRequired, confirmationsCompleted

- Confirmation mechanic: required for first 5 executions, then fully autonomous

- Night-before reminder: 'Audric will save \$50 tomorrow at 9am — tap to cancel'

- Failure handling: if insufficient balance, skip and notify — never overdraft

- Chat creation: natural language parsed by engine into structured ScheduledAction

- Trust-critical: one failed autonomous transaction causes churn. Test extensively.

- Fee disclosure: recurring swap actions (e.g., "Buy $20 SUI every Monday") incur the 0.1% swap fee on each execution. The scheduled action confirmation should state: "Each execution incurs a 0.1% swap fee."

**Trust ladder UI — the "5 confirmations then autonomous" mechanic:**

The trust ladder is the most psychologically important pattern in the product. The user is granting Audric permission to move money without asking. It must feel earned, not forced. Each confirmation is an opportunity to prove reliability.

```
During confirmation phase (executions 1-5):

┌─────────────────────────────────────────────┐
│  ⏰  Scheduled action · Tomorrow 9am       │
│                                             │
│  Save $50 USDC into NAVI                    │
│                                             │
│  Trust progress: ●●●○○  3 of 5             │
│  ━━━━━━━━━━━━━━━━━━━░░░░░░░░░              │
│  2 more confirmations until autonomous      │
│                                             │
│  [ Confirm ✓ ]           [ Skip this week ] │
│                                             │
│  Next: Friday Apr 11 at 9am                │
│                                             │
└─────────────────────────────────────────────┘

After completing 5 confirmations:

┌─────────────────────────────────────────────┐
│  ⏰  Scheduled action · Now autonomous     │
│                                             │
│  Save $50 USDC into NAVI                    │
│                                             │
│  ✓ Audric now runs this automatically       │
│                                             │
│  You confirmed 5 times. Audric will         │
│  execute every Friday at 9am and notify     │
│  you after each one.                        │
│                                             │
│  [ Keep autonomous ]  [ Require approval ]  │
│                                             │
└─────────────────────────────────────────────┘

Night-before reminder (feed card + email):

┌─────────────────────────────────────────────┐
│  ⏰  Tomorrow 9am                           │
│                                             │
│  Audric will save $50 USDC into NAVI.       │
│                                             │
│  [ OK ]              [ Cancel this one ]    │
│                                             │
└─────────────────────────────────────────────┘

Post-execution notification (autonomous):

┌─────────────────────────────────────────────┐
│  ✓  Scheduled save complete                 │
│                                             │
│  Saved $50 USDC into NAVI at 5.00% APY.    │
│  Tx: 8LFiTm...NBrp3D                       │
│                                             │
│  [View on Suiscan]  [View savings]          │
│                                             │
└─────────────────────────────────────────────┘
```

**Scheduled actions management — Settings > Schedules:**

```
┌─────────────────────────────────────────────┐
│  ← Back                   Scheduled Actions │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  🔄  Save $50 USDC       Every Fri │    │
│  │  Next: Apr 11 9am  ·  Autonomous   │    │
│  │  12 executions · $600 total saved   │    │
│  │  [Pause]  [Edit]  [Delete]          │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  🔄  Buy $20 SUI          Every Mon│    │
│  │  Next: Apr 7 9am  ·  ●●○○○ 2 of 5 │    │
│  │  2 executions · 46.8 SUI bought     │    │
│  │  [Pause]  [Edit]  [Delete]          │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  "Save $50 every Friday" to create new      │
│                                             │
└─────────────────────────────────────────────┘
```

**Edge cases:**

- Insufficient balance at execution time: skip, notify "Skipped $50 save — only $30 available. Want to save $30 instead?"
- User revokes autonomous: resets confirmationsCompleted to 0, starts trust ladder over
- User edits amount: does NOT reset trust ladder — only action type change resets it
- Multiple scheduled actions: each has its own independent trust counter
- Missed execution (server downtime): catch up on next cron run with explanation "Missed Friday — executing now"

Effort: 5 days

### 3.4 MPP consumer discovery

Users have no idea what the Pay feature can do. A capabilities screen turns Pay from a mystery into a feature people explore. Spend tracking makes micropayments feel controlled.

- Capabilities grid: 'What can Audric do?' — cards for image gen, web search, translation, TTS, code execution

- Each card pre-fills the chat with an example prompt

- Spend tracker: 'You used \$0.08 today across 6 API calls'

- Daily API budget: user sets a limit, Audric warns before exceeding it

- Usage history: per-service breakdown in activity feed

Effort: 3 days

### 3.5 Gifting reminders — flowers, postcards, letters

Audric is already aware of the user’s financial life — it should also be aware of the moments that matter. Gifting reminders use the proactive notification infrastructure from Phase 1, the MPP gateway for fulfilment, and the contacts system already in the SDK. Three days before a key date, Audric surfaces a nudge; the user replies and Audric places the order entirely by chat.

- MPP services: Lob (postcards, letters — already live), flower API to add (Bloom & Wild or Teleflora API). No inventory, no fulfilment — pure API orchestration.

- Global calendar triggers: Mother’s Day, Valentine’s Day, Christmas, Father’s Day — hardcoded, fire 3 days before each.

- Personal triggers: user sets in chat — “remind me to send mum flowers on her birthday April 3”. Stored in OccasionReminder table (userId, label, date, recurring, lastSentAt).

- User controls level of proactivity in settings: global calendar events only / personal reminders / learn from chat history (all three toggleable).

- Revenue: Audric earns MPP gateway margin on each order. Flowers (~\$40 order) at 15% margin = \$6 per send — highest per-transaction value of any current MPP service.

Effort: 3 days (flower API + reminder cron + chat parsing for personal dates)

### 3.6 Credit UX improvements

- Health factor explainer: one-tap plain English explanation — 'Your health factor is 2.4. This means you could lose 58% of your collateral value before liquidation risk.'

- Liquidation education: shown once on first borrow, dismissible

- Borrow APR: verify display is annualised, not per-period

Effort: 1 day

## Phase 4 — Async job queue

|                               |
|-------------------------------|
> ~2 weeks | MPP expansion

The current MPP architecture is synchronous — request, pay, response. Services like Suno, Runway, and Heygen take 30 seconds to 5 minutes to return. Adding async support unlocks a new category of higher-value services and higher USDC per transaction.

### 4.1 Infrastructure — SQS + ECS worker

One SQS standard queue. New ECS Fargate task polls every 20 seconds. Runs alongside the existing indexer and server on the same cluster — no new infrastructure category.

- SQS standard queue (not FIFO — retries are safe for idempotent jobs)

- New ECS task: job-worker, Docker image alongside indexer

- AsyncJob table (NeonDB server DB): id, userId, service, endpoint, status (pending/processing/complete/failed), inputParams, resultUrl, usdcAmountLocked, usdcAmountSettled, createdAt, completedAt

- Payment locking: USDC locked at job submit, settled on success only — failed jobs refund automatically

- Dead letter queue: jobs that fail 3 times go to DLQ for inspection

Effort: 4 days

### 4.2 Async services — priority order

|                         |                                                       |            |             |
|-------------------------|-------------------------------------------------------|------------|-------------|
| **Feature**             | **What it does**                                      | **Effort** | **Tag**     |
| ElevenLabs async TTS    | Long-form audio narration, podcasts, voice content    | 2 days     | Add first   |
| Suno music generation   | AI music from text prompt — high viral demo potential | 2 days     | High impact |
| Runway video generation | Text/image to video, 30–90 second jobs                | 2 days     | High value  |
| Heygen avatar video     | Talking head video generation, business use case      | 2 days     | B2B angle   |
| Replicate custom models | Long-running inference jobs, image upscaling          | 3 days     | Later       |

**Result delivery pattern**

- Job submitted: 'Generating your music — usually takes 2 minutes. I will notify you when it is ready.'

- On complete: push notification + chat message with download link

- USDC only settles on confirmed success — users never pay for failed generations

## Revenue model

Audric has six distinct revenue streams, all passive once built. Every stream scales with TVL or user count rather than engineering headcount — the ratio of revenue to operating cost improves as the product grows. Fees are collected on-chain via the existing t2000 treasury Move contract, meaning revenue accrues transparently and is withdrawable by the admin at any time.

### Revenue streams

|                        |                   |                  |                                                                                                                                                            |                 |
|------------------------|-------------------|------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------|
| **Stream**             | **Rate**          | **Status**       | **Notes**                                                                                                                                                  | **Scales with** |
| Protocol fees (save)   | 10 bps (0.1%)     | **Live**         | On-chain via treasury::collect_fee in same PTB                                                                                                             | Deposit volume  |
| Protocol fees (borrow) | 5 bps (0.05%)     | **Live**         | On-chain via treasury::collect_fee in same PTB                                                                                                             | Borrow volume   |
| Swap fees (Overlay)    | 10 bps (0.1%)     | **Live**         | Cetus Overlay Fee on AggregatorClient init. Charge on output amount. Compounds with auto-compound swaps.                                                          | Swap volume     |
| MPP gateway margin     | 10–20%            | **Confirm now**  | Verify gateway runs with margin not at cost. Auth, billing, routing, reliability justify markup.                                                           | API call volume |
| Feature allowances     | \$0.001–0.005/use | **Phase 1**      | Pre-approved USDC allowance. Briefings, alerts, scheduled actions. Scales linearly with active users.                                                      | Active users    |
| Yield spread           | 0.1–0.2%          | **Consider now** | Display net APY to users. Requires clear disclosure in terms. \$1M TVL = \$1,000–\$2,000/yr passively.                                                     | TVL             |
| Async job margin       | 15–20%            | **Phase 4**      | \$0.10–\$2.00 per job upstream. Higher ticket = more margin room. Video/music gen unlocked by async queue.                                                 | Job volume      |
| Developer B2B tier     | \$29 / mo         | **Phase 3+**     | Hosted API server, gas station, MCP infra for teams building on t2000. Higher rate limits, priority support, private MPP endpoints. 50 teams = \$1,450/mo. | Developer teams |
| AI session charge      | \$0.01 / session  | **Phase 1**      | \$0.01 USDC per AI conversation. Covers LLM API cost (2x margin). Deducted via allowance model. Invisible to users — part of the Audric features budget.   | Active users    |

### Swap fee implementation

Swap fees are **live**. The implementation uses the **Cetus Aggregator Overlay Fee** — a built-in SDK feature that deducts a configurable percentage from swap output and sends it directly to a receiver address. No PTB modification needed, no Move contract changes. The rate is 10 bps (0.1%), displayed in the swap confirmation screen for transparency.

- ✅ `overlayFeeRate: 0.001` and `overlayFeeReceiver: TREASURY_ADDRESS` set on `AggregatorClient` initialization in both `cetus-swap.ts` (SDK) and `audric/prepare/route.ts`

- Charge on output amount (not input) — user sees slightly less output than raw quote, fee shown in confirmation screen

- Apply to all swap paths automatically: manual swaps (LLM + chip flow), DCA executions, and auto-compound NAVX→USDC swaps (all use the same client instance)

- Fee sent directly to receiver address. Periodically sweep into treasury contract via `receive_coins()` for on-chain tracking

- Disclose in terms of service: "Audric charges a 0.1% platform fee on swaps"

- Future: explore positive slippage capture (surplus when execution beats quote goes to treasury)

### Scale projections

|                      |                     |                 |                  |                   |
|----------------------|---------------------|-----------------|------------------|-------------------|
| **Stream**           | **100 users (now)** | **1,000 users** | **10,000 users** | **100,000 users** |
| Protocol fees        | ~\$20/mo            | ~\$200/mo       | ~\$2,000/mo      | ~\$20,000/mo      |
| Swap fees            | ~\$15/mo            | ~\$150/mo       | ~\$3,000/mo      | ~\$25,000/mo      |
| MPP margin           | ~\$5/mo             | ~\$200/mo       | ~\$500/mo        | ~\$5,000/mo       |
| Feature allowances   | not yet             | ~\$150/mo       | ~\$1,500/mo      | ~\$15,000/mo      |
| Yield spread + async | not yet             | ~\$200/mo       | ~\$3,000/mo      | ~\$25,000/mo      |
| B2B tier             | not yet             | ~\$290/mo       | ~\$1,450/mo      | ~\$14,500/mo      |
| AI session charge    | ~\$3/mo             | ~\$90/mo        | ~\$900/mo        | ~\$9,000/mo       |
| **Total (est.)**     | **~\$43/mo**        | **~\$1,280/mo** | **~\$12,350/mo** | **~\$113,500/mo** |

### Unit economics narrative

The compounding flywheel: more TVL generates more yield, which funds more auto-compound swaps, which generate swap fees, which fund the treasury, which sponsors new user onboarding, which grows TVL. Every revenue stream improves the others.

- Revenue scales with usage, not headcount. Engineering team stays constant while revenue compounds.

- Feature allowances (~\$0.005/day) are paid by yield earned (~\$0.50/day at 4% on \$5,000 saved). The product literally pays for itself from the user’s perspective.

- No advertising, no data selling, no hidden fees. Revenue is earned by providing genuine value on every transaction.

### Yield spread disclosure

If implementing yield spread (0.1–0.2%), transparent disclosure is mandatory. The recommended approach:

- Display **net APY** to users (after spread), not gross
- Terms of service: "Audric retains a small portion of lending yield to fund platform operations"
- Settings page: show both gross APY and net APY side by side
- No hidden fees — the spread is visible if the user looks for it, even if not prominently displayed
- Consider framing as "platform fee" rather than "spread" — clearer for non-crypto users
- Start at 0.1% (conservative). Only increase if user retention data shows no sensitivity

## Phase 5 — Creator marketplace

|                                                                                                                    |
|--------------------------------------------------------------------------------------------------------------------|
> ~3 weeks | After Phase 4 | Depends on: async queue, Receive payment links, Suno commercial licence ($12/mo subscription)

Every Audric user gets a public storefront at audric.ai/username. They list AI-generated songs, visual art, or merch. Buyers pay USDC via the Receive payment link mechanic built in Phase 2. The creator earns instantly with no intermediary. Every storefront is a distribution channel — buyers who land on audric.ai/username see “powered by Audric” and can sign up. Organic acquisition that compounds with every sale.

### 5.1 User storefront (audric.ai/username)

- Public page at audric.ai/\[username\] — user sets handle on first listing. Grid of listed items: songs, art, merch bundles.

- Each listing has: title, description, price (USDC), preview (30s audio clip or thumbnail), payment link. No app required for buyers.

- Multiple items per user — audric.ai/janedoe shows all her songs, prints, and bundles on one page.

- Powered by Audric badge + sign up CTA on every storefront. Organic acquisition flywheel.

### 5.2 Song generation + listing flow

- Generate: “Make me a lo-fi hip hop track called Midnight Rain.” Async Suno job (~2 min). AI cover art via Stability AI (already in MPP). Both generated in the same job batch.

- List: “Sell this for \$3 USDC.” Audric creates a Listing record, stores the file, generates a payment link. File locked behind payment verification.

- Share: Audric generates a tweet draft with payment link. One tap to post. “Just made this track with AI — pay \$3 USDC to download. audric.ai/janedoe/midnight-rain”

- Sale: buyer pays USDC via Receive. Indexer detects payment. Audric splits on-chain: 92% to creator wallet, 8% to treasury. Download link unlocked instantly.

- Notification: “You just earned \$2.76 USDC — someone bought Midnight Rain.” Total earned shown in morning briefing.

### 5.3 Merch bundles (song + t-shirt)

- Printful (print-on-demand) already in MPP. AI cover art generated alongside the song becomes the t-shirt design automatically.

- Bundle listing: “Digital download + t-shirt — \$28 USDC.” On purchase Audric splits: Printful order placed, creator receives remainder minus Audric 8% fee.

- Ship music-only listings first. Add merch bundles once music sales are validated.

### 5.4 File storage — Walrus + Seal

Creator marketplace files (songs, art, PDFs) need decentralized, censorship-resistant storage with payment-gated access. The Sui-native stack is **Walrus** (blob storage) + **Seal** (programmable access control).

**Architecture:**

- **Upload:** Creator generates content → store blob on Walrus via `@mysten/walrus` SDK → get blob ID. Pay storage with WAL token (already in Tier 2)
- **Encrypt:** Encrypt file with Seal before uploading. Access policy defined in a Move contract: "decrypt only if buyer has paid" (payment verification via treasury receipt)
- **Preview:** 30s audio clips and thumbnails stored unencrypted on Walrus (public preview, no gating needed). CDN not required — Walrus serves directly
- **Purchase flow:** Buyer pays USDC via Receive → indexer detects payment → Seal policy unlocks decryption → buyer downloads full file
- **Access control:** Seal supports NFT-gating, payment verification, time-locked access, and allowlists. Use payment receipt (on-chain) as the Seal policy trigger — no custom gating logic needed

**Why Walrus + Seal over S3/R2:**

- Fully on-chain — no AWS bills, no vendor lock-in
- Payment verification is native (Seal reads Sui state) — no webhook/API integration for access control
- Content is permanent — no expiring URLs, no bucket policies
- Fits the non-custodial story: creator's files are not on Audric's servers

**Costs:** Walrus storage is paid in WAL. Current rates are competitive with S3 for small files (<100MB). For large video files (Runway/Heygen output), evaluate cost per GB vs R2 at launch time.

**Dependencies:** `@mysten/walrus` SDK (TypeScript, available now), Seal SDK (mainnet v1.0). Both are Mysten Labs products in the Sui ecosystem.

Effort: 3 days (Walrus upload + Seal encrypt/decrypt + payment-gated download flow)

### 5.5 Data model additions

- UserProfile: userId, username (unique slug), bio, createdAt — add username field to existing users table

- Listing: id, userId, title, description, type (song/art/merch/bundle), priceUsdc, fileUrl, previewUrl, paymentLinkSlug, salesCount, totalEarnedUsdc, status (active/sold out/draft)

- Sale: id, listingId, buyerAddress, amountUsdc, platformFeeUsdc, creatorReceivedUsdc, txDigest, createdAt

### 5.6 Revenue and spin-out path

- Platform fee: 8% of each sale settled on-chain at payment time. Creator receives 92% instantly. No monthly fees, no signup costs.

- Swap fee also applies on any NAVX → USDC conversion when creator earnings are auto-saved. Double revenue touch per sale.

- Spin-out trigger: if creator marketplace reaches 500+ active storefronts, evaluate separating to its own domain (e.g. audric.market) powered by the same t2000 infrastructure. Decision point at 6 months post-launch.

### 5.7 Storefront content catalogue

Every product type below is generated entirely via MPP services Audric already has or is building. The creator’s value-add is curation, taste, and the prompt — not technical skill. Products are grouped by what infrastructure they require so the launch sequence is clear.

|                                     |                         |                                                                                                                                                                       |                 |          |
|-------------------------------------|-------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------|----------|
| **Product**                         | **MPP services**        | **Description**                                                                                                                                                       | **Price range** | **When** |
| **Available now (Phase 2+)**        |                         | Sync generation only — no async queue needed. Can launch alongside storefront UI.                                                                                     |                 |          |
| Art print packs                     | Stability AI, fal.ai    | 5–10 high-res AI art pieces on a theme. Digital download for home printing. “Japandi interior art”, “Abstract crypto art”.                                            | \$5–\$20 USDC   | Phase 2  |
| T-shirts + physical merch           | Stability AI + Printful | AI art → Printful print-on-demand. Buyer pays, Audric places Printful order, ships direct. Creator never touches inventory.                                           | \$25–\$45 USDC  | Phase 2  |
| Personalised greeting cards         | Stability AI + Lob      | Buyer describes occasion, creator generates AI art card, Lob prints and mails. Ties into gifting reminders feature.                                                   | \$8–\$15 USDC   | Phase 2  |
| Prompt packs                        | Claude (generation)     | Curated sets of prompts for image gen, music, or writing. “50 Midjourney prompts for product photography.” Pure digital, instant delivery, near-zero generation cost. | \$3–\$10 USDC   | Phase 2  |
| Short guides + ebooks               | Claude + PDFShift       | 10–20 page PDFs on niche topics. “Starting a food truck business in Sydney.” Generated via Claude, formatted via PDFShift. Both already in MPP.                       | \$5–\$15 USDC   | Phase 2  |
| **Requires async queue (Phase 4+)** |                         | Jobs take 30 seconds to 5 minutes. SQS worker required. Higher ticket price per item.                                                                                 |                 |          |
| Song packs                          | Suno                    | 3–5 tracks on a theme. “Chill study beats vol.1” or “Trap beats for creators.” Bundle pricing makes it feel like an album. Highest viral potential.                   | \$5–\$15 USDC   | Phase 5  |
| Custom jingles                      | Suno                    | 30-second jingle for a business or brand. Buyer describes brief, creator generates. Commissioned content model. High repeat purchase from SMBs.                       | \$10–\$30 USDC  | Phase 5  |
| Podcast intros + outros             | Suno + ElevenLabs       | 30–60 second branded audio with music bed + TTS voiceover. High demand from solo podcasters who can’t afford production.                                              | \$8–\$20 USDC   | Phase 5  |
| AI music videos                     | Suno + Runway           | Song + matching video loop sold as bundle. YouTube creators and streamers buy for background content. Highest-share format — strong viral loop.                       | \$15–\$40 USDC  | Phase 5  |
| Short video ads                     | Runway + ElevenLabs     | 15–30 second promotional clips for small businesses. Huge demand from SMBs who can’t afford agencies. High repeat purchase potential.                                 | \$20–\$60 USDC  | Phase 5  |
| Avatar explainer videos             | Heygen                  | Talking head video from script. Creator inputs text, Heygen generates. LinkedIn content creators and product demo videos. B2B angle.                                  | \$15–\$50 USDC  | Phase 5  |
| **Future (Phase 6)**                |                         | Requires escrow mechanic (USDC locked until buyer approves delivery).                                                                                                 |                 |          |
| Commission requests                 | Any MPP service         | Buyer pays upfront, describes brief, creator generates and delivers. “Custom song for my wedding.” USDC held in escrow until buyer approves.                          | Creator sets    | Phase 6  |
| Creator subscriptions               | Any MPP service         | \$5 USDC/month for a new AI track every week. Allowance mechanic already handles recurring deductions. Predictable income for creators.                               | \$3–\$10/mo     | Phase 6  |

Note on launch sequence: the Phase 2 products (art prints, t-shirts, prompt packs, ebooks) can launch with the basic storefront UI without waiting for the async queue. This means real storefronts with real sales are possible weeks before Phase 5 ships. Use the early catalogue to validate the storefront mechanic — if nobody buys art prints, reconsider the music investment before it is built.

### 5.8 In-chat marketplace recommendations

The recommendation engine does not need to be built as a separate system. Claude already processes every message in the Audric chat. Adding one new read tool (search_listings) to the engine and intent matching instructions to the system prompt is the entire implementation. This ships alongside the storefront launch — not as a separate phase.

**Two recommendation modes**

- Proactive — context-aware: Audric already knows the user’s savings goals, occasion reminders, chat history, and wallet behaviour. When a milestone is hit, an occasion fires, or a recurring context pattern is detected, Audric surfaces relevant marketplace listings without being asked. Examples: savings goal labelled “holiday” → travel art prints; Mother’s Day reminder → personalised greeting cards; “my podcast” mentioned in chat → podcast intros from storefront creators.

- Reactive — keyword triggered: user types a message that matches a marketplace intent. Claude detects the intent, calls search_listings, and includes up to 2 listing cards inline with the normal response. Examples: “I need music for my video” → song packs; “looking for a gift for my mum” → personalised cards; “a jingle for my business” → custom jingle listings.

**Implementation**

- New engine read tool: search_listings(query, category?, limit=2). Queries the Listing table in NeonDB. Returns title, creator username, price, preview URL, payment link slug. Classified as auto-permission — no user approval needed to search.

- System prompt addition: “When the user’s message clearly matches a marketplace intent (music, art, gifts, video content, business promotion, printed goods), call search_listings and include up to 2 results as inline cards. Only trigger on direct, obvious matches. Never on financial queries. Max one marketplace recommendation per conversation session.”

- Ranking v1: category tag match + recency. Ranking v2: sales count as quality signal + personalisation by past purchases. Do not build a recommendation algorithm on day one — validate the mechanic with simple matching first.

- Conversation log (built in Phase 1) becomes the training dataset for improving intent detection over time. Tag each Sale record with source:recommendation for conversion tracking.

**The critical rule — helpful not spammy**

Recommendations must feel like Audric helping, not Audric selling. The correct tone: surface options and immediately offer to generate something custom if nothing fits. The wrong tone: surfacing marketplace cards on any message with a vaguely related word. The moment recommendations feel like ads, users stop speaking naturally in the chat — which destroys the core product experience.

- Trigger threshold: only when match confidence is high and intent is explicit, not inferred

- Rate limit: max one marketplace recommendation per conversation session

- Hard exclusion: never trigger on financial queries — balance, yield, health factor, borrow, repay, send, save

- User opt-out: single toggle in settings to disable all marketplace suggestions entirely

**Revenue impact**

Every in-chat sale earns the 8% platform fee with no additional infrastructure cost. The recommendation engine is a discovery layer that increases marketplace GMV passively. As the catalogue grows, better intent matching drives higher conversion. Each Sale record tagged source:recommendation provides a clean funnel metric — impressions → taps → purchases — that compounds the system over time.

## Asset architecture

A deliberate decision made after reviewing the beta dashboard: USDC is the native currency of Audric. All financial operations — saving, borrowing, sending, receiving, yield, allowances, marketplace payments, and MPP gateway calls — are denominated in USDC. Users can hold and swap a curated list of 13 Sui tokens, but these assets only participate in the financial layer once swapped to USDC. Tokens outside this list do not exist in Audric. This simplifies edge cases, reduces NAVI integration surface, makes health factor meaningful, and gives the product a clear identity that non-crypto users can understand.

### Tier 1 — Core (financial layer)

**USDC**

The only asset that participates in: save to NAVI, borrow against collateral, send, receive, earn yield, feature allowances, marketplace purchases, MPP gateway payments. Health factor calculated as simple USDC-saved / USDC-borrowed ratio — no oracle complexity, no cross-asset liquidation risk.

### Tier 2 — Swap assets (hold and trade, 13 tokens)

**SUI, BTC, ETH, GOLD, DEEP, WAL, NS, IKA, CETUS, NAVX, vSUI, LOFI, MANIFEST**

Displayed in portfolio. Swappable to/from USDC via Cetus Aggregator. Not saveable to NAVI, not usable as loan collateral. When users want to put these assets to work, they swap to USDC first. NAVX and vSUI (CERT) are both required because NAVI distributes them as lending reward tokens — NAVX for most pools, vSUI/CERT for certain deposit types (e.g., USDT). The auto-compound path claims all reward types and swaps them back to USDC via Cetus. LOFI and MANIFEST are meme tokens included by user demand.

**Canonical coin type reference:**

| Token | Tier | Coin type |
|-------|------|-----------|
| USDC | 1 | `0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC` |
| SUI | 2 | `0x2::sui::SUI` |
| wBTC | 2 | `0x0041f9f9344cac094454cd574e333c4fdb132d7bcc9379bcd4aab485b2a63942::wbtc::WBTC` |
| ETH | 2 | `0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH` |
| GOLD (XAUM) | 2 | `0x9d297676e7a4b771ab023291377b2adfaa4938fb9080b8d12430e4b108b836a9::xaum::XAUM` |
| DEEP | 2 | `0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP` |
| WAL | 2 | `0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL` |
| NS | 2 | `0x5145494a5f5100e645e4b0aa950fa6b68f614e8c59e17bc5ded3495123a79178::ns::NS` |
| CETUS | 2 | `0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS` |
| NAVX | 2 | `0xa99b8952d4f7d947ea77fe0ecdcc9e5fc0bcab2841d6e2a5aa00c3044e5544b5::navx::NAVX` |
| vSUI | 2 | `0x549e8b69270defbfafd4f94e17ec44cdbdd99820b33bda2278dea3b9a32d3f55::cert::CERT` |
| IKA | 2 | `0x7262fb2f7a3a14c888c438a3cd9b912469a58cf60f367352c46584262e8299aa::ika::IKA` |
| MANIFEST | 2 | `0xc466c28d87b3d5cd34f3d5c088751532d71a38d93a8aae4551dd56272cfb4355::manifest::MANIFEST` |
| LOFI | 2 | `0xf22da9a24ad027cccb5f2d496cbe91de953d363513db08a3a734d361c7c17503::LOFI::LOFI` |

### Operation matrix

|                            |          |                    |
|----------------------------|----------|--------------------| 
| **Operation**              | **USDC** | **13 swap assets** |
| Display in portfolio       | **Yes**  | **Yes**            |
| Swap via Cetus             | **Yes**  | **Yes**            |
| Save to NAVI (earn yield)  | **Yes**  | No                 |
| Borrow / use as collateral | **Yes**  | No                 |
| Send                       | **Yes**  | **Yes**            |
| Receive                    | **Yes**  | No                 |
| Marketplace / MPP payments | **Yes**  | No                 |

### Implementation notes

- Only Tier 1 (USDC) and Tier 2 (13 swap assets) tokens exist in the registry. Swap, send, and all operations reject unknown coin types. Audric is a financial copilot, not a generic DEX.

- SDK save() and borrow() reject non-USDC assets with INVALID_ASSET error. Single-line guard checks at the top of each function. send() supports Tier 1 (USDC) and Tier 2 assets (SUI, ETH, etc.) — users should be able to send any featured token they hold. No architectural change needed.

- Existing NAVI positions (USDe, SUI, USDsui) stay untouched — users can still withdraw them via the LLM ("withdraw my USDe"). New save/borrow operations are USDC-only, enforced at SDK level. Tokens not in the registry are invisible in Audric. Users who hold unsupported tokens can manage them via SuiVision or any Sui wallet.

- Gate for adding new tokens to Tier 2: confirmed deep Cetus liquidity + clear user need (store of value, ecosystem participation, or reward token). If both conditions met, add to registry. Otherwise do not add — Audric does not support it.

- NAVX and vSUI (CERT) are both required in Tier 2: NAVI distributes both as lending reward tokens. The auto-compound path (claim rewards → Cetus reward→USDC swap → NAVI deposit) depends on both being in the featured swap registry.

The product narrative this creates: “Audric is a USDC financial copilot. Save, borrow, send, and earn — all in USDC. Swap between 13 curated tokens. That’s it.” Audric is not a wallet. It’s not a DEX. The limited scope is the feature.

## LLM cost strategy and self-hosted path

Every user conversation in Audric hits the Claude API. At 100 beta users this is negligible. At 10,000 active users running 3 sessions per day it is \$180/day — \$65,700 per year — before a single cent of margin. This section covers how to keep that cost under control as Audric scales, how to charge users appropriately, and the path to a self-hosted model that reduces costs by ~67% and becomes a product differentiator in its own right.

### Cost reality

|                                             |                                                      |
|---------------------------------------------|------------------------------------------------------|
| **Scenario**                                | **Claude API cost (all-in)**                         |
| 100 users × 3 sessions/day (now)            | ~\$1.80/day — absorb entirely                        |
| 1,000 users × 3 sessions/day                | ~\$18/day — add \$0.01/session allowance charge      |
| 3,000–5,000 users × 3 sessions/day          | ~\$54–\$90/day — spin up Qwen3 instance, route reads |
| 10,000 users × 3 sessions/day (full hybrid) | ~\$60/day (vs \$180 all-Claude) — 67% saving         |

### AI session charge — how users pay for token costs

\$0.01 USDC per AI conversation, deducted via the pre-approved feature allowance. At 2x the actual Claude cost this provides margin and funds the path to self-hosted. The user does not see this as “paying for AI” — it is part of the Audric features budget that already covers morning briefings and alerts. A heavy user doing 3 conversations per day pays \$0.90/month in AI usage — less than a single coffee.

- Phase 1 action: instrument token usage now. ✅ DONE — SessionUsage table tracks per-invocation tokens (input, output, cache read, cache write), costUsd (with proper cache pricing), toolNames array, and model. Dropped unused LlmUsage table. logSessionUsage fires on both chat + resume routes (demo sessions as 'anonymous'). GET /api/stats exposes aggregates.

- Phase 1 action: add \$0.01/session deduction to the allowance model alongside morning briefing and yield alert fees. Deducted via the same ECS cron that handles other feature charges.

- At 3,000–5,000 users, session charge revenue covers most of the Claude API cost. Margin from the 2x pricing funds the GPU instance for self-hosted migration.

### Self-hosted model — hybrid routing strategy

The recommended model is Qwen3-30B (thinking mode disabled). It has strong function calling — critical because the Audric engine relies heavily on tool use for every financial read and write. Gemma 4 is a strong alternative but function calling is less battle-tested at this point. The strategy is hybrid routing, not a full switch: route cheap high-volume calls to self-hosted, keep Claude for high-stakes and complex reasoning.

|                      |                                                                                |                        |                                               |
|----------------------|--------------------------------------------------------------------------------|------------------------|-----------------------------------------------|
| **Tool type**        | **Examples**                                                                   | **Route to**           | **Rationale**                                 |
| Read tools           | balance_check, rates_info, savings_info, health_check, transaction_history     | **Qwen3 self-hosted**  | Deterministic, structured output, high volume |
| Morning briefing gen | Template-based, structured data in, short text out                             | **Qwen3 self-hosted**  | Low reasoning requirement, runs at scale      |
| Simple write tools   | save_deposit, send_transfer — clear intent, well-defined params                | **Qwen3 + validation** | Low ambiguity, strict output validation layer |
| Complex write tools  | borrow, repay, swap — real money, edge cases, high accuracy needed             | **Claude (keep)**      | Cost of hallucination \>\> cost of API call   |
| Free-form reasoning  | explain_tx, financial advice, multi-turn complex queries, web_search synthesis | **Claude (keep)**      | Quality difference most visible here          |

### Self-hosted infrastructure

- Model: Qwen3-30B, thinking mode disabled. Strong function calling — critical for the Audric tool system. Runs on a single A100 80GB.

- Hosting: Lambda Labs or RunPod at ~\$2/hr = \$1,440/month. At 3,000–5,000 users this is cheaper than routing all calls to Claude. Not worth it below ~3,000 active users.

- The AnthropicProvider in @t2000/engine is already abstracted behind a provider interface. Swapping to a self-hosted endpoint for specific tool types is a routing config change, not a rewrite.

- Conversation logs (Phase 1) become the fine-tuning dataset. A model fine-tuned on real Audric financial conversations will outperform a generic Qwen3 base on financial intent classification and tool calling accuracy.

### Self-hosted as a product feature

Once self-hosted is running, it becomes a trust and privacy differentiator: “Privacy mode — your financial queries are processed on Audric’s own servers, never sent to a third-party AI provider.” This is a genuine differentiator from every other fintech app and it turns a cost-saving infrastructure decision into a product feature that users can opt into. The MPP gateway charges for external API calls while keeping financial reasoning in-house — a compelling story for privacy-conscious users.

### Sequencing

- Now (100 users): absorb costs entirely, ✅ CostTracker instrumented to NeonDB (SessionUsage), add \$0.01/session allowance charge

- 1,000 users: session charge covers most API cost, conversation logs start accumulating fine-tuning data

- 3,000–5,000 users: spin up Qwen3-30B on A100, route read tools and morning briefing generation to self-hosted, keep Claude for write tools and complex reasoning

- 10,000+ users: full hybrid routing, ~67% cost reduction, launch privacy mode as product feature, begin fine-tuning on accumulated conversation data

## Deprioritised items

These are valid features that should not be built yet. Revisit when the core habit loop is validated with real retention data.

|                  |                                                                                                                 |            |               |
|------------------|-----------------------------------------------------------------------------------------------------------------|------------|---------------|
| **Feature**      | **What it does**                                                                                                | **Effort** | **Tag**       |
| Chrome extension | Pay for any API from any browser tab. Strong distribution, high support burden.                                 | —          | After Phase 3 |
| Voice input      | Web Speech API. Distribution feature not retention feature.                                                     | —          | After Phase 3 |
| iOS app          | Native speech recognition, biometric confirmation. Requires Phase 1–3 proven and creator marketplace validated. | —          | Phase 6+      |
| gRPC migration   | Plan in June 2026. Do not start before Phase 3 ships.                                                           | —          | July 2026     |
| Self-hosted LLM  | Premature until user volume justifies. Start logging data now.                                                  | —          | When volume   |
| BYOK services    | Nice-to-have but adds complexity. Users who need it have other tools.                                           | —          | Deprioritised |
| Pepesto          | EU-only, niche. Not core to the AI money manager story.                                                         | —          | Deprioritised |

## Timeline summary

|              |              |                                                                                                             |                      |
|--------------|--------------|-------------------------------------------------------------------------------------------------------------|----------------------|
| **Phase**    | **Timeline** | **Key deliverables**                                                                                        | **Retention impact** |
| **Pre-work** | Days 1–3    | Conversation logging, strip multi-asset, User table, email capture, asset tiers, fix APY, swap fee (Overlay)                                                         | Data foundation ✅   |
| **Phase 1**  | Weeks 1–2    | ✅ allowance.move, ✅ Spec 2 (session auth), ✅ digest replay protection, ✅ notifications (1.1), ✅ HF alerts (1.2), ✅ onboarding wizard (SDK 0.23.0), ✅ activity feed (1.6), ✅ CostTracker + Stats API, ✅ morning briefing (1.3) + deep links (1.3.1). Remaining: goals (1.4), onboarding (1.5), session charge | Daily habit          |
| **Phase 2**  | Weeks 3–5    | Receive: payment links, QR, invoices, AlchemyPay on/off-ramp, send memo                                     | New acquisition      |
| **Phase 3**  | Weeks 6–8    | Auto-compound, yield alerts, DCA/scheduled, MPP discovery, gifting reminders, credit UX                     | Copilot moat         |
| **Phase 4**  | Weeks 9–10   | SQS async worker, ElevenLabs, Suno, Runway, Heygen                                                          | MPP expansion        |
| **Phase 5**  | Weeks 11–13  | audric.ai/username storefronts, song + art listing, tweet-to-pay, merch bundles (Printful), 8% platform fee | Creator acquisition  |

## Key decisions and principles

- Health factor alerts are always free — safety features are not premium features

- The allowance model must feel like 'approve \$0.50' not 'sign a contract' — language is everything

- DCA scheduled actions require 5 manual confirmations before going autonomous — earn trust incrementally

- USDC locked on async job submit, settled on success only — users never pay for failed generations

- Suno commercial licence costs $12/mo — confirmed available, budget line item from Phase 4 onwards

- Receive is USDC on Sui only for v1 — AlchemyPay is optional secondary, not the primary pitch

- Log conversations from day one — every day without data is fine-tuning capacity permanently lost

- USDC is the only asset in the financial layer (save, borrow, receive, yield, allowances, marketplace, MPP) — but Send supports all Tier 2 tokens so users can transfer any featured asset they hold

- 13 curated swap assets (SUI, BTC, ETH, GOLD, DEEP, WAL, NS, IKA, CETUS, NAVX, vSUI, LOFI, MANIFEST) — hold and trade only, not saveable or borrowable. Add new tokens only when there is specific user demand and confirmed Cetus liquidity

- The morning briefing is the forcing function for Phase 1 — it makes you build the notification backbone everything else reuses

- Marketplace recommendations never trigger on financial queries — Audric’s role as a financial copilot always takes precedence over storefront discovery

- t2000 remains MIT. Audric repo moves to BSL 1.1 (Change Date: April 2030) — code is auditable, not commercially forkable. One-time action before scaling

audric.ai | t2000.ai | mpp.t2000.ai | April 2026 | Confidential