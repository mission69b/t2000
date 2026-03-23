# t2000 v3 — Frictionless Banking for Everyone

> From CLI-first to universal access. zkLogin + Web App + Chrome Extension.

**Created:** March 2026
**Status:** Spec / Pre-implementation

---

## Vision

t2000 v1–v2 proved the concept: AI agents can have bank accounts on Sui. But the current product requires a terminal, npm, and key file management. This limits the audience to developers and power users.

**v3 makes t2000 accessible to anyone with a Google account.**

The core insight: the SDK doesn't change. `agent.save()`, `agent.pay()`, `agent.borrow()` — all the same. What changes is:

1. **Auth layer** — zkLogin (Google Sign-In) alongside traditional keypairs
2. **Presentation layer** — Web app, Chrome extension, iOS (eventually)
3. **Distribution** — No install required, auto-updated, works on mobile

---

## Product Decisions

These decisions apply across all v3 work. They're non-negotiable.

| Question | Decision |
|----------|----------|
| **Primary interaction model?** | **Conversational dashboard.** Balance + rewards always visible at top. AI feed in the middle. Suggestion chips pinned at bottom. AI never executes without user tapping Confirm. |
| **Why not traditional UI?** | t2000's differentiator is AI. Wrapping it in a button-based banking UI wastes the product's core strength. The MCP/CLI experience proves conversational works — the web app should be the same experience in a browser. |
| **MVP scope?** | 2 screens: Landing, Conversational Dashboard (+ Settings as a slide-over). Everything happens in the feed. No separate /send, /invest, /services pages. |
| **How do users fund their wallet?** | Copy address → send USDC from any Sui wallet or exchange. Moonpay on-ramp as fast-follow. |
| **Morning briefing?** | No separate "briefing." The dashboard is ALWAYS smart — it shows dynamic cards based on account state: unclaimed rewards, idle funds + earning potential, better rates, overnight earnings, alerts. The AI has already done the analysis. |
| **How does the user interact?** | **Chips first — the user should never have to type.** Every action is reachable by tapping chips. (1) Tap suggestion chip → guided flow with sub-chips → confirmation card. (2) Text input exists as a power-user shortcut, not the primary path. Simple commands parsed client-side; complex queries hit a fast LLM. |
| **LLM cost?** | Chips are FREE — 100% client-side, no LLM. Typed simple commands also free (client-side parse). Only freeform/complex typed queries hit the LLM (~$0.001-0.003 per query). Most users never trigger the LLM. |
| **Mobile-first or desktop-first?** | Mobile-first responsive. Input + chips always pinned at bottom. |
| **Session expiry UX?** | Proactive alert in the feed: "Your session expires tomorrow. [Refresh now]" |
| **Both keypair + zkLogin?** | Yes. Web app = zkLogin only. CLI = keypair only. No cross-referencing. |
| **Onboarding?** | Landing → Google OAuth → Loading → Dashboard (empty state with funding CTA + feature explainer). |
| **Transaction confirmation?** | Every action: AI shows confirmation card (amount, fee, gas, outcome) → user taps Confirm → result appears in feed. No silent execution, ever. |
| **Error states?** | Errors appear as cards in the feed. Human-readable, actionable: "Your savings can't be withdrawn right now — repay some of your loan first. [Repay Loan]" |
| **Services (MPP)?** | Services are invisible infrastructure. User says "buy a $25 Uber Eats gift card for sarah@gmail.com" → confirmation card → confirm → receipt with code. User never sees an API. Gift card brand grid accessible via [Services] chip for browsing. |
| **Google Client ID?** | One Client ID shared across web app + Chrome extension. Permanent, irreversible — `aud` is baked into every user's address. |
| **Cross-platform sync?** | SDK is single source of truth. All platforms import `@t2000/sdk`. Type errors surface at build time. |

---

## Current State

| Channel | Audience | Friction |
|---------|----------|----------|
| CLI (`@t2000/cli`) | Developers | npm install, terminal, key file, PIN |
| SDK (`@t2000/sdk`) | Integrators | npm install, key management |
| MCP (`@t2000/mcp`) | AI agents (Claude/Cursor) | npm install, Claude Desktop required |
| HTTP API (`t2000 serve`) | Any language | CLI must run locally |

**Key friction points:**
- Every user needs a terminal
- Every update requires `npm update`
- Key files live on disk — lose the file, lose funds
- Mobile users can't participate at all
- No visual interface for non-technical users

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Auth Layer                                    │
│                                                                      │
│  zkLogin (Google/Apple)          Traditional Keypair                  │
│  ┌──────────────────┐           ┌──────────────────┐                │
│  │ OAuth → JWT      │           │ suiprivkey1q...   │                │
│  │ Ephemeral key    │           │ PIN-encrypted     │                │
│  │ ZK proof         │           │ ~/.t2000/         │                │
│  │ Session-scoped   │           │ Persistent        │                │
│  └────────┬─────────┘           └────────┬─────────┘                │
│           │                              │                           │
│           ▼                              ▼                           │
│  ┌──────────────────────────────────────────────────┐               │
│  │              @t2000/sdk (unchanged)               │               │
│  │  save · borrow · send · pay · invest · exchange   │               │
│  └──────────────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────────────┘
           │              │              │              │
           ▼              ▼              ▼              ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
    │ Web App  │  │ Chrome   │  │   CLI    │  │   MCP    │
    │ app.     │  │ Extension│  │ terminal │  │ Claude   │
    │ t2000.ai │  │          │  │          │  │ Cursor   │
    └──────────┘  └──────────┘  └──────────┘  └──────────┘
    Phase 1        Phase 2        Existing      Existing
```

---

## The $0 Problem — Funding Strategy

Every feature depends on the user having funds. A $0 dashboard is a dead product. This is the most important UX challenge in v3.

### Day 1 (MVP)

**Copy address + external transfer.** The user copies their Sui address and sends USDC from:
- Another Sui wallet (Slush, Sui Wallet, Ethos)
- A centralized exchange (Binance, Coinbase, Bybit — all support Sui USDC)
- A friend/colleague who already has t2000

The dashboard empty state makes this dead simple — address copy is front and center (see Onboarding Flow below).

### Fast-Follow

**Moonpay widget** (roadmap Phase 20a). Embed a fiat on-ramp directly in the app:
- User clicks "Buy USDC" → Moonpay widget opens
- Card payment → USDC delivered to their t2000 address
- ~2-3 day integration using Moonpay's SDK

### Future

- **Direct bank transfer** (ACH/SEPA → USDC via Circle or Bridge)
- **Cross-chain bridge** (CCTP for cross-chain USDC, roadmap Phase 15)
- **Receive from other t2000 users** (QR code via "receive" chip or command in the feed)

---

## Onboarding Flow — Step by Step

The most critical user journey. Every second of friction = drop-off.

### Screen 1: Landing (`app.t2000.ai`)

```
┌──────────────────────────────────────┐
│                                      │
│              t2000                   │
│                                      │
│    A bank account that works         │
│    for you.                          │
│                                      │
│    Your money earns 6-8% while       │
│    you sleep.                        │
│                                      │
│    Pay for any service — no          │
│    accounts, no subscriptions.       │
│                                      │
│    Invest in crypto and gold         │
│    with one tap.                     │
│                                      │
│    ┌──────────────────────────────┐  │
│    │   🔵 Sign in with Google    │  │
│    └──────────────────────────────┘  │
│                                      │
│    Sign in with Google. That's it.   │
│    No app to download. No keys       │
│    to remember.                      │
│                                      │
└──────────────────────────────────────┘
```

Below the fold (scroll down):

```
┌──────────────────────────────────────┐
│                                      │
│  How it works                        │
│                                      │
│  1. Sign in with Google              │
│  2. Add funds                        │
│  3. That's it.                       │
│                                      │
│  ┌──────────────────────────────┐   │
│  │   🔵 Sign in with Google    │   │
│  └──────────────────────────────┘   │
│                                      │
│  Already use the CLI? →             │
│                                      │
└──────────────────────────────────────┘
```

**Design notes:**
- Zero jargon above the fold. No: yield, USDC, DeFi, seed phrase, keys, blockchain, Sui
- Above the fold does all the selling: earn, services, invest — three value props + CTA
- Below the fold is just a 3-step reassurance and a second CTA. No feature cards — they repeat what's already above the fold
- "Already use the CLI?" is a tiny footnote for power users
- The entire landing page should fit on ~1.5 screens of scrolling. If the user isn't convinced by the above-the-fold, 4 more feature cards won't change their mind

### Screen 2: Google OAuth

Standard Google consent screen. User authorizes.

### Screen 3: Loading → Dashboard (3-8 seconds)

```
┌──────────────────────────────────────┐
│                                      │
│    Creating your account...          │
│                                      │
│    ✓ Account created                 │
│    ✓ Address generated               │
│    ◌ Securing your account...        │
│                                      │
│    ━━━━━━━━━━━━━━━━━━░░░░░░  75%    │
│                                      │
└──────────────────────────────────────┘

         ↓ (steps complete)

┌──────────────────────────────────────┐
│                                      │
│        ✓ You're all set!             │
│                                      │
└──────────────────────────────────────┘

         ↓ (auto-redirect after 1s)

         Dashboard (empty state)
```

The loading screen covers ZK proof generation time. Progress steps give confidence. When complete, a brief "You're all set!" celebration (1 second), then straight to the dashboard empty state. No interstitial Welcome + Fund screen — the dashboard empty state handles funding guidance.

### Screen 4: Conversational Dashboard

The dashboard is the entire app. Three zones, always the same layout:

- **Top:** Balance + rewards (fixed)
- **Middle:** Smart cards (adapts to account state — the AI has already figured out what needs attention)
- **Bottom:** Input + chips (fixed)

The magic: **every time the user opens the app, the AI has analyzed their account and shows what matters.** No generic greeting. No "Welcome back." The dashboard IS the intelligence.

#### The Dashboard (always smart)

The feed shows **smart cards** based on the user's actual account state. It adapts every time. Here's a user with idle funds, unclaimed rewards, and a better rate available:

```
┌──────────────────────────────────────┐
│  t2000                    [G] [⚙]   │
│──────────────────────────────────────│
│                                      │
│  $985.00                             │
│  Checking $105  ·  Savings $880      │
│                                      │
│──────────────────────────────────────│
│                                      │
│  🏆 $12.40 in rewards               │
│  [Claim $12.40]                      │
│                                      │
│  💰 $105 idle — could earn           │
│  $0.59/mo at 6.8%                    │
│  [Move to savings]                   │
│                                      │
│  📈 NAVI is offering 7.1% vs your   │
│  6.8%. That's $0.25/mo more.        │
│  [Switch]              [Dismiss]    │
│                                      │
│──────────────────────────────────────│
│  ┌────────────────────────────────┐  │
│  │ What would you like to do?  [→]│  │
│  └────────────────────────────────┘  │
│  [Save] [Send] [Services] [More...] │
└──────────────────────────────────────┘
```

Each smart card is one insight + one action. The AI did the math — the user just taps.

#### What Smart Cards Appear (and When)

The dashboard is never static. It shows 0-4 cards based on real account state:

| Card | Shows when | What it says | Action | MCP tool | Phase |
|------|-----------|-------------|--------|----------|-------|
| **🏆 Rewards** | Unclaimed rewards > $0 | "$12.40 in rewards" | [Claim $12.40] | `t2000_pending_rewards` → `t2000_claim_rewards` | MVP |
| **💰 Idle funds** | Checking > $10 | "$105 idle — could earn $0.59/mo at 6.8%" | [Move to savings] | `t2000_overview` → `sweep` prompt | MVP |
| **📈 Better rate** | Another protocol offers > 0.3% more | "7.1% vs your 6.8%. $0.25/mo more." | [Switch] [Dismiss] | `t2000_all_rates` → `t2000_rebalance` | MVP |
| **💵 Overnight earnings** | First open of the day | "Earned $1.42 overnight" | — (informational) | `t2000_earnings` | MVP |
| **← Received funds** | Incoming transfer detected | "Received $500 from 0x7f..." | [Save it] [Invest it] | `t2000_balance` polling | MVP |
| **⚠ Risk** | Health factor low or concentration high | "Repay a little to stay safe" | [Repay $50] [Why?] | `t2000_health` / `risk-check` | MVP |
| **⚠ Session** | Expires within 48h | "Session expires tomorrow" | [Refresh] | Client-side check | MVP |
| **✨ Optimize** | Multiple things can be improved | "3 things to optimize — all in one tap." | [Optimize all] | `t2000_overview` → `optimize-all` prompt | Post-MVP |
| **🎯 Savings goal** | User has set a goal | "$880 of $2,000 goal (44%)" | [Add more] | `savings-goal` prompt | Post-MVP |
| **📅 Weekly recap** | Monday / first open of the week | "This week: earned $3.50, sent $50" | [Full report] | `weekly-recap` prompt | Post-MVP |

MVP ships with 7 smart cards — each one shows one insight and one action. The individual cards (Rewards, Idle funds, Better rate) cover everything [Optimize all] would batch — users just tap each one separately. [Optimize all], Savings goal, and Weekly recap are post-MVP polish.

If nothing needs attention (everything is optimized), the feed just shows:

```
│  ✅ Your account is working for you. │
│  Earning 6.8% on $880.              │
```

That's a good thing — it means the product is doing its job.

#### First Login of the Day

Same layout, but the overnight earnings card appears at the top:

```
│  💵 You earned $1.42 overnight       │
│                                      │
│  🏆 $12.40 in rewards               │
│  [Claim $12.40]                      │
│                                      │
│  💰 $105 idle — could earn           │
│  $0.59/mo at 6.8%                    │
│  [Move to savings]                   │
```

Not a "morning briefing" section — just the smart cards doing their job. The overnight earnings card is one of several, not a special mode.

#### After Completing an Action

The result appears as a card in the feed. The balance updates. Smart cards recalculate:

```
│  ✓ Saved $100. Now earning 6.8%     │
│  on $980.                            │
│                                      │
│  🏆 $12.40 in rewards               │
│  [Claim $12.40]                      │
```

The idle funds card disappears (because the user just moved them). The rewards card stays (still unclaimed). The dashboard is always current.

#### Rewards — How It Works

Rewards accrue from the t2000 protocol. They accumulate and the user claims them with one tap:

- **Visible:** Always shown in the smart cards when > $0
- **Claim:** Tap [Claim $12.40] → confirmation card → one tap → rewards deposited to checking
- **Where they go:** Claimed rewards land in checking. The idle funds card then suggests moving them to savings.

```
│  🏆 $12.40 in rewards               │
│  [Claim $12.40]                      │
│                                      │
│  → User taps [Claim $12.40]         │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  Claim $12.40 rewards           │  │
│  │  Deposited to checking          │  │
│  │                                │  │
│  │  [✓ Claim]         Cancel      │  │
│  └────────────────────────────────┘  │
│                                      │
│  → After confirming:                │
│                                      │
│  ✓ Claimed $12.40 in rewards.       │
│                                      │
│  💰 $117.40 idle — could earn       │
│  $0.66/mo at 6.8%                    │
│  [Move to savings]                   │
```

The chain: claim rewards → idle funds card updates → user moves to savings → everything is optimized. Each step is one tap.

#### Rate Rebalancing

When a better rate is available, the smart card shows the exact dollar difference:

```
│  📈 NAVI is offering 7.1% vs your   │
│  6.8% on Suilend. That's $0.25/mo   │
│  more on your $880.                  │
│  [Switch to NAVI]      [Dismiss]    │
```

Tapping [Switch] → confirmation card showing the move (withdraw from Suilend, deposit to NAVI) → one tap → done. The user never had to compare rates manually.

If the user dismisses, the card doesn't reappear until rates change again.

**How it works:**

**The user should never have to type.** Every action is reachable by tapping chips. The text input is a power-user shortcut.

1. **Tap a suggestion chip** → Guided flow with sub-chips → Confirmation card. No LLM. No typing. **This is the primary path.**
2. **Tap a smart card action** → Confirmation card → one tap. Even faster than chips.
3. **Type a command** (power-user shortcut) → Client-side parse or LLM → Confirmation card.

Only 4 chips visible — one row on mobile. [More...] opens everything else. Smart cards handle the most common next actions automatically.

#### Power-User Shortcut: Typed Commands

For users who prefer typing, commands work identically to chip flows. **This is not the primary path** — it's a shortcut for power users.

**"Save $500"** → Client-side parse (no LLM) → Instant:

```
┌──────────────────────────────────────┐
│                                      │
│  You: Save $500                      │
│                                      │
│  🤖 I'll deposit $500 to savings    │
│  at 6.8%. You'll earn ~$2.83/mo.    │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  Save $500 · earning 6.8%      │  │
│  │  Fee: $0.50                     │  │
│  │                                │  │
│  │  [✓ Save $500]     Cancel      │  │
│  └────────────────────────────────┘  │
│                                      │
└──────────────────────────────────────┘
```

**After confirming:**

```
│  ✓ Done! $500 deposited to savings. │
│  You're now earning ~$7.82/month.   │
│                                      │
│  New balances:                       │
│  Checking: $405  ·  Savings: $1,380 │
```

**"Send $50 to alice"** → Client-side parse. If "alice" is in recents, instant. If not, asks:

```
│  You: Send $50 to alice              │
│                                      │
│  🤖 I found Alice in your recents:  │
│  Alice — 0x1a2b...cdef              │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  Send $50 to Alice              │  │
│  │  (0x1a2b...cdef)               │  │
│  │                                │  │
│  │  [✓ Send $50]      Cancel      │  │
│  └────────────────────────────────┘  │
```

If alice isn't in recents:

```
│  🤖 I don't have an address for     │
│  "alice." Paste or scan their       │
│  address:                            │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ 0x...                           │  │
│  └────────────────────────────────┘  │
│  [📋 Paste]  [📷 Scan QR]          │
```

**After a successful send, toast:** "Name this address?" → user types "Alice" → saved for next time.

#### Complex Queries (LLM — Tier 3)

These are the queries where LLM adds genuine value. Most are also reachable via [More...] → [Report], but the LLM can synthesize richer, more personalized responses.

**"Give me a full financial report"** → LLM generates rich response:

```
│  🤖 Here's your account overview:   │
│                                      │
│  Total: $985                         │
│  Checking: $105  ·  Savings: $880   │
│                                      │
│  Earnings this month: $4.99          │
│  Lifetime: $12.40                    │
│  Rate: 6.8%                          │
│                                      │
│  💡 You have $105 idle — moving it  │
│  to savings would earn ~$0.59/mo.   │
│                                      │
│  [Move idle funds]                   │
```

Simple, scannable, actionable. No tree diagrams or percentage breakdowns — just the numbers that matter and one clear recommendation.

**"What's my portfolio performance?"** → LLM:

```
│  🤖 This month: +$5.39              │
│                                      │
│  Savings earned $4.99                │
│  SUI is up $0.40                     │
│                                      │
│  That's 600x more than a savings    │
│  account.                            │
```

#### Chip-Guided Flows (Zero Typing Required)

Every action is reachable by tapping chips. No typing, no guessing. The chips are a decision tree — each tap narrows the action until it produces a confirmation card.

**Level 1 chips** (always visible — one row, 4 chips):

```
[Save] [Send] [Services] [More...]
```

**[More...]** expands to:

```
[Borrow] [Invest] [Swap] [Withdraw]
[Report] [History] [Receive] [Sentinels]
[Help]
```

Every Level 1 chip opens a Level 2 guided flow:

---

**[Save]** → amount sub-chips → confirm

```
│  🤖 Save to earn 6.8%.               │
│  You have $105 available.            │
│                                      │
│  [$50] [$100] [All $105]            │
│                                      │
│  → User taps [$100]                 │
│                                      │
│  🤖 Save $100 at 6.8%.               │
│  You'll earn ~$0.57/month.           │
│                                      │
│  [✓ Save $100]       Cancel         │
```

Two taps. Done.

---

**[Send]** → recipient sub-chips → amount sub-chips → confirm

```
│  🤖 Who do you want to send to?     │
│                                      │
│  [Alex] [Mom] [0x9c4d...ab12]       │
│  [📋 Paste Address] [📷 Scan QR]    │
│                                      │
│  → User taps [Mom]                  │
│                                      │
│  🤖 How much to Mom?                │
│  Available: $105                     │
│                                      │
│  [$10] [$25] [$50] [All]            │
│                                      │
│  → User taps [$50]                  │
│                                      │
│  [✓ Send $50 to Mom]    Cancel      │
```

Three taps. No typing.

---

**[Borrow]** → amount sub-chips → confirm (under [More...])

```
│  🤖 Borrow against your savings.    │
│  You can borrow up to $440.          │
│                                      │
│  [$50] [$100] [$200]                │
│                                      │
│  ✓ Safe to borrow                    │
│  Monthly interest: ~$0.42            │
│                                      │
│  → User taps [$100]                 │
│                                      │
│  [✓ Borrow $100]       Cancel       │
```

---

**[Withdraw]** → amount sub-chips → confirm (under [More...])

```
│  🤖 Withdraw from savings.          │
│  You have $880 saved.                │
│                                      │
│  [$50] [$100] [$200] [All]          │
│                                      │
│  → User taps [$200]                 │
│                                      │
│  [✓ Withdraw $200]     Cancel       │
```

---

**[Invest]** → asset sub-chips → amount sub-chips → confirm (under [More...])

```
│  🤖 What would you like to invest    │
│  in?                                 │
│                                      │
│  [SUI] [BTC] [ETH] [GOLD]          │
│                                      │
│  → User taps [SUI]                  │
│                                      │
│  🤖 Buy SUI at $0.995.              │
│                                      │
│  [$25] [$50] [$100] [$500]          │
│                                      │
│  → User taps [$100]                 │
│                                      │
│  [✓ Buy $100 SUI]      Cancel      │
```

---

**[Swap]** → from/to sub-chips → amount → confirm (under [More...])

```
│  🤖 Swap between tokens.            │
│                                      │
│  From: [Dollars ▼]                  │
│  To:   [SUI] [BTC] [ETH]           │
│                                      │
│  → User taps [SUI]                  │
│                                      │
│  [$25] [$50] [$100]                 │
│                                      │
│  → User taps [$50]                  │
│                                      │
│  🤖 $50 → ~50.25 SUI                │
│  [✓ Swap]              Cancel       │
```

---

**[Services]** → category sub-chips → service cards/forms

Opens the service browser as a bottom sheet overlay (see Services Panel wireframe below for full layout). Tapping a brand card → amount sub-chips → email input → confirmation card → result back in the feed.

For services like Image Gen where a prompt is needed, tapping the card opens a simple text field — this is one of the few places where typing is required because the input is creative/freeform by nature.

---

**[Report]** → instant account overview (no sub-chips needed)

Tapping [Report] immediately shows your account summary — no extra taps:

```
│  🤖 Here's your account:            │
│                                      │
│  Total: $985                         │
│  Checking: $105  ·  Savings: $880   │
│  Earned this month: $4.99            │
│  Rate: 6.8%                          │
│                                      │
│  [Move idle funds]  [History]       │
```

---

**[Receive]** → instant result, no sub-chips needed (under [More...])

```
│  🤖 Here's your address:            │
│                                      │
│  ┌─────────────────────┐            │
│  │     [QR CODE]       │            │
│  └─────────────────────┘            │
│  0x8b3e...d412                       │
│  [📋 Copy]  [↗ Share]              │
```

---

**[Rates]** → instant result (under [More...])

```
│  🤖 Your current rate: 6.8%         │
│                                      │
│  Best available: 7.1%                │
│                                      │
│  [Switch to better rate]             │
```

---

**[Help]** → feature overview with sub-chips (under [More...])

```
│  🤖 Here's what I can do:           │
│                                      │
│  💰 Save — Earn 6-8% on idle funds  │
│  ↗ Send — Send money to anyone      │
│  💳 Borrow — Borrow against savings │
│  📈 Invest — Buy crypto and gold    │
│  🔄 Swap — Exchange between tokens  │
│  🎁 Services — Gift cards, AI,      │
│     image gen, search, and more      │
│  📊 Report — Financial overview     │
│                                      │
│  Just tap any chip below to start.   │
│                                      │
│  [Save] [Send] [Services] [More...] │
```

---

**When is typing required?**

Only in three cases:
1. **Paste an address** (when sending to someone not in recents)
2. **Enter a recipient email** (for gift cards — but could use a contact picker post-MVP)
3. **Creative prompts** (image generation, AI chat — the input IS the product here)

Everything else is tappable. The text input field exists for power users who want shortcuts like "send $50 to alice" — but a user who never types a single character can still use 100% of the product.

#### Services in the Conversational Flow

MPP services become invisible infrastructure. The user never navigates to a "services page" — they just say what they want and results appear in the feed.

**"Buy a $25 Uber Eats gift card for sarah@gmail.com"** → Client-side parse ("uber eats" fuzzy matches gift card brand):

```
│  You: Buy a $25 uber eats gift      │
│  card for sarah@gmail.com            │
│                                      │
│  🤖 I'll send a $25 Uber Eats gift  │
│  card to sarah@gmail.com.           │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  🍔 Uber Eats Gift Card        │  │
│  │  Amount:  $25.00                │  │
│  │  To:      sarah@gmail.com       │  │
│  │  Cost:    $25.50                │  │
│  │           ($0.50 service fee)   │  │
│  │                                │  │
│  │  [✓ Send Gift Card]            │  │
│  │           Cancel / Edit         │  │
│  └────────────────────────────────┘  │
```

After confirming:

```
│  ✓ Gift Card Sent!                   │
│                                      │
│  🍔 Uber Eats — $25.00              │
│  Sent to sarah@gmail.com            │
│                                      │
│  Redemption Code                     │
│  ┌────────────────────────────────┐  │
│  │  UBER-A8F2-K9D3-P4M7    [📋] │  │
│  └────────────────────────────────┘  │
│                                      │
│  $25.50 from your balance            │
```

**"Generate an image of a sunset over mountains"** → LLM routes to image gen:

```
│  You: Generate an image of a sunset  │
│  over mountains                      │
│                                      │
│  🤖 Generating your image...        │
│                                      │
│  ┌────────────────────────────────┐  │
│  │                                │  │
│  │        [Generated Image]       │  │
│  │                                │  │
│  └────────────────────────────────┘  │
│                                      │
│  [💾 Save] [↗ Share] [🔄 Redo]     │
│                                      │
│  $0.04 from your balance             │
```

**"Search for flights from NYC to Tokyo in April"** → LLM:

```
│  🤖 Here are flights NYC → Tokyo    │
│  in April:                           │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  ANA Direct       Apr 12      │  │
│  │  JFK → NRT  14h   $890   [→] │  │
│  ├────────────────────────────────┤  │
│  │  JAL Direct       Apr 15      │  │
│  │  JFK → HND  13h   $920   [→] │  │
│  ├────────────────────────────────┤  │
│  │  United 1-stop    Apr 12      │  │
│  │  JFK → NRT  18h   $720   [→] │  │
│  └────────────────────────────────┘  │
│                                      │
│  $0.01 from your balance             │
```

The payment line — "$0.04 from your balance", "$25.50 from your balance" — is always shown casually after the result. That's the "how did it even pay for that?" moment. The user didn't enter a credit card, didn't sign up for fal.ai or Reloadly. It just worked.

#### Dashboard — Empty State ($0 balance, first login)

```
┌──────────────────────────────────────┐
│  t2000                    [G] [⚙]   │
│──────────────────────────────────────│
│                                      │
│  $0.00                               │
│  Welcome to t2000                    │
│                                      │
│──────────────────────────────────────│
│                                      │
│  🤖 Welcome! Your account is ready. │
│                                      │
│  To get started, add funds:          │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  Your address:                  │  │
│  │  0x8b3e...d412          [📋]  │  │
│  │                                │  │
│  │  Send from any exchange         │  │
│  │  (Binance, Coinbase, etc.) or  │  │
│  │  any Sui wallet.               │  │
│  └────────────────────────────────┘  │
│                                      │
│  Once funded, just tap a chip:       │
│                                      │
│──────────────────────────────────────│
│  ┌────────────────────────────────┐  │
│  │ What would you like to do?  [→]│  │
│  └────────────────────────────────┘  │
│  [Save] [Send] [Services] [More...] │
└──────────────────────────────────────┘
```

**Design notes:**
- The empty state is conversational too. The AI welcomes the user and guides funding.
- Same chips as the funded dashboard — consistent, no context switching. Tapping [Save] or [Services] at $0 prompts "Add funds first" with the address copy card.
- When funds arrive (detected via polling), a proactive card appears: "You received $1,000! [Save it] [Invest it] [Keep it]" — actionable chips, no typing.

#### Error States in the Feed

Errors appear as inline cards, not modals. They're part of the conversation:

```
│  🤖 Can't withdraw $500 right now   │
│  — you'd need to repay some of      │
│  your $200 loan first.              │
│                                      │
│  [Repay $50 first]  [Withdraw $300] │
│  [Why?]                              │
```

Plain language, no numbers the user doesn't understand, actionable chips for every option. [Why?] chip explains further without requiring the user to type.

#### Session Expiry (proactive alert in feed)

```
│  ⚠ Your session expires tomorrow.   │
│  Sign in again to keep access.      │
│                                      │
│  [Refresh Session]                   │
```

### All Other Actions — In the Feed

With the conversational model, there are no separate pages for Invest, Exchange, Borrow, Withdraw, or History. Everything happens in the feed via suggestion chips (primary) or typed commands (power-user shortcut).

**Invest** — via [Invest] → [SUI] → [$200] chips, or typed "invest $200 in SUI":

```
│  🤖 I'll buy $200 of SUI at         │
│  $0.995/SUI (~200.5 SUI).          │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  Buy $200 of SUI                │  │
│  │  ~200.5 SUI at $0.995           │  │
│  │                                │  │
│  │  [✓ Buy SUI]       Cancel      │  │
│  └────────────────────────────────┘  │
```

**Exchange** — via [More...] → [Swap] → [SUI] → [$50] chips, or typed "swap $50 to SUI":

```
│  🤖 Swap $50 → ~50.25 SUI           │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  [✓ Swap]       Cancel         │  │
│  └────────────────────────────────┘  │
```

Proactive recommendations are handled by **smart cards** on the dashboard (see Screen 4). They auto-surface based on account state — the user doesn't need to navigate anywhere to see them.

### Settings (slide-over panel)

Accessible via the [⚙] gear icon. Slides in from the right:

```
┌────────────────────────────────────┐
│  ← Settings                       │
│────────────────────────────────────│
│                                    │
│  📧 user@gmail.com                │
│  Signed in with Google             │
│                                    │
│  Address                           │
│  0x8b3e...d412             [📋]   │
│                                    │
│  Session expires: Mar 30           │
│  [Refresh Session]                 │
│                                    │
│  ────────────────────────────────  │
│                                    │
│  Contacts                          │
│  Alex · Mom · 0x9c4d...           │
│  [Manage contacts]                 │
│                                    │
│  ────────────────────────────────  │
│                                    │
│  Safety limits                     │
│  Max per transaction: $1,000       │
│  Max daily send: $5,000            │
│  [Change limits]                   │
│                                    │
│  ────────────────────────────────  │
│                                    │
│  [View on Suiscan →]              │
│  [🔴 Emergency Lock]              │
│  [Sign Out]                        │
│                                    │
└────────────────────────────────────┘
```

Settings now includes: account, session, contacts, safety limits, explorer link, emergency lock, sign out. Savings goal added post-MVP.

---

## Technical UX Decisions

These decisions prevent tech debt and ensure the "magic" feeling works reliably.

### Smart Cards — Data Freshness

The smart cards are only magic if the data is fresh. Stale data = stale recommendations = broken trust.

| Data | Polling Interval | Why |
|------|-----------------|-----|
| Balance (checking, savings) | **15s** | Must feel real-time. User just saved — balance should update fast. |
| Pending rewards | **60s** | Rewards accrue slowly. 60s is fine. |
| Rates (all protocols) | **120s** | Rates don't change by the second. 2 min is enough. |
| Health factor | **60s** | Important but not second-by-second. |
| Incoming transfers | **15s** | User is waiting for funds — needs to feel instant. |
| Session expiry | **Client-side timer** | No polling needed. Computed from `max_epoch`. |

**On dashboard load:**
1. Call `t2000_overview` once → populates ALL smart cards from a single call
2. Show skeleton cards while loading (gray animated placeholders — not a spinner)
3. After initial load, individual data types poll at their own intervals via TanStack Query `refetchInterval`

**When the user backgrounds the tab:** Stop polling (`refetchIntervalInBackground: false`). Resume on tab focus with an immediate refresh.

### Dry-Run Before Every Confirmation

Every confirmation card shows **real numbers from a dry-run**, not estimates. This is non-negotiable for a financial product.

```
User taps [Save] → [$100]
    │
    ▼
SDK calls t2000_save({ amount: 100, dryRun: true })
    │
    ▼
Dry-run returns exact result:
  - actual deposit: $99.95 (after rounding)
  - fee: $0.50
  - new savings balance: $979.95
  - new rate: 6.8%
  - estimated monthly yield: $5.55
    │
    ▼
Confirmation card renders with REAL numbers
    │
    ▼
User taps [✓ Save $99.95] → executes for real
```

If the dry-run fails (insufficient funds, health factor too low, protocol paused), the error card appears immediately — the user never sees a confirmation card for something that would fail.

**Loading state during dry-run:** The confirmation card renders with a subtle shimmer on the numbers while the dry-run resolves (~200-500ms). Fast enough that it feels instant.

### Optimize All — Multi-Step Execution (Post-MVP)

[Optimize all] composes multiple transactions. The user confirms once but sees the full plan. During MVP, users accomplish the same result by tapping each smart card individually (Claim → Move → Switch).

```
│  ✨ 3 things to optimize:            │
│                                      │
│  1. Claim $12.40 in rewards         │
│  2. Move $105 to savings (6.8%)     │
│  3. Switch savings to NAVI (7.1%)   │
│                                      │
│  Total improvement: +$0.84/mo       │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  [✓ Do all 3]      Cancel     │  │
│  └────────────────────────────────┘  │
```

After confirming, a progress card:

```
│  ✨ Optimizing...                     │
│                                      │
│  ✓ Claimed $12.40                    │
│  ✓ Moved $105 to savings            │
│  ◌ Switching to NAVI...              │
│  ━━━━━━━━━━━━━━━━━━░░░░  67%       │
```

If one step fails, the progress card shows what succeeded and what didn't:

```
│  ✨ Partially complete                │
│                                      │
│  ✓ Claimed $12.40                    │
│  ✓ Moved $105 to savings            │
│  ✗ NAVI switch failed — try later   │
│                                      │
│  [Retry switch]                      │
```

The user is never left in an unknown state. Each step is an independent transaction, so partial completion is fine — there's no "all or nothing" requirement.

### LLM Rate Limit UX

| Queries | Cost | What happens |
|---------|------|-------------|
| 1-10 per day | Free | Normal. No indication. |
| 11th query | $0.01 | Soft warning before sending: "This query costs $0.01. [Send] [Cancel]" |
| 11+ per day | $0.01 each | Small "$0.01" badge next to the send button. No blocking. |
| $0 checking balance | — | "Add funds to use AI queries. Chips are always free." |

The warning is inline, not a modal. It never blocks the user from using chips (which are always free). The goal is transparency, not friction.

### Multi-Device Data Sync

Same Google account = same Sui address = same on-chain state (balance, positions, rewards). But client-side data doesn't sync automatically:

| Data | Storage | Syncs across devices? | Solution |
|------|---------|----------------------|----------|
| Balance, savings, rewards | On-chain | ✓ Yes (same address) | No action needed |
| Contacts | `localStorage` | ✗ No | Server-side: `POST /api/user/contacts` (keyed by address) |
| Savings goal | `localStorage` | ✗ No | Server-side: `POST /api/user/preferences` |
| Safety limits | On-chain (safeguards contract) | ✓ Yes | No action needed |
| LLM query count | Server-side | ✓ Yes (keyed by address) | Tracked on MPP gateway |
| Session / ephemeral key | `localStorage` | ✗ No (by design) | Independent sessions per device |

**MVP approach:** Contacts and preferences stored server-side in a simple key-value store (keyed by Sui address). No new database — can use the existing NeonDB with a `user_preferences` table. This is ~1 hour of work and prevents the "where are my contacts?" frustration on a second device.

### Notifications (Out-of-App)

When the user isn't in the app, how do they know there's unclaimed rewards or a better rate?

| Channel | When | MVP? | Notes |
|---------|------|------|-------|
| **PWA push** | Rewards > $5, rate drop > 1%, received funds | Post-MVP | Limited iOS support. Works well on Android + desktop Chrome. |
| **Chrome extension badge** | Same triggers as PWA push | Phase 3 | Natural fit — badge shows count of actionable items. |
| **Email digest** | Weekly summary (like `weekly-recap` prompt) | Post-MVP | Requires opt-in. Google OAuth gives us the email. |
| **In-app only** (MVP) | All smart cards | ✓ MVP | Users see updates when they open the app. |

**MVP decision:** In-app only. The smart cards are compelling enough to bring users back. Push notifications and email are fast-follows once we prove the core loop works. Adding notifications too early adds complexity (service workers, email service, opt-in flows) without proving they're needed.

### Transaction Failure Recovery

Every transaction can fail. The UX must handle every path cleanly:

| Failure | User sees | What happens |
|---------|-----------|--------------|
| **Dry-run fails** (e.g., insufficient balance) | Error card instead of confirmation card. Actionable: `[Add funds]` or `[Try $300 instead]` | Transaction never attempted. No on-chain cost. |
| **User rejects in wallet** | "Transaction cancelled." Feed returns to idle with chips. | No retry prompt — user intentionally cancelled. |
| **Network error during submit** | "Couldn't reach the network. Your funds are safe." + `[Retry]` | SDK auto-retries once. If both fail, shows manual retry chip. |
| **Transaction reverts on-chain** | "Transaction failed — [reason from Move abort code]." + `[Try again]` or `[Ask AI why]` | Move abort codes mapped to plain language (e.g., `EPAUSED` → "Protocol is temporarily paused"). |
| **Gas sponsor unavailable** | "We're having trouble sponsoring this transaction." + `[Try again in a minute]` | Circuit breaker on gas station. Automatically clears after 60s. |
| **Timeout (no confirmation after 30s)** | "Transaction is taking longer than usual. Checking..." → auto-polls for finality | If found: success card. If not found after 60s: "We couldn't confirm. Check your balance." |

**Key principle:** The user's funds are never in an unknown state. If we can't confirm, we tell them exactly what to check. We never show "Something went wrong" without guidance.

### Loading & Skeleton States

Every interaction has three phases: **request → loading → result**. The loading state matters.

```
Chip tapped / command sent
    │
    ▼
┌──────────────────────────────────────┐
│  Input area disabled (gray)          │
│  Previous chips fade out             │
│  Skeleton card appears in feed:      │
│  ┌────────────────────────────────┐  │
│  │  ░░░░░░░░░░  ░░░░░            │  │
│  │  ░░░░░░░░░░░░░░░░░░           │  │
│  │  [░░░░░░░]  [░░░░░░]          │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
    │
    ▼ (~200-500ms for chips, ~1-3s for LLM)
    │
Skeleton replaced with real card (fade in)
Input area re-enabled
New chips appear
```

No spinners. No blank screens. The skeleton cards give the impression of speed even when the backend is working.

### Database Schema (MVP Additions)

```sql
-- User preferences (syncs across devices)
CREATE TABLE user_preferences (
  address    TEXT PRIMARY KEY,   -- Sui address (normalized)
  contacts   JSONB DEFAULT '[]', -- [{ name, address }]
  goal       JSONB,              -- { target_amount, label, created_at }
  limits     JSONB,              -- { max_tx, max_daily } — also enforced on-chain
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- LLM query tracking
CREATE TABLE llm_usage (
  address    TEXT NOT NULL,
  date       DATE NOT NULL,
  count      INT DEFAULT 0,
  PRIMARY KEY (address, date)
);
```

Two tables. Both simple key-value stores. The `user_preferences` table prevents the "where are my contacts on my other device" problem. The `llm_usage` table enables the rate-limit UX.

---

## Intent Routing — How Input Becomes Action

The input field at the bottom of the dashboard is the primary interaction point. It needs to be fast, cheap, and reliable.

### Three-tier routing:

```
User Interaction
    │
    ▼
┌──────────────────────────────────────────────┐
│  Tier 1: Suggestion Chips (PRIMARY PATH)     │
│  ★ THE DEFAULT. User taps chips, never types.│
│  [Save] → [$50] [$100] [All] → [✓ Save]    │
│  Guided sub-chip flows for every action.     │
│  Cost: $0.00 | Latency: 0ms | Coverage: 100%│
├──────────────────────────────────────────────┤
│  Tier 2: Client-side Parse (POWER-USER)      │
│  For users who prefer typing shortcuts.      │
│  Regex + fuzzy match on input text.          │
│  "save $500", "uber eats", "my address"     │
│  → Same confirmation card as Tier 1.         │
│  Cost: $0.00 | Latency: <100ms              │
├──────────────────────────────────────────────┤
│  Tier 3: LLM Fallback (POWER-USER)          │
│  For complex queries that need synthesis:    │
│  "compare my earnings this month vs last"    │
│  "give me a financial report"                │
│  "what should I do with $500?"               │
│  → Fast model (GPT-4o-mini or similar)       │
│  → Tool-calling to invoke SDK methods        │
│  Cost: ~$0.001-0.003 | Latency: 1-2s        │
└──────────────────────────────────────────────┘
```

**Key insight:** A user who never types a single character can use 100% of the product through chips alone. The text input is a power-user escape hatch, not the primary path.

### Client-side parsing (for typed commands):

When a user types in the text input, client-side parsing handles simple commands instantly (no LLM):

| Input | Parsed as | Action |
|-------|-----------|--------|
| "save 500" | `action: save, amount: 500` | Show save confirmation card |
| "send $50 to 0x1a2b..." | `action: send, amount: 50, to: 0x1a2b...` | Show send confirmation card |
| "borrow $100" | `action: borrow, amount: 100` | Show borrow confirmation card |
| "withdraw all" | `action: withdraw, amount: all` | Show withdraw confirmation card |
| "uber eats" | `service: gift-card, brand: uber-eats` | Show gift card form |
| "my address" / "receive" | `action: receive` | Show QR + address |
| "history" | `action: history` | Show recent transactions |
| "rates" | `action: rates` | Show current rates |
| "help" / "what can I do" | `action: help` | Show feature overview |
| "report" | `action: report` | Show financial summary |

Client-side parsing covers ~80% of typed inputs. But remember: **most users won't type at all** — they'll use chips.

### LLM tool-calling (Tier 3):

The LLM has access to the same 35 tools as the MCP server. Key ones for conversational queries:

| Tool | What it does |
|------|-------------|
| `t2000_overview` | Full account snapshot (balance, positions, rewards, health) |
| `t2000_save` / `withdraw` / `borrow` / `repay` | Core banking operations |
| `t2000_send` | Send to address or contact |
| `t2000_exchange` | Swap tokens |
| `t2000_invest` | Buy/sell crypto and gold |
| `t2000_rebalance` | Move savings to better rate |
| `t2000_claim_rewards` | Claim and convert rewards |
| `t2000_pay` | Call any MPP service |
| `t2000_all_rates` | Compare rates across protocols |
| `t2000_pending_rewards` | Check unclaimed rewards |
| `t2000_history` | Transaction history |
| `t2000_strategy` | Investment strategies |

The LLM composes these tools to answer complex queries. "Give me a financial report" calls `t2000_overview` and synthesizes the results. "What if I save $500?" does a dry-run and shows before/after. Same infrastructure as the MCP server — just running in the browser with a UI.

### Why this works for t2000 specifically:

1. **The tools already exist.** The SDK methods, MCP tools, and prompts are already built and tested. The web app reuses them.
2. **The prompts already work.** Users have validated them with Claude Desktop. The web app uses the same prompts.
3. **The action set is finite.** 35 MCP tools and 20 prompts already built and tested. Client-side chip flows cover the top ~15 actions. The LLM handles the long tail and complex multi-step queries.
4. **Every action has a confirmation step.** The LLM can't do anything without the user tapping Confirm. Safety is built in.

### MCP Tools & Prompts → Web App Mapping

The MCP server already has 35 tools and 20 prompts validated by Claude Desktop users. The web app must surface ALL of them — either as chip-guided flows, LLM-accessible tools, or both.

#### Tools → Chips + Smart Cards + LLM

All 35 MCP tools mapped to their web app surface. Nothing left behind.

**Read tools (17):**

| MCP Tool | Web App Surface | Notes |
|----------|----------------|-------|
| `t2000_overview` | **Smart cards engine** — called on every dashboard load | Powers all smart cards (rewards, idle, rates, risk) |
| `t2000_balance` | Balance header (always visible) | Auto — no chip needed |
| `t2000_address` | [More...] → [Receive] chip | QR + copy |
| `t2000_positions` | [More...] → [Report] chip | Part of account overview |
| `t2000_rates` | [More...] → [Rates] chip | Instant display |
| `t2000_all_rates` | **Better rate smart card** | Powers "7.1% vs 6.8%" comparison |
| `t2000_health` | **Risk smart card** (auto-alert when low) | Plain language warning |
| `t2000_history` | [More...] → [History] chip | Inline transaction list |
| `t2000_earnings` | **Overnight earnings smart card** | "Earned $1.42 overnight" |
| `t2000_fund_status` | [More...] → [Report] chip | Savings analytics |
| `t2000_pending_rewards` | **Rewards smart card** | "$12.40 in rewards [Claim]" |
| `t2000_deposit_info` | Dashboard empty state | Funding guidance |
| `t2000_services` | [Services] chip (populates the panel) | Auto-fetched on panel open |
| `t2000_portfolio` | [More...] → [Report] chip | Investment portfolio view |
| `t2000_contacts` | [Send] chip (populates recipient chips) | Auto-fetched on [Send] |
| `t2000_sentinel_list` | [Services] → [Sentinels] | Browse active sentinels |
| `t2000_sentinel_info` | Sentinel detail view | Model, prize pool, history |

**Write tools (16):**

| MCP Tool | Web App Surface | Notes |
|----------|----------------|-------|
| `t2000_save` | [Save] → amount chips → confirm | 2 taps |
| `t2000_withdraw` | [More...] → [Withdraw] → amount chips | 3 taps |
| `t2000_borrow` | [More...] → [Borrow] → amount chips | 3 taps |
| `t2000_repay` | [More...] → [Repay] → amount chips | 3 taps |
| `t2000_send` | [Send] → recipient chips → amount chips | 3 taps |
| `t2000_exchange` | [More...] → [Swap] → token chips → amount | 4 taps |
| `t2000_invest` | [More...] → [Invest] → asset/action chips | Buy, sell, earn, unearn |
| `t2000_invest_rebalance` | **Optimize smart card** or LLM | Move investments to better protocols |
| `t2000_strategy` | [More...] → [Invest] → [Strategies] | List, buy, sell strategies |
| `t2000_auto_invest` | [More...] → [Invest] → [Auto] | DCA setup/status/stop |
| `t2000_rebalance` | **Better rate smart card** [Switch] action | Savings yield optimization |
| `t2000_claim_rewards` | **Rewards smart card** [Claim] action | One tap claim |
| `t2000_pay` | [Services] → service cards | MPP paid calls |
| `t2000_sentinel_attack` | [Services] → [Sentinels] → [Attack] | Guided attack flow |
| `t2000_contact_add` | After [Send] → "Save as contact?" toast | Auto-prompted |
| `t2000_contact_remove` | Settings → Contacts | Contact management |

**Safety tools (2):**

| MCP Tool | Web App Surface | Notes |
|----------|----------------|-------|
| `t2000_config` | Settings → Safety limits | View/set maxPerTx, maxDailySend |
| `t2000_lock` | Settings → [🔴 Emergency Lock] | Freeze account, CLI-only unlock |

#### Prompts → Smart Cards + Chips + LLM

All 20 MCP prompts mapped. The web app reuses the exact same prompt logic.

| MCP Prompt | Web App Surface | How |
|------------|----------------|-----|
| `morning-briefing` | **Smart cards** (always, not just mornings) | `t2000_overview` → render cards |
| `financial-report` | [More...] → [Report] chip | Instant account overview |
| `optimize-all` | **✨ Optimize smart card** — the magic button | Sweep + rebalance + claim in one tap |
| `optimize-yield` | **📈 Better rate smart card** [Switch] | Auto-surfaces when better rate exists |
| `sweep` | **💰 Idle funds smart card** [Move to savings] | Auto-surfaces when checking > $10 |
| `claim-rewards` | **🏆 Rewards smart card** [Claim] | Auto-surfaces when rewards > $0 |
| `savings-goal` | **🎯 Goal smart card** (if user set a goal) | Track progress toward target |
| `weekly-recap` | **📅 Weekly recap smart card** (Mondays) | Week-in-review summary |
| `risk-check` | **⚠ Risk smart card** (auto-alert) | Surfaces when health/exposure is risky |
| `send-money` | [Send] chip → guided flow | Recipient chips → amount chips |
| `quick-exchange` | [More...] → [Swap] chip | Token chips → amount chips |
| `investment-strategy` | [More...] → [Invest] → [Strategies] | Portfolio strategies |
| `dca-advisor` | [More...] → [Invest] → [Auto] | DCA setup recommendations |
| `savings-strategy` | LLM Tier 3 | "What should I do with $500?" |
| `budget-check` | LLM Tier 3 | "Can I afford a $25 gift card?" |
| `what-if` | LLM Tier 3 | "What if I save $500?" → before/after preview |
| `sentinel-hunt` | [Services] → [Sentinels] | Browse + attack sentinels |
| `onboarding` | Dashboard empty state | Funding guidance + feature tour |
| `safeguards` | Settings → Safety | View/configure limits |
| `emergency` | Settings → [🔴 Emergency Lock] | Freeze account immediately |

**Key insight:** 10 of 20 prompts map directly to **smart cards** or **chips** — the user never types anything. The remaining 10 are either LLM-powered (what-if, budget-check, savings-strategy) or Settings-based (safeguards, emergency).

The text input adds value for freeform queries like "what if I save $500?" or "can I afford to send $200?" — things that are too contextual for a pre-built chip.

### Services — The Killer Feature (in the feed)

MPP is the most unique thing about t2000. 41 services, 90 endpoints — no API keys, no subscriptions, pay-per-use from your balance. The web app must make this feel like magic: "I said what I wanted, it happened, and I didn't sign up for anything."

**The magic moment:** The user doesn't know what Reloadly is. They don't know what an API is. They just said "buy a $25 Uber Eats gift card for sarah@gmail.com" and it happened. The payment was invisible. That's the product.

#### Design Principle: Chips First, Browse Second, Type Last

Every service is reachable by tapping. Typing is only needed for freeform creative input:

| Service type | Entry point | UX |
|-------------|-------------|-----|
| Gift cards, postcards, top-ups | **Chip → Brand grid → Amount chips** | Zero typing. Tap brand, tap amount, enter email, confirm. |
| Image gen, AI chat | **Chip → Prompt field** | One text input (the creative prompt IS the product). |
| Web search, flights, jobs | **Chip → Search field** | One text input (the query IS the product). |
| URL shortener, QR, OCR | **Chip → Paste field** | One paste action. |
| Translation, TTS | **Chip → Text field** | One text input. |

All paths converge at a confirmation card with a single [✓ Confirm] tap.

#### Services Panel (Overlay)

The services panel slides up as a bottom sheet / overlay — it's not a separate page. Triggered by tapping the [Services] chip on the dashboard.

```
┌──────────────────────────────────────┐
│  ← Services                         │
│──────────────────────────────────────│
│                                      │
│  [🎁 Gift Card] [🖼 Image] [🤖 AI] │
│  [🔍 Search] [✈ Flights] [More...]  │
│                                      │
│  ─────────────────────────────────   │
│                                      │
│  Gift Cards                          │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌────┐│
│  │🍔    │ │      │ │🎬    │ │🎵  ││
│  │Uber  │ │Amazon│ │Netflix│ │Spot-││
│  │Eats  │ │      │ │      │ │ify  ││
│  └──────┘ └──────┘ └──────┘ └────┘│
│                                      │
│  AI & Creative                       │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌────┐│
│  │🤖    │ │🖼    │ │🔊    │ │📝  ││
│  │Ask AI│ │Image │ │Text   │ │Trans││
│  │      │ │Gen   │ │to     │ │late ││
│  │      │ │      │ │Speech │ │     ││
│  └──────┘ └──────┘ └──────┘ └────┘│
│                                      │
│  Search & Tools                      │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌────┐│
│  │🔍    │ │✈     │ │🔗    │ │📮  ││
│  │Web   │ │Flight│ │Short- │ │Post-││
│  │Search│ │Search│ │en URL │ │card ││
│  └──────┘ └──────┘ └──────┘ └────┘│
│                                      │
│  Just tap and use. No accounts,     │
│  no API keys, no sign-ups.          │
└──────────────────────────────────────┘
```

**Design notes:**
- **Bottom sheet overlay**, not a page. The ← back arrow returns to the feed.
- Category sub-chips at the top — tapping "🎁 Gift Card" scrolls to brands, tapping "🖼 Image" opens a prompt field.
- **No prices on browse cards.** Prices appear in the confirmation card after the user taps a service. Showing prices upfront creates hesitancy — the user hasn't even decided what they want yet.
- Consumer-facing labels: "Ask AI" not "OpenAI." "Image Gen" not "fal.ai." "Web Search" not "Brave Search API."
- Collapsed from 4 categories to 3 (merged Search & Tools). Less scrolling.
- Tapping any card → guided sub-chip flow → confirmation card (with price) → result in the feed.

#### The Two Paths (Gift Card Example)

**Path A — Browse (primary — zero typing)**

User taps [Services] → [🎁 Gift Card] → taps Uber Eats brand card:

```
│  🍔 Uber Eats Gift Card             │
│                                      │
│  Amount                              │
│  [$10] [$25] [$50] [$100]           │
│                                      │
│  → User taps [$25]                  │
│                                      │
│  Send to (email):                    │
│  ┌────────────────────────────────┐  │
│  │ sarah@gmail.com                 │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  Send $25 Gift Card — $25.50  │  │
│  └────────────────────────────────┘  │
│  Includes $0.50 service fee          │
```

**Three taps + one email.** Brand pre-selected. Amount chips — no typing needed. Only the email requires keyboard input (and post-MVP, a contacts chip could eliminate even that).

**Path B — Natural language (power-user shortcut)**

User types: "buy a $25 uber eats card for sarah@gmail.com" → instant confirmation card with all fields pre-filled. One input, one confirm tap.

#### Gift Card Brand Grid ("See all brands")

```
┌──────────────────────────────────────┐
│  ← Gift Cards                       │
│──────────────────────────────────────│
│                                      │
│  ┌────────────────────────────────┐  │
│  │ 🔍 Search brands...            │  │
│  └────────────────────────────────┘  │
│                                      │
│  Popular                             │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌────┐│
│  │🍔    │ │      │ │🎬    │ │🎵  ││
│  │Uber  │ │Amazon│ │Netflix│ │Spot-││
│  │Eats  │ │      │ │      │ │ify  ││
│  └──────┘ └──────┘ └──────┘ └────┘│
│                                      │
│  Food & Dining                       │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌────┐│
│  │🍔    │ │🍕    │ │☕    │ │🌮  ││
│  │Uber  │ │Door  │ │Star- │ │Grub-││
│  │Eats  │ │Dash  │ │bucks │ │hub  ││
│  └──────┘ └──────┘ └──────┘ └────┘│
│                                      │
│  Entertainment                       │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌────┐│
│  │🎬    │ │🎵    │ │🎮    │ │📺  ││
│  │Netflx│ │Spotfy│ │Xbox  │ │Hulu ││
│  └──────┘ └──────┘ └──────┘ └────┘│
│                                      │
│  Shopping                            │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌────┐│
│  │      │ │👟    │ │🛒    │ │🏠  ││
│  │Amazon│ │Nike  │ │Target│ │IKEA ││
│  └──────┘ └──────┘ └──────┘ └────┘│
│                                      │
└──────────────────────────────────────┘
```

This is the Uber Eats pattern: visual grid of recognizable brands, grouped by category. The user is shopping, not programming. Tapping any brand goes straight to the simple form (amount + email → confirm).

#### Response Display Patterns

All results render inline in the feed. Different service types get different renderers:

| Response Type | Services | How it displays in feed |
|--------------|----------|------------------------|
| **Text** | AI chat, translation, OCR | Formatted markdown card with Copy button |
| **Image** | fal.ai, DALL-E | Full-width preview with Save/Share/Redo |
| **Audio** | TTS, Whisper | Inline player card with Download |
| **Structured list** | Web search, flights, jobs, news | Card list with titles, snippets, links |
| **Receipt** | Gift cards, postcards, top-ups | Success card with code/confirmation |
| **Data** | Geocoding, weather, DNS | Clean key-value card, never raw JSON |

Every result ends with: "$X.XX from your balance" — the invisible payment moment.

#### Smart Forms Architecture

For the [Services] browsable panel, every MPP endpoint has a parameter schema. The system renders forms from schemas when users browse:

```
Service Config (exists)
    ├── name: "Uber Eats Gift Card"
    ├── endpoint: POST /reloadly/v1/gift-cards
    ├── fields: [
    │     { param: "brand_id",  ui: "brand-grid",  label: "Brand" }
    │     { param: "amount",    ui: "amount-pills", options: [10,25,50,100] }
    │     { param: "email",     ui: "email",        label: "Recipient Email" }
    │   ]
    ├── cost: "face value + $0.50"
    └── result: "receipt"
```

When a user types a natural language request instead, the intent router extracts the same parameters from the text and produces a pre-filled confirmation card — skipping the form entirely.

**Three tiers of service UX:**

| Tier | What | Coverage |
|------|------|----------|
| **Featured** | Custom result display + rich confirmation cards | Top 8-10: Gift cards, Image Gen, Ask AI, Web Search, TTS, Translation, Flights |
| **Standard** | Auto-generated form + typed result renderer | Most remaining services |
| **Developer** | Copy URL + curl example (link from any service) | All services (power-user fallback) |

---

## Phase 1: zkLogin Integration

**Goal:** Add "Sign in with Google" as an auth method. Users get a Sui wallet without managing keys.

**Effort:** ~2 weeks (SDK changes) + parallel with web app

### How zkLogin Works (Sui-native)

```
1. User clicks "Sign in with Google"
2. App generates ephemeral keypair (eph_sk, eph_pk)
3. Nonce = hash(eph_pk, max_epoch, randomness) → embedded in OAuth request
4. Google returns JWT with nonce in payload
5. JWT + salt → ZK proving service → ZK proof
6. Address = Blake2b(zk_flag, iss, addr_seed)
   where addr_seed = Poseidon(sub, aud, salt)
7. Transactions signed with eph_sk + ZK proof attached
8. Sui validators verify proof against on-chain JWKs
```

**Key property:** Same Google account + same salt = same Sui address, every time. No key file.

### Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Key claim** | `sub` | Immutable per OpenID spec. Never changes. |
| **Providers (launch)** | Google | Largest reach. Apple added in Phase 3 (iOS). |
| **Salt service** | Self-hosted (`api.t2000.ai/api/zklogin/salt`) | Critical security component — must control. |
| **Salt strategy** | `HMAC-SHA256(master_seed, iss \|\| sub)` | Deterministic, no DB needed, recoverable from master seed. |
| **ZK proving** | Mysten's service initially | Free, maintained. Self-host later if latency matters. |
| **Session duration** | ~7 days (`max_epoch` = current + ~7d worth) | Balance between UX (fewer re-auths) and security. |
| **Ephemeral key storage** | `localStorage` (web), `chrome.storage` (ext) | Session-scoped, lost on clear = just re-auth. |
| **Existing keypair wallets** | Keep forever | CLI/automation/MCP stays on keypair. Both auth methods coexist. |

### Salt Service Design

The salt is the critical secret that links a Google identity to a Sui address. If the salt is exposed, an attacker can link your Google `sub` to your on-chain address (privacy leak). If the salt is lost, the address is lost.

```
POST /api/zklogin/salt
Headers: Authorization: Bearer <JWT>
Body: { jwt: "<id_token>" }
Response: { salt: "<user_salt>" }
```

**Implementation:**

```typescript
// Salt derivation — deterministic, no DB
const MASTER_SEED = process.env.ZKLOGIN_MASTER_SEED; // 256-bit secret

function deriveSalt(iss: string, sub: string): string {
  return HMAC_SHA256(MASTER_SEED, `${iss}|${sub}`).toString('hex');
}
```

**Security:**
- JWT is validated before returning salt (verify signature against Google's JWKs)
- Rate-limited per IP
- Master seed stored in AWS Secrets Manager (same pattern as `DATABASE_URL`)
- Salt is stateless — no DB, no user table, fully recoverable from master seed

### SDK Changes

The SDK needs a new `Signer` abstraction that supports both keypair and zkLogin:

```typescript
// Current: single signing method
const agent = await T2000.create({ pin: 'my-pin' });

// v3: multiple signing methods
const agent = await T2000.create({ pin: 'my-pin' });                    // keypair (unchanged)
const agent = await T2000.fromZkLogin({ jwt, salt, ephemeralKey, proof }); // zkLogin
```

**Internal abstraction:**

```typescript
interface TransactionSigner {
  address: string;
  signTransaction(tx: Transaction): Promise<SignedTransaction>;
}

class KeypairSigner implements TransactionSigner { /* existing logic */ }
class ZkLoginSigner implements TransactionSigner { /* new */ }
```

The rest of the SDK (`save()`, `borrow()`, `send()`, etc.) calls `this.signer.signTransaction()` — completely agnostic to auth method.

### Gas Sponsorship Compatibility

zkLogin transactions work identically with sponsored transactions. The gas station doesn't care how the sender authenticated — it only needs:
1. The serialized transaction
2. The sender address

No changes to the gas station server.

### Migration Path

- zkLogin addresses are different from keypair addresses (different derivation)
- No automatic migration — users would need to transfer funds from keypair wallet to zkLogin wallet
- Both auth methods coexist indefinitely
- CLI always uses keypair; web app defaults to zkLogin

---

## Phase 2: Web App (`app.t2000.ai`)

**Goal:** A banking interface accessible from any browser. No install required. Mobile-first.

**Effort:** ~3-4 weeks (parallel with zkLogin SDK work)

### MVP Routes (Launch)

Only 2 routes. Everything happens in the conversational dashboard.

| Route | Purpose |
|-------|---------|
| **`/`** | Landing page + "Sign in with Google". SSR for SEO. |
| **`/dashboard`** | The entire app: balance, AI feed, input + chips. Settings as slide-over panel. |

No `/send`, `/invest`, `/services`, `/history` pages. Everything happens in the feed via natural language, suggestion chips, and confirmation cards. This dramatically reduces the surface area to build and test.

### Interaction Model: Conversational Dashboard

The dashboard is the app. Chips are the primary path — the user never needs to type:

| Path | How | Cost | Latency | Coverage |
|------|-----|------|---------|----------|
| **Suggestion chips** (primary) | Tap [Save] → amount chips → confirm. 4 visible chips + [More...]. | Free | Instant | 100% of common actions |
| **Simple commands** (power-user shortcut) | Type "save $500" → client-side parse | Free | <100ms | ~80% of typed inputs |
| **Complex/freeform** (power-user) | Type "financial report" → LLM | ~$0.001-0.003 | 1-2s | Everything else |

**Why conversational wins for t2000:**
- t2000's differentiator is AI. The MCP/CLI experience is already conversational and proven.
- "Give me a financial report" is impossible with buttons. The AI synthesizes data and recommends actions.
- Morning briefings, proactive alerts, and recommendations require AI. Static dashboards can't do this.
- Services (MPP) become invisible — "buy a gift card" is easier than navigating a catalog.
- The web app reuses the same tools and prompts already built for the MCP server.

**Safety:**
- Every action shows a confirmation card. The AI never executes without the user tapping Confirm.
- If the AI misunderstands, the user just doesn't confirm. No risk.
- Confirmation cards always show: amount, fee, gas, and outcome. The user reviews before committing.

### Tech Stack

| Layer | Technology | Why |
|-------|------------|-----|
| Framework | Next.js 16 (App Router) | Already in monorepo, SSR for landing |
| Auth | `@mysten/zklogin` + Google OAuth | Native Sui zkLogin |
| State | TanStack Query | Already used in gateway |
| Wallet ops | `@t2000/sdk` (browser build) | All existing methods, new signer |
| UI | Tailwind + shadcn/ui | Already in monorepo |
| Deployment | Vercel | Same as other Next.js apps |

### SDK Browser Compatibility

The current `@t2000/sdk` uses Node.js APIs (filesystem for key storage, `Buffer`). The web app needs a browser-compatible entry point.

**Approach:** Conditional entry points, not a separate package.

```
@t2000/sdk
  ├── src/index.ts           ← full SDK (Node.js, existing)
  └── src/index.browser.ts   ← browser build (no fs, no Buffer)
```

The browser build:
- Excludes: `KeypairSigner` (uses filesystem), `keystore.ts`, `autoInvest.ts` (cron)
- Includes: `ZkLoginSigner`, all DeFi adapters, gas manager, safeguards
- Uses `package.json` `"browser"` or `"exports"` field to auto-resolve

**Bundle size concern:** The Cetus aggregator and Suilend SDK add weight. Use dynamic imports for DeFi adapters — only load when the user initiates a save/invest action.

### Session Management

| Concern | Approach |
|---------|----------|
| **Ephemeral key** | Stored in `localStorage`. The key expires in ~7 days (tied to `max_epoch`), limiting exposure window. |
| **ZK proof** | Cached in `localStorage` alongside ephemeral key, valid for ~7 days |
| **Session expiry** | Banner warning 24h before `max_epoch`. Full Google re-auth required. |
| **Multiple devices** | Same Google account = same Sui address. Independent sessions per device. |
| **Logout** | Clear `localStorage`. Ephemeral key is gone. |
| **Lost session** | Sign in with Google again — same address, new ephemeral key, new proof. |
| **Browser clear** | Same as logout. Just sign in again. |

### Security Model

| Threat | Mitigation |
|--------|------------|
| **XSS stealing ephemeral key** | Strict CSP (script-src, no inline). Subresource integrity for CDN assets. Ephemeral key expires in ~7 days, limiting blast radius. |
| **Phishing (fake sign-in page)** | OAuth redirect URI pinned to `app.t2000.ai`. Google enforces this. |
| **Session hijacking** | Ephemeral keys are per-device. No shared sessions. |
| **Salt service abuse** | Rate-limited per IP. JWT signature verified against Google JWKs before returning salt. |
| **Large transaction risk** | Confirmation modal with dry-run simulation for EVERY transaction. Shows exact amounts, fees, gas. |
| **Stale UI state** | TanStack Query polling (30s for balance, 60s for positions). Always fetch fresh data before confirming. |

> **Note on localStorage encryption:** An earlier draft encrypted `localStorage` with a `sessionStorage` key (cleared on tab close). This was dropped: if an attacker has XSS on your domain, they can read both storage types in the same page context — the encryption doesn't help. Security budget is better spent on CSP and preventing XSS in the first place. The 7-day key expiry limits the damage window naturally.

### Mobile UX

The web app is mobile-first responsive. Not an afterthought.

| Concern | Approach |
|---------|----------|
| **Navigation** | Single-screen conversational dashboard. No tab bar needed — chips + input at bottom replace navigation. Settings via [⚙] slide-over. |
| **Touch targets** | 44px minimum height for all interactive elements. |
| **Google OAuth** | Uses redirect flow on mobile (not popup — popups blocked on mobile). |
| **ZK proof latency** | Full-screen loading with progress steps. Proof cached for ~7 days. |
| **Modals/sheets** | Bottom sheets on mobile (swipe to dismiss). Centered modals on desktop. |
| **Charts/data** | Simplified on mobile — large numbers, no tiny charts. Full charts on desktop. |

---

## Phase 2b: LLM Integration (Core — Not Post-MVP)

**Goal:** The AI that makes the conversational dashboard intelligent. This ships WITH the dashboard, not after.

**Effort:** ~1 week (integrated into dashboard work in weeks 3-4)

### How It Works

The LLM is the Tier 3 fallback for the input field. Most interactions are handled by suggestion chips (free, instant) or client-side parsing (free, instant). The LLM only activates for complex/freeform queries.

```
User types: "Move my idle funds to the highest yield"
→ LLM calls t2000_overview + t2000_all_rates
→ Determines: $105 idle, best rate is 6.8% on Suilend
→ Shows confirmation card in the feed
→ User taps Confirm
→ Calls t2000_save with dry-run, then executes
```

**Critical rule:** The LLM NEVER executes a transaction directly. It always shows a confirmation card. The user always taps Confirm. If the AI misunderstands, the user just doesn't confirm.

### What the AI Excels At

| Intent | Why AI wins |
|--------|------------|
| **Smart cards** | `t2000_overview` → AI analyzes account and surfaces what matters. This runs on every load. |
| **[Optimize all]** | Composes `sweep` + `rebalance` + `claim_rewards` into one action |
| "What if I save $500?" | Dry-runs the action, shows before/after comparison |
| "Can I afford a $25 gift card?" | Checks balance, safeguards, pending txs |
| "Give me a financial report" | Synthesizes data from multiple sources into a coherent narrative |
| "What should I do with $500?" | Compares rates, calculates optimal allocation, recommends action |
| "Buy a $25 Uber Eats gift card for sarah@gmail.com" | Parses complex intent, identifies service, extracts parameters |

### What the AI Defers To Chips/Parse

| Intent | Why chips are better |
|--------|---------------------|
| "Save $500" | Client-side parse — instant, free. No LLM needed. |
| "Send $50 to alice" | Client-side parse — instant, free. |
| "My address" / "receive" | Client-side keyword match — instant. |
| Browse gift card brands | [Services] chip → visual brand grid. Browsing beats text. |

### Cost Model

| Tier | Cost | Who pays |
|------|------|----------|
| Suggestion chips + simple commands | $0.00 | Nobody — client-side only |
| LLM queries (10/day) | ~$0.001-0.003 each | t2000 (subsidized) |
| Over 10 LLM queries/day | $0.01/message | Deducted from checking balance |

LLM calls go through the MPP gateway (dogfooding). Uses GPT-4o-mini or Claude Haiku for cost efficiency. The vast majority of interactions never hit the LLM.

---

## Phase 3: Chrome Extension

**Goal:** Bring t2000 + MPP into every website. Auto-detect 402 responses.

**Effort:** ~2-3 weeks (after web app, shares auth layer)

### Core Features

| Feature | Description |
|---------|-------------|
| **402 Auto-detection** | Intercept `402 Payment Required` responses, offer to pay with t2000 |
| **Popup wallet** | Quick-access balance, send, recent transactions |
| **MPP injection** | "Pay with t2000" button on API documentation pages |
| **Shared session** | Uses same zkLogin auth as `app.t2000.ai` |
| **Quick pay** | One-click API calls from the extension popup |

### 402 Auto-Detection Flow

```
1. User visits any website, makes a request (or site makes fetch)
2. Extension's service worker intercepts 402 response
3. Checks response headers for MPP payment info (X-Payment-*)
4. Shows notification: "This API costs $0.003. Pay with t2000?"
5. User confirms → extension pays via SDK → retries request
6. Original page receives the API response seamlessly
```

This is the "Stripe for AI APIs" moment — payment becomes invisible.

### Architecture

```
┌──────────────────────────────────────────────┐
│                Chrome Extension               │
│                                                │
│  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   Popup UI  │  │   Service Worker         │ │
│  │  (React)    │  │  - 402 interception      │ │
│  │  - Balance  │  │  - Background payments   │ │
│  │  - Send     │  │  - Session management    │ │
│  │  - History  │  │  - SDK instance          │ │
│  └─────────────┘  └─────────────────────────┘ │
│         │                    │                  │
│         └────────┬───────────┘                  │
│                  │                               │
│         ┌────────▼──────────┐                   │
│         │  @t2000/sdk       │                   │
│         │  (ZkLoginSigner)  │                   │
│         └───────────────────┘                   │
└──────────────────────────────────────────────────┘
```

### Content Script Injection (Optional)

For known MPP gateway pages, inject a "Try with t2000" button:

```javascript
// Detect MPP-protected API docs
if (document.querySelector('[data-mpp-endpoint]')) {
  injectPayButton(endpoint, price);
}
```

### Technical Limitations (Manifest V3)

| Limitation | Impact | Workaround |
|-----------|--------|------------|
| Service worker can't intercept page `fetch()` calls | 402 detection only works for top-level navigations and extension-initiated requests | Content script can monkey-patch `fetch` on opted-in pages, or detect 402 via response status in page context and message the extension |
| Service worker has limited lifecycle | Can't keep SDK instance alive permanently | Re-initialize on wake. Cache session in `chrome.storage`. |
| No `localStorage` in service worker | Can't share web app session directly | Use `chrome.storage.local` (encrypted). Import session from web app via a one-time sync page. |
| CORS restrictions | Extension can't make cross-origin requests from content scripts | Use service worker for all API calls (exempt from CORS). |

### Distribution

- Chrome Web Store (primary)
- Firefox Add-ons (later)
- Safari Extensions (with iOS app in Phase 4)

---

## Phase 4: iOS App (Future)

**Goal:** Mobile-native experience for the growing mobile-only user base.

**Effort:** ~6-8 weeks. Only after web app proves product-market fit.

### Key Features

| Feature | Notes |
|---------|-------|
| **Sign in with Apple** | Add Apple as zkLogin provider (native iOS feel) |
| **Face ID / Touch ID** | Biometric confirmation for transactions |
| **Push notifications** | Yield updates, incoming payments, price alerts |
| **QR scanner** | Scan to send, scan to pay |
| **Widgets** | Home screen balance widget |

### Tech Options

| Option | Pros | Cons |
|--------|------|------|
| **React Native** | Share code with web app, single team | Performance ceiling |
| **Swift (native)** | Best performance, Apple-native feel | Separate codebase |
| **PWA** | Zero install, web app already exists | Limited iOS support, no push (yet) |

**Recommendation:** Start with PWA (free from web app work), build native Swift if engagement justifies it.

### App Store Considerations

- Apple's crypto wallet policies require clear disclosures
- In-app purchase rules don't apply (t2000 is a wallet, not selling digital content)
- Need privacy policy, terms of service
- Review process typically 1-2 weeks for financial apps

---

## What Doesn't Change

The following systems are unaffected by v3:

| System | Why Unchanged |
|--------|--------------|
| **Gas station** | Doesn't care about auth method — just needs tx bytes + sender |
| **MPP Gateway** | Payment protocol is auth-agnostic |
| **DeFi adapters** | NAVI, Suilend, Cetus — SDK calls same methods |
| **Indexer** | Indexes by address, not by auth method |
| **Move contracts** | On-chain logic is address-based |
| **CLI + MCP** | Stay on keypair auth, unmodified |
| **Safeguards** | Per-address enforcement, works with any signer |

---

## Cross-Platform Change Management

**Problem:** When we update the SDK (e.g., new parameter on `save()`, new adapter), how do those changes flow to web app, extension, and iOS without things falling out of sync?

**Answer:** The SDK is the single source of truth. All platforms consume it.

```
@t2000/sdk (one package, two builds)
    ├── CLI            → Node.js build (existing)
    ├── Web App        → browser build (new)
    ├── Chrome Ext     → browser build (same)
    └── iOS (future)   → API layer via t2000-server, or React Native bridge
```

**How it works in practice:**

| Concern | Solution |
|---------|----------|
| **SDK method changes** | All platforms import the same `@t2000/sdk`. Update once, all platforms get the new types and methods. |
| **Shared types** | Web app and extension import SDK types directly (`TransactionSigner`, `SaveResult`, etc.). Never redefine types in UI code. |
| **Monorepo builds** | `pnpm build` builds SDK first, then all consuming apps. Type errors surface immediately at build time. |
| **Releases** | Bump SDK version → all apps in the monorepo see it instantly (workspace dependency). External consumers get it via npm. |
| **iOS (React Native)** | Same SDK, same types. If native Swift, use the HTTP API from `t2000-server` instead. |
| **iOS (PWA)** | Same web app codebase — no separate sync needed. This is why PWA-first is the right move. |

**Key principle:** Don't build a native iOS app until the web app proves product-market fit. PWA gives you iOS presence with zero additional code.

---

## New Infrastructure Required

### Salt Service (Phase 1)

| Component | Details |
|-----------|---------|
| **Endpoint** | `POST /api/zklogin/salt` on `api.t2000.ai` |
| **Auth** | Valid Google JWT required |
| **Storage** | Stateless — HMAC derivation from master seed |
| **Secret** | `ZKLOGIN_MASTER_SEED` in AWS Secrets Manager |
| **Deployment** | Same ECS server or separate Lambda |

### Google OAuth Client (Phase 1)

| Component | Details |
|-----------|---------|
| **Provider** | Google Cloud Console |
| **Client type** | Web application |
| **Redirect URIs** | `app.t2000.ai/auth/callback`, `chrome-extension://<id>` |
| **Scopes** | `openid` only (we just need `sub`) |

### ZK Proving Service (Phase 1)

| Component | Details |
|-----------|---------|
| **Initial** | Mysten Labs hosted service (free) |
| **Future** | Self-hosted if latency or availability matters |
| **Caching** | Proof cached client-side until `max_epoch` expires |

### Web App Deployment (Phase 2)

| Component | Details |
|-----------|---------|
| **App** | `apps/web-app/` in monorepo (new Next.js app) |
| **Domain** | `app.t2000.ai` |
| **Hosting** | Vercel (same as other Next.js apps) |
| **Database** | None initially (stateless, all data on-chain) |

---

## Environment Variables (New)

| Variable | Service | Description |
|----------|---------|-------------|
| `ZKLOGIN_MASTER_SEED` | Server | 256-bit hex seed for salt derivation |
| `GOOGLE_CLIENT_ID` | Web App + Extension | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Server | Google OAuth client secret (for token exchange) |
| `ZK_PROVER_URL` | SDK/Web App | ZK proving service endpoint |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Web App | Public client ID for frontend OAuth |

---

## Risks & Mitigations

### Critical Risks

| Risk | Impact | Severity | Mitigation |
|------|--------|----------|------------|
| **Master seed compromise** | All zkLogin users' on-chain identities exposed (salt derivable → address linkable to Google `sub`) | **Catastrophic** | AWS KMS with hardware-backed keys (not just Secrets Manager). Access logging. Separate IAM role with MFA. Offline backup of seed in safety deposit box. |
| **Master seed loss** | All zkLogin users permanently lose wallet access | **Catastrophic** | Encrypted backup in separate AWS region. Offline cold backup. Document recovery procedure. |
| **Google Client ID change** | ALL users get new addresses (funds stuck in old addresses) | **Catastrophic** | Treat Client ID as permanent infrastructure. Never delete/recreate. Document in runbook as critical. |
| **Google Client ID revocation** | All users locked out | **Critical** | Follow Google's ToS strictly. Appeal process documented. Multi-provider support as long-term hedge. |

**Note:** There is NO master seed rotation plan. Rotating the seed means all users get new salts → new addresses → funds stranded. The seed is permanent. This is a fundamental property of zkLogin.

### Operational Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Google OAuth downtime** | New users can't onboard. Existing sessions still work. | Generous session duration (7 days). Clear error: "Google is temporarily unavailable." |
| **ZK proving service downtime** | New sessions can't be created | Mysten's service has been stable. Self-host as fallback. Proof valid for days, so outages <24h are invisible. |
| **Ephemeral key theft (XSS)** | Attacker can sign txs until session expires | Strict CSP (script-src, no inline). Subresource integrity on all scripts. 7-day key expiry limits blast radius. |
| **Browser extension store rejection** | Can't distribute extension | PWA fallback. Extension is Phase 3, not MVP. |
| **User confusion (two address types)** | Users have keypair (CLI) and zkLogin (web) wallets | Web app never mentions keypair. CLI never mentions zkLogin. Separate products for separate audiences. |
| **Google public `sub` privacy** | If salt leaks, anyone can compute user's address from their Google ID | Salt service rate-limited and JWT-gated. Google `sub` is an opaque number (not email), limiting practical impact. |

---

## Success Metrics

| Metric | v2 Baseline | v3 Target |
|--------|-------------|-----------|
| **Onboarding time** | ~5 min (npm + init + PIN) | <10 seconds (Google sign-in) |
| **Onboarding drop-off** | High (terminal required) | <20% (just OAuth consent) |
| **Mobile users** | 0% | >30% of new users |
| **Monthly active users** | CLI-only | 10x (web + extension) |
| **Update friction** | Manual `npm update` | Zero (auto-deployed) |
| **Platforms supported** | 1 (terminal) | 4 (web, extension, CLI, MCP) |

---

## Implementation Sequence

### MVP (Weeks 1-5)

```
Week 1:    Google OAuth Client ID setup. Salt service endpoint.
           SDK ZkLoginSigner + browser build entry point.
           User preferences endpoint (contacts, goal sync).

Week 2:    Web app scaffold (apps/web-app). Landing page. Google sign-in flow.
           ZK proof generation + caching. Loading screen → dashboard.

Week 3:    Conversational dashboard: balance header, smart cards, input + chips.
           Smart cards engine: t2000_overview polling, skeleton loading states.
           Core chip flows: Save, Send, Withdraw, Borrow (all with dry-run).
           Confirmation card pattern (dry-run → real numbers → confirm).
           Settings slide-over (account, contacts, safety, goal, emergency lock).

Week 4:    Smart cards: rewards + claim, idle funds + sweep, better rate + rebalance.
           Client-side intent parser (regex + fuzzy for typed commands).
           LLM integration (tool-calling, same 35 tools as MCP server).
           Response renderers (text, image, list, receipt).

Week 5:    Services panel (brand grid, category chips, smart forms).
           Remaining chip flows: Invest, Swap, Report, History, Receive.
           Mobile responsive pass. Error states. LLM rate limit UX.
           Beta test with 5-10 users.
```

### Post-MVP (Weeks 6-9)

```
Week 6-7:  [Optimize all] multi-step execution with progress card.
           Savings goal tracking card + Settings entry. Weekly recap card.
           Featured service flows (image gen, Ask AI, web search, flights, TTS).
           Auto-generated forms for remaining services.
           Sentinels browsing + attack flow.

Week 8-9:  Chrome Extension — popup, smart cards, 402 auto-detection.
           PWA push notifications (rewards, received funds, rate changes).
           Email digest (opt-in weekly summary).
           Investment strategies + DCA advisor chip flows.
```

### Future

```
Phase 4:   iOS (PWA first, native if PMF proven)
           Moonpay on-ramp integration
           Apple as second zkLogin provider
```

---

## Appendix A: Sponsored Transactions Audit

### Current Implementation (Already Correct)

t2000's gas station implements Sui's native "User proposed transaction" sponsored transaction pattern:

```
SDK builds Transaction (gasless)
  → Serializes to JSON/BCS
  → POST /api/gas (gas station server)
  → Server: adds gas objects, dry-runs, signs as sponsor
  → Returns txBytes + sponsorSignature
  → SDK signs with user key (dual-signed)
  → Submits to Sui fullnode
```

This matches the Sui docs exactly. The gas chain (self-funded SUI → auto-topup → sponsored fallback) is more sophisticated than most implementations.

### Potential Optimization: Wildcard Gas Payment

The Sui docs describe a "wildcard" pattern where the sponsor pre-issues a `GasData` object, eliminating the server round-trip. However:

- **Pro:** Saves one network hop (~100ms)
- **Con:** Introduces equivocation risk (user could lock sponsor's gas coin)
- **Con:** Requires gas coin management per-user

**Decision:** Not worth the security trade-off. Current approach is correct.

### No Changes Needed

The gas station server, SDK gas manager, and sponsorship flow require no architectural changes for v3. They work identically with both keypair and zkLogin addresses.

---

## Appendix B: Competitive Landscape

| Product | Auth | Platforms | Payments | DeFi |
|---------|------|-----------|----------|------|
| **Slush (Sui)** | zkLogin | Extension, mobile | No | No |
| **Coinbase Agent Kit** | API key | SDK only | x402 | Limited |
| **MetaMask** | Seed phrase | Extension, mobile | No | Swaps |
| **Phantom** | Seed phrase | Extension, mobile | No | Swaps |
| **t2000 v2** | Keypair + PIN | CLI, MCP | MPP (41 services) | Full (save, borrow, invest) |
| **t2000 v3** | zkLogin + Keypair | Web, Extension, CLI, MCP | MPP (41+ services) | Full (save, borrow, invest) |

### t2000 v3 Differentiators

1. **Banking primitives** — No other wallet offers save/borrow/invest with auto-routing
2. **MPP payments** — 41 services payable with USDC, 402 auto-detection
3. **AI-native** — Embedded LLM chat, MCP server, agent skills
4. **Sponsored transactions** — Zero gas friction for new users
5. **Multi-platform** — Same account works across web, extension, CLI, and AI agents

---

## Appendix C: zkLogin Technical Reference

### Address Derivation

```
zk_login_flag = 0x05
addr_seed = Poseidon_BN254(
  hashBytesToField(kc_name),     // "sub"
  hashBytesToField(kc_value),    // Google's sub ID
  hashBytesToField(aud),         // Google client ID
  Poseidon_BN254(user_salt)
)
address = Blake2b_256(zk_login_flag, iss_length, iss, addr_seed)
```

### Nonce Construction

```
nonce = ToBase64URL(
  Poseidon_BN254([
    ext_eph_pk_bigint / 2^128,
    ext_eph_pk_bigint % 2^128,
    max_epoch,
    jwt_randomness
  ]).to_bytes()[len - 20..]
)
```

### Session Lifecycle

```
1. Generate ephemeral keypair
2. Compute nonce from (eph_pk, max_epoch, randomness)
3. Google OAuth with nonce → JWT
4. JWT + salt → ZK prover → proof
5. Sign transactions with eph_sk
6. Attach (eph_sig, proof, iss, aud, max_epoch, randomness) to each tx
7. When max_epoch reached → re-auth (back to step 1)
```

### Supported Providers (Sui Mainnet)

| Provider | `iss` | ID Type |
|----------|-------|---------|
| Google | `https://accounts.google.com` | Public (same `sub` across apps) |
| Facebook | `https://www.facebook.com` | Pairwise (unique per app) |
| Twitch | `https://id.twitch.tv/oauth2` | Public |
| Apple | `https://appleid.apple.com` | Pairwise |
| Slack | `https://slack.com` | Public |
| KaKao | `https://kauth.kakao.com` | Public |

**Launch provider:** Google (largest reach, public `sub`, most users already have accounts).

---

## Appendix C: CLI Portfolio Dual-Ledger — Known Tech Debt

### Context

The CLI tracks investment positions locally in `portfolio.json` with two parallel data structures:

```
positions:   { SUI: { totalAmount, avgPrice, costBasis } }     ← aggregate
strategies:  { "all-weather": { SUI: { totalAmount, ... } } }  ← per-strategy
```

Both are maintained independently — `recordBuy`/`recordSell` mutate `positions`, while strategy operations mutate `strategies`. A `deductFromStrategies()` method synchronizes strategy sub-ledgers when a direct `invest sell` overflows into strategy-held assets.

### Why It's Tech Debt

- Every new investment operation requires careful mutation ordering across both ledgers
- A timing bug was found and fixed (Feb 2026): `getDirectAmount()` was called after `recordSell()` already mutated the aggregate, producing incorrect overflow calculations for partial sells
- The trade `history` array already contains all information needed to derive both views — the two objects are effectively materialized caches that can desync

### Why We're Not Fixing It Now

- CLI uses `wallet.key` (keypair) → address `0xABC`. Web app uses zkLogin → address `0xDEF`. These are completely separate wallets and never share portfolio state.
- v3 web app builds server-side portfolio tracking from scratch (on-chain positions + server metadata). It never reads `portfolio.json`.
- CLI investment features are largely complete. Low risk of new sync bugs.
- Refactoring would delay v3 for no user-facing benefit.

### If We Revisit Later

The clean fix: derive `positions` and `strategies` from the `history` array on every access (with caching). Each history entry gets a `strategyId` field (null for direct trades). No dual-ledger sync logic needed — a sell is just a new history entry, and both views recompute automatically.
