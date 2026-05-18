# SPEC 11.5 — Onramp: Fiat → USDC on Sui (single chained flow via onramp.money + Cetus)

**Version:** 0.1 (draft — founder review pass before code)
**Date:** 2026-05-06
**Status:** Draft — ready for founder review. **Hard prerequisites: SPEC 10 v0.2.1 (closed S.82) ✅ + SPEC 7 v0.3.1 (Payment Stream) ✅ + S.91 reserved-list expansion ✅.** No engine version bump required.
**Author:** AI assistant (Stage 2 of the post-S.91 cleanup → onramp scoping plan, founder approved Path B 2026-05-06)
**Targets:** `@audric/web` next minor (no SDK / engine npm releases needed — all changes live in audric host)
**Engine baseline:** v1.22.1 (post-SPEC-17 ship 2026-05-07)
**SDK baseline:** v1.22.1 (post-SPEC-17 ship 2026-05-07)
**Audric baseline:** post-S.91 (`a536fcc` on main)

---

## Revision log

| Version | Date | Notes |
|---|---|---|
| **0.1** | **2026-05-06** | **Initial draft.** Founder approved Path B (Buy SUI native via onramp.money widget → auto-swap to USDC on Sui via Cetus, single chained flow) over Path A (wait for vendor to add USDC-on-Sui directly). Triggered by empirical probe of `api.onramp.money/v3/buy/public/coinDetails` 2026-05-06 finding USDC supported only on ETH/Polygon/BSC/Arbitrum/Base/zkSync Era/Linea, NOT Sui. Path B chosen as the strict superset — works regardless of vendor support, code is fully reusable as the swap leg if vendor enables USDC-on-Sui later. Founder note: "I trust your recommendation" (2026-05-06). |

---

## TL;DR (read this first)

> **The product bet.** New Audric users land with empty wallets. The single biggest activation drop today is "I need USDC on Sui to do anything, and I don't know how to get it." SPEC 11.5 collapses that problem into one tap: **"Add money" → enter fiat amount → tap → USDC arrives in your Audric wallet, ready to save / send / swap.**
>
> **What ships in v0.1 (single chained flow):**
> 1. User triggers from one of three surfaces — empty-wallet dashboard CTA, chat intent (`buy USDC`, `fund my wallet`, `add money`), or first-time signup chip.
> 2. Audric opens the onramp.money overlay widget pre-filled with `{ appId, walletAddress: user's Sui 0x, coinCode: 'sui', fiatAmount }`.
> 3. User completes KYC + payment in the widget (UPI / SEPA / card depending on country).
> 4. Onramp.money settles fiat, delivers SUI native to the user's Sui address (~30s–5min depending on payment rail).
> 5. Audric receives a webhook, polls Sui RPC to confirm SUI arrival, then auto-fires a Cetus swap SUI → USDC (sponsored gas, sub-threshold so no second tap).
> 6. User sees a unified receipt: `+$100 USDC ready to save · paid 100 INR · ~$0.30 in slippage absorbed by Audric.`
>
> **Why "Buy SUI → swap to USDC" (Path B) over "Buy USDC directly" (Path A):**
> - **Path B is a strict superset.** It works whether or not onramp.money supports USDC-on-Sui directly. If they enable it later, we add a second branch (1d) that skips the swap leg.
> - **Vendor-agnostic from day one.** All 5 known onramp vendors support SUI native. If onramp.money has an outage or pricing issue, swap vendors with a config change.
> - **Negligible UX cost.** ~0.1–0.5% slippage on a $100 fiat→SUI→USDC route via Cetus aggregator. Audric absorbs it in v0.1 (~$0.30/user/first-deposit) for a clean "what you paid is what you got" receipt.
>
> **What this collapses:**
> - **Empty-wallet awkwardness** → one tap, USDC appears.
> - **The "I have to sign up for an exchange first" friction** → KYC happens in-widget, never leaves Audric.
> - **The "buy SUI then swap to USDC manually" learning curve** → engine handles it silently inside one bundle.
>
> **What this does NOT do (v0.1 boundaries):**
> - **No offramp.** SPEC 11.6 covers cash-out separately, gated on 30d of v0.1 conversion data.
> - **No multi-vendor.** v0.1 ships onramp.money only. Multi-vendor (Mercuryo / Moonpay / Transak fallback) is a SPEC 11.5 v0.2 add if onramp.money's coverage / availability is insufficient.
> - **No alternate destinations.** USDC always lands in the user's own Audric wallet. "Buy USDC + send to friend" is a future chained flow.
> - **No bridging.** If Path B's swap leg fails (Cetus outage, extreme slippage), SUI sits in the user's wallet and Audric surfaces a "complete the conversion" CTA. We don't bridge to non-Sui chains.
>
> **The headline UX shift.** Combined with SPEC 7's Payment Stream (atomic multi-write) and SPEC 10's username identity, the new-user 60-second journey becomes: *Sign in with Google → claim alice.audric.sui → add $100 → save into NAVI at 4.99% APY*. All four steps. One tap each. Zero seed phrases, zero exchange accounts, zero wallet extensions.

**One-line product impact:** *Audric becomes self-contained — the user's first dollar can enter the system without ever leaving Audric chat.*

---

## Pre-SPEC findings — RESOLVED

| Finding | Resolution |
|---|---|
| Vendor doesn't support USDC-on-Sui (probe 2026-05-06) | ✅ **Path B chosen** (founder 2026-05-06): buy SUI native, auto-swap to USDC on Sui via Cetus inside the same chained flow. Path B is strict superset of Path A — code is reusable as the swap leg if vendor enables USDC-Sui later. |
| onramp.money KYB cleared, API keys in hand | ✅ **DONE 2026-05-05** (founder note in `audric-build-tracker.md` Forward backlog row 7). Vendor lead time = zero. |
| Audric web env contract | ✅ Existing `lib/env.ts` Zod schema pattern (S.25). New onramp env vars added per the v5 standard (no `process.env.X` reads outside the env module). |

---

## 6 founder decisions — D1–D6 (PROPOSED for v0.1, awaiting lock)

These are the choices that shape every downstream piece of work. Marked PROPOSED — founder reviews + locks in v0.2.

### D1 — Vendor: **onramp.money** (PROPOSED)

| Vendor | KYB status | USDC-on-Sui? | SUI native? | Effort to integrate |
|---|---|---|---|---|
| **onramp.money** (PROPOSED) | ✅ Cleared 2026-05-05 | ❌ Not yet (probe 2026-05-06) | ✅ Yes | ~3-5d (this SPEC) |
| Mercuryo | ❌ Deferred S.33 | Unknown | Likely yes | +1-6w KYB |
| Transak | ❌ Not started | Unknown (rep claims yes) | Yes | +1-6w KYB |
| Moonpay | ❌ Not started | Unknown | Yes | +1-6w KYB |
| Ramp | ❌ Not started | Unknown | Yes | +1-6w KYB |

**Why onramp.money for v0.1:** zero vendor lead time (KYB done), strong India coverage (UPI / IMPS — matches Audric's earliest user base concentration based on Vercel logs), supports SUI native delivery. Multi-vendor strategy promotes to SPEC 11.5 v0.2 if v0.1 telemetry shows availability gaps (specific country exclusions, persistent payment-rail outages).

**Open question for founder:** confirm onramp.money is the v0.1 vendor. If you want to add a second vendor (Transak as fallback) in v0.1, this becomes ~6-8d instead of 3-5d.

### D2 — Integration mode: **Overlay SDK** (PROPOSED)

| Mode | Pros | Cons |
|---|---|---|
| **Overlay SDK** (`@onramp.money/onramp-web-sdk`, PROPOSED) | Widget renders inside Audric's modal stack — user never leaves the dashboard; success/error events stream back via `WIDGET_EVENTS` + `TX_EVENTS` listeners; no popup blocker issues; matches `<UsernameClaimModal>` mental model | Adds 1 npm dependency (~30KB gzipped); needs CSP allowlist update for `onramp.money` iframe origin |
| Hosted-link redirect (`https://onramp.money/main/buy/?appId=...`) | Zero new dependencies; simpler integration | New tab leaves Audric (kills the in-product narrative); `redirectUrl` is the only way back; mobile UX is worse (some browsers strip `redirectUrl` query params on cold tab load) |

**Why overlay:** the in-Audric modal feels native, matches the SPEC 10 `<UsernameClaimModal>` UX, and the SDK's `WIDGET_EVENTS.PAYMENT_DONE` event lets us optimistically render "payment received, swap pending" before the webhook lands — better perceived latency.

**Open question for founder:** confirm overlay over hosted-link.

### D3 — Where the trigger lives (PROPOSED)

Three entry points in v0.1, all converging to the same `<OnrampWidget>` modal:

1. **Dashboard empty-wallet CTA** — when `walletValueUsd < 1`, the dashboard's primary CTA flips from the usual chip row to `[ Add money to get started → ]`. One-tap opens the widget.
2. **Chat intent** — engine adds `add_money` write tool. LLM dispatches when user says "buy USDC", "fund my wallet", "add money", "deposit", or "I want to start saving but I have no USDC". `<eval_summary>` lists `Wallet balance` + `Suggested fiat amount` + `Country / payment method available`.
3. **Settings → Add money** — a new row on `audric.ai/settings/payments` for the "I want to add more money proactively" path. Same modal.

**Surfaces NOT in v0.1 (deferred):**
- Send-flow inline ("you don't have enough USDC, want to add some?") — covered by guard system + chat intent escalation.
- Save-flow inline ("auto-fund into NAVI at the chosen APY") — chained save_deposit is achievable but adds 1d for the post-swap chip; defer to v0.2 if telemetry shows demand.
- Receive-page CTA ("send your friend to add money") — Audric Pay surface, not Audric Finance.

### D4 — Slippage absorption: **Audric absorbs in v0.1** (PROPOSED)

The Cetus swap leg costs ~0.1–0.5% on $100 fiat = ~$0.10–$0.50 per first deposit.

| Option | Per first-deposit cost (avg $100) | UX |
|---|---|---|
| **Audric absorbs (PROPOSED for v0.1)** | ~$0.30 | Clean: "+$100 USDC arrived" — what you paid IS what you got |
| Pass to user | $0 | "+$99.70 USDC arrived" with slippage line item — honest but introduces a "wait, where's my $0.30?" moment |
| Hybrid (cap at $0.50, pass overflow) | ~$0.30 typical, $0 worst-case | More complex code; founder probably doesn't care about edge case until volume warrants |

**Estimated cost at scale:** 1000 first-deposits × $0.30 = $300/mo at the volume that triggers SPEC 11.6 offramp work. Trivial.

**Open question for founder:** absorb in v0.1, switch to pass-to-user later if volume scales unexpectedly?

### D5 — Telemetry shape: **OnrampTelemetry rows + Discord weekly digest** (PROPOSED)

Mirrors the `IdentityCheckLog` pattern (S.90). Single-table + structured logs; ingest pipeline (Logflare / Axiom) deferred to SPEC 12 cross-cutting work.

```typescript
model OnrampTelemetry {
  id           String   @id @default(cuid())
  userId       String
  orderId      String   @unique           // links to OnrampOrder
  event        OnrampTelemetryEvent
  ts           DateTime @default(now())
  fiatAmount   Float?                     // present on initiated, payment_pending, payment_completed
  fiatCurrency String?                    // present on initiated, etc.
  suiAmount    Float?                     // present on delivered
  usdcAmount   Float?                     // present on swapped
  slippageBps  Int?                       // present on swapped
  errorReason  String?                    // present on failed_*
  durationMs   Int?                       // ts - previous event ts (for funnel timing)

  @@index([userId])
  @@index([event])
  @@index([ts])
}

enum OnrampTelemetryEvent {
  initiated        // user opened widget
  payment_pending  // user submitted payment, awaiting settlement
  payment_completed
  delivered        // SUI arrived at user's address (via RPC poll confirming balance delta)
  swap_initiated   // Cetus swap kicked off
  swapped          // USDC arrival (terminal success)
  failed_payment
  failed_delivery
  failed_swap      // CRITICAL: SUI in wallet, no USDC — manual review
  abandoned
}
```

**Discord weekly digest** (cron, Mondays 09:00 UTC): conversion funnel, drop-off rates per event, average time-to-USDC, slippage distribution, country/currency breakdown.

**Open question for founder:** confirm telemetry shape + cron timing.

### D6 — Failure handling: **stuck-SUI auto-recovery + manual escalation** (PROPOSED)

The new failure mode introduced by Path B: **SUI delivered, swap fails.** User has SUI in their Audric wallet but no USDC; their fiat went somewhere; they're confused.

**Auto-recovery (in-app, no human in the loop):**
1. Cetus swap leg fails → `OnrampTelemetry.event = 'failed_swap'`, `OnrampOrder.status = 'failed_swap'`.
2. Dashboard surfaces a sticky banner: `[ ⚠️  Your $100 deposit arrived as SUI — tap to convert to USDC (slippage covered) ]`.
3. Tap → re-fires the same Cetus swap (no fiat charge, just the same on-chain leg with fresh quote). Up to 3 auto-retries before surfacing the banner.
4. If the user dismisses or doesn't tap within 24h → email reminder ("Your USDC is one tap away").

**Manual escalation (ops-only):**
- New `audric.ai/settings/admin/onramp-orders` view (admin-only, gated on `User.role === 'admin'`).
- Lists orders in `failed_swap` state for >24h.
- One-button manual swap from Audric's ops wallet.
- Logged in `AdminAction` table for audit.

**Open question for founder:** confirm 3-retry + 24h-email + admin manual escalation. Alternative is "always require user tap, no auto-retries" (more conservative, more friction).

---

## Architecture overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                       SPEC 11.5 — Fiat → USDC on Sui                      │
│                                                                            │
│   ENTRY                                                                    │
│   ┌────────────────────────┬──────────────────────────┬─────────────────┐ │
│   │  Dashboard CTA         │  Chat: "buy USDC"        │  Settings page  │ │
│   │  (empty-wallet)        │  → engine add_money tool │  (proactive)    │ │
│   └────────────────────────┴──────────────────────────┴─────────────────┘ │
│                                       │                                    │
│                                       ▼                                    │
│   ┌────────────────────────────────────────────────────────────────────┐ │
│   │  <OnrampWidget> — modal wraps onramp.money overlay SDK             │ │
│   │  Pre-fill: appId · walletAddress · coinCode='sui' · fiatAmount     │ │
│   │  Listens: WIDGET_EVENTS (open/close) + TX_EVENTS (payment lifecycle│ │
│   └────────────────────────────────────────────────────────────────────┘ │
│                                       │                                    │
│                                       ▼ (user completes payment in widget)│
│   ┌────────────────────────────────────────────────────────────────────┐ │
│   │  POST /api/onramp/webhook (HMAC-SHA512 signature validated)         │ │
│   │  Body: { merchantRecognitionId, status, txHash, ... }               │ │
│   │  → upsert OnrampOrder, log OnrampWebhookEvent + OnrampTelemetry     │ │
│   └────────────────────────────────────────────────────────────────────┘ │
│                                       │                                    │
│                                       ▼ (status='delivered' confirmed)    │
│   ┌────────────────────────────────────────────────────────────────────┐ │
│   │  Audric server polls Sui RPC (3 retries, 5s backoff)                │ │
│   │  → confirms SUI balance delta == expected                           │ │
│   │  → fires sponsored Cetus swap SUI→USDC                              │ │
│   │  → records OnrampTelemetry.swapped + OnrampOrder.status='swapped'   │ │
│   └────────────────────────────────────────────────────────────────────┘ │
│                                       │                                    │
│                                       ▼                                    │
│   ┌────────────────────────────────────────────────────────────────────┐ │
│   │  User sees receipt card in dashboard:                               │ │
│   │    +$99.97 USDC arrived · paid ₹8350 · slippage ($0.03) covered    │ │
│   │  Engine fires post-add notification in chat:                        │ │
│   │    "Your $100 USDC just arrived. Want to save it at 4.99% APY?"    │ │
│   └────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

**Layer boundaries:**

| Layer | Responsibility | Files |
|---|---|---|
| **SDK** | (no changes — Cetus swap + USDC types already exist) | — |
| **Engine** | 1 new write tool (`add_money`); no system-prompt changes (intent classification handled by existing routing) | `packages/engine/src/tools/add-money.ts` (NEW) |
| **Audric (server)** | Webhook receiver, Sui RPC poller, Cetus swap orchestration, env wiring, Prisma schema | `apps/web/app/api/onramp/webhook/route.ts`, `apps/web/lib/onramp/poller.ts`, `apps/web/lib/onramp/swap-orchestrator.ts`, `apps/web/lib/env.ts`, `apps/web/prisma/schema.prisma` |
| **Audric (client)** | `<OnrampWidget>` modal, dashboard empty-wallet CTA, settings → payments row, sticky `failed_swap` recovery banner | `apps/web/components/onramp/OnrampWidget.tsx`, `apps/web/components/dashboard/AddMoneyCta.tsx`, `apps/web/app/settings/payments/page.tsx`, `apps/web/components/onramp/StuckSuiBanner.tsx` |

---

## Phased implementation

### Phase A — Vendor + env wiring (~0.75d)

**A.1 — Env schema additions** (`apps/web/lib/env.ts` per S.25 standard)

```typescript
// Server-only
ONRAMP_MONEY_APP_ID: requiredString,           // partner app id (small int as string)
ONRAMP_MONEY_API_KEY: requiredString,          // for authenticated endpoints (quote API, get-order)
ONRAMP_MONEY_API_SECRET: requiredString,       // HMAC-SHA512 signing key
ONRAMP_MONEY_WEBHOOK_SECRET: requiredString,   // separate secret for webhook signature validation (vendor-issued)

// Client-safe (Next.js public env)
NEXT_PUBLIC_ONRAMP_MONEY_APP_ID: requiredString,  // mirrored for the overlay SDK init
```

ESLint `no-restricted-syntax` rule already prevents `process.env.X` reads outside `lib/env.ts`. New keys added via `env.ONRAMP_MONEY_*` accessors.

**A.2 — CSP allowlist** (`next.config.ts`)

```typescript
// Add to existing Content-Security-Policy frame-src list
'frame-src': "'self' onramp.money *.onramp.money"
```

**A.3 — npm dependency**

```bash
cd apps/web && pnpm add @onramp.money/onramp-web-sdk
```

Verify package size + license + last-publish recency before adding (per coding-discipline rule on dependency hygiene).

**Verify gate (A):** typecheck + lint clean + dev server boots without env errors. Smoke-test importing the SDK in a scratch page (no widget render yet).

### Phase B — Prisma schema + migrations (~0.5d)

**B.1 — Models**

```prisma
model OnrampOrder {
  id                    String              @id @default(cuid())
  userId                String
  merchantRecognitionId String              @unique           // UUIDv4 we generate, sent to vendor + returned in webhook
  externalOrderId       String?             @unique           // their order id once received
  fiatAmount            Float
  fiatCurrency          String              // ISO code: 'INR', 'USD', 'EUR'
  paymentMethod         Int?                // vendor enum: 1=UPI, 2=bank, etc.
  coinCode              String              @default("sui")   // v0.1 always 'sui' (Path B)
  network               String              @default("sui")   // v0.1 always 'sui'
  destinationAddress    String              // user's Sui 0x
  status                OnrampOrderStatus
  initiatedAt           DateTime            @default(now())
  paymentCompletedAt    DateTime?
  deliveredAt           DateTime?
  deliveryTxDigest      String?             // sui tx digest of SUI arrival
  swapAttemptId         String?             // links to TurnMetrics if engine-driven
  swapTxDigest          String?             // sui tx digest of SUI→USDC swap
  finalUsdcAmount       Float?
  slippageBps           Int?                // realised slippage (bps)
  abandonedAt           DateTime?
  failureReason         String?             // text explanation when status starts with failed_

  user                  User                @relation(fields: [userId], references: [id])
  webhookEvents         OnrampWebhookEvent[]

  @@index([userId])
  @@index([status])
  @@index([initiatedAt])
}

enum OnrampOrderStatus {
  initiated
  payment_pending
  payment_completed
  delivered
  swap_initiated
  swapped
  failed_payment
  failed_delivery
  failed_swap        // CRITICAL: SUI in wallet, USDC not delivered — see D6 recovery
  abandoned
}

model OnrampWebhookEvent {
  id              String      @id @default(cuid())
  orderId         String
  receivedAt      DateTime    @default(now())
  rawPayload      Json
  signature       String
  signatureValid  Boolean
  vendorStatus    String      // their status string verbatim
  processed       Boolean     @default(false)
  processedError  String?

  order           OnrampOrder @relation(fields: [orderId], references: [id])

  @@index([orderId])
  @@index([receivedAt])
}

model OnrampTelemetry {
  // see D5 above
}
```

**B.2 — Migration**

```bash
pnpm --filter @audric/web prisma migrate dev --name spec_11_5_onramp_models
```

**Verify gate (B):** `prisma generate` clean + new types accessible via `prisma.onrampOrder.create(...)` in a scratch route.

### Phase C — Engine tool (~0.75d)

**C.1 — `add_money` write tool** (`packages/engine/src/tools/add-money.ts` NEW)

```typescript
buildTool({
  name: 'add_money',
  description: 'Open the onramp widget for the user to add fiat → USDC to their Audric wallet. Use when the user asks to buy USDC, fund their wallet, deposit money, or says they need money to start using Audric.',
  permissionLevel: 'confirm',          // always confirm — user must consent to leaving Audric for KYC
  isReadOnly: false,
  isConcurrencySafe: false,
  schema: z.object({
    fiatAmount: z.number().min(1).max(10000).optional(),  // optional — widget will ask if missing
    fiatCurrency: z.enum(['INR', 'USD', 'EUR']).optional(), // optional — widget defaults to user's locale
  }),
  preflight: (input) => {
    if (input.fiatAmount && input.fiatAmount < 5) {
      return { valid: false, error: 'fiat amount must be at least 5 (vendor minimum)' };
    }
    return { valid: true };
  },
  execute: async (input, ctx) => {
    // Generate merchantRecognitionId, persist OnrampOrder row in 'initiated' state,
    // return pending_action with widget config.
    const merchantRecognitionId = randomUUID();
    return {
      pendingAction: {
        type: 'open_onramp_widget',
        widgetConfig: {
          appId: ctx.onrampAppId,
          coinCode: 'sui',
          network: 'sui',
          fiatAmount: input.fiatAmount,
          fiatType: fiatCurrencyToVendorEnum(input.fiatCurrency),
          walletAddress: ctx.userWalletAddress,
          merchantRecognitionId,
          redirectUrl: `${ctx.audricBaseUrl}/?onramp=${merchantRecognitionId}`,
        },
        attemptId: randomUUID(),
        modifiableFields: [
          { name: 'fiatAmount', kind: 'amount', asset: 'fiat' },
        ],
      },
      displayText: input.fiatAmount
        ? `Opening onramp widget to buy ~${input.fiatAmount} ${input.fiatCurrency || 'USD'} of USDC. KYC happens in-widget; USDC will arrive in your Audric wallet shortly.`
        : `Opening onramp widget. Pick a fiat amount inside the widget — USDC will arrive in your Audric wallet.`,
    };
  },
  maxResultSizeChars: 1_000,
});
```

**C.2 — `ToolContext` additions**

```typescript
// packages/engine/src/types.ts
interface ToolContext {
  // ... existing fields
  onrampAppId?: string;          // mirrors NEXT_PUBLIC_ONRAMP_MONEY_APP_ID
  userWalletAddress?: string;
  audricBaseUrl?: string;
}
```

Audric's `/api/engine/chat` route populates these from the env proxy + session.

**C.3 — Engine system prompt** — minimal addition (~5 lines) under "Money operations" section:

```
- add_money: open the onramp widget for fiat → USDC. Use ONLY when the user explicitly asks
  to add money / buy USDC / fund the wallet. Do NOT proactively suggest it inside other
  flows (the dashboard CTA + chat intent classifier handle proactive surfacing).
```

**Verify gate (C):** `add_money` shows up in `/api/engine/tools` listing; calling it through the engine produces a `pending_action` event with the right widget config; preflight rejects `fiatAmount: 1`.

### Phase D — Audric server: webhook + RPC poller + swap orchestrator (~1.25d)

**D.1 — Webhook receiver** (`apps/web/app/api/onramp/webhook/route.ts` NEW)

```typescript
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('X-ONRAMP-SIGNATURE');

  // 1. Validate HMAC-SHA512 signature against ONRAMP_MONEY_WEBHOOK_SECRET
  const expected = hmacSha512(rawBody, env.ONRAMP_MONEY_WEBHOOK_SECRET);
  const valid = timingSafeEqual(signature, expected);
  if (!valid) {
    // Persist with signatureValid=false for audit; return 200 to avoid retries (per vendor docs)
    await persistWebhookEvent({ orderId: 'unknown', signatureValid: false, rawBody });
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // 2. Parse body, find OnrampOrder by merchantRecognitionId, persist event row
  const body = JSON.parse(rawBody);
  const order = await prisma.onrampOrder.findUnique({
    where: { merchantRecognitionId: body.merchantRecognitionId },
  });
  if (!order) {
    // Vendor sent an event for an order we don't recognise — log + ack
    await persistWebhookEvent({ orderId: 'unknown', signatureValid: true, rawBody });
    return NextResponse.json({ received: true });
  }

  await prisma.onrampWebhookEvent.create({
    data: { orderId: order.id, signature, signatureValid: true, rawPayload: body, vendorStatus: body.status },
  });

  // 3. Update OnrampOrder.status based on vendor status
  // 4. If status transitions to 'delivered', enqueue swap orchestration (D.3)
  // 5. Emit OnrampTelemetry row with timing delta
  await processWebhookEvent(order, body);

  return NextResponse.json({ received: true });
}
```

**D.2 — Sui RPC poller** (`apps/web/lib/onramp/poller.ts` NEW)

When the vendor reports `status='completed'` (their settlement-confirmed event), Audric polls Sui RPC to confirm SUI actually arrived:

```typescript
async function pollForSuiDelivery(order: OnrampOrder, expectedSuiAmount: bigint): Promise<{ delivered: boolean; balance: bigint; txDigest?: string }> {
  for (let attempt = 0; attempt < 6; attempt++) {  // 6 × 10s = 60s budget
    const balance = await suiClient.getBalance({ owner: order.destinationAddress, coinType: SUI_TYPE });
    if (BigInt(balance.totalBalance) >= expectedSuiAmount) {
      // Find the actual delivery tx via getTransactionBlocks for audit
      const txDigest = await findDeliveryTxDigest(order, balance);
      return { delivered: true, balance: BigInt(balance.totalBalance), txDigest };
    }
    await sleep(10_000);
  }
  return { delivered: false, balance: 0n };
}
```

If polling times out (60s budget), order moves to `failed_delivery` and admin escalation kicks in.

**D.3 — Swap orchestrator** (`apps/web/lib/onramp/swap-orchestrator.ts` NEW)

```typescript
async function orchestrateSwap(order: OnrampOrder): Promise<void> {
  // 1. Get fresh Cetus quote SUI → USDC for the delivered amount
  const quote = await cetusGetQuote({ from: 'SUI', to: 'USDC', amountSui: order.deliveredSuiAmount });

  // 2. Sanity-check slippage (reject if >2% — manual review)
  if (quote.slippageBps > 200) {
    await markOrderFailed(order, 'failed_swap', `slippage too high: ${quote.slippageBps}bps`);
    return;
  }

  // 3. Build sponsored swap tx (use existing prepare-bundle path with single swap_execute step)
  const txDigest = await executeSponsoredSwap({
    userId: order.userId,
    fromCoin: 'SUI',
    toCoin: 'USDC',
    amountIn: order.deliveredSuiAmount,
    minOut: quote.minOut,
    purpose: `onramp_swap:${order.id}`,
  });

  // 4. Verify USDC arrived, persist results
  await prisma.onrampOrder.update({
    where: { id: order.id },
    data: {
      status: 'swapped',
      swapTxDigest: txDigest,
      finalUsdcAmount: quote.expectedUsdc,
      slippageBps: quote.slippageBps,
    },
  });

  // 5. Emit telemetry + trigger post-swap notification (D.5)
}
```

**D.4 — Sticky banner recovery** (auto-retry path per D6)

Background cron (every 5 min) scans `OnrampOrder` rows in `failed_swap` state and re-fires the swap orchestrator up to 3 times with exponential backoff. After 3 failures or 24h, sends an email + leaves the sticky banner up.

**D.5 — Post-swap notification**

After successful swap, push a system message into the user's chat:

```
Your $100 USDC just arrived. Want to save it at 4.99% APY?
[ Save $100 ] [ Save half ] [ Maybe later ]
```

Implemented via existing `chip_row` engine surface — no new infrastructure.

**Verify gate (D):**
- (a) Hit webhook endpoint with hand-crafted HMAC-signed payload → row appears in `OnrampWebhookEvent`.
- (b) Hit webhook with bad signature → row appears with `signatureValid=false`, no order state change.
- (c) Manual test: insert `OnrampOrder` in `delivered` state with real test wallet that already has SUI → swap orchestrator fires, USDC arrives, status flips to `swapped`.
- (d) Sticky-banner cron picks up `failed_swap` orders correctly.

### Phase E — Audric client surfaces (~1d)

**E.1 — `<OnrampWidget>` modal** (`apps/web/components/onramp/OnrampWidget.tsx` NEW)

Wraps the onramp.money overlay SDK in an Audric modal. Listens for `WIDGET_EVENTS.PAYMENT_DONE` (optimistic "payment received, swap pending" UI), `WIDGET_EVENTS.WIDGET_CLOSE` (abandonment if no payment). Listens for `TX_EVENTS.ONRAMP_TX_COMPLETED` (final confirmation).

Pre-fill comes from the engine's `pending_action.widgetConfig`.

**E.2 — Dashboard empty-wallet CTA** (`apps/web/components/dashboard/AddMoneyCta.tsx` NEW)

When `walletValueUsd < 1` AND user has not initiated an onramp order in the last 24h AND user is not in the middle of a chat turn, render the prominent CTA card. Otherwise render the normal chip row.

**E.3 — Settings → Payments page** (`apps/web/app/settings/payments/page.tsx` NEW)

Lists past `OnrampOrder` rows (status, fiat amount, USDC arrived, date). Top of page has the "Add money" button → opens `<OnrampWidget>`.

**E.4 — Sticky `<StuckSuiBanner>`** (`apps/web/components/onramp/StuckSuiBanner.tsx` NEW)

Renders at the top of the dashboard whenever any `OnrampOrder` is in `failed_swap` state for the current user. One-tap re-fires the swap orchestrator via `/api/onramp/recover/[orderId]`.

**Verify gate (E):**
- (a) Empty-wallet flow: sign in → see "Add money" CTA → tap → widget opens → sandbox-mode payment → SUI arrives → swap fires → USDC arrives → CTA disappears, normal chip row returns.
- (b) Chat intent: type "buy 50 USDC" → engine fires `add_money` → widget opens with fiatAmount pre-filled.
- (c) Settings page lists the test order.
- (d) Manual SQL update on a test row to `failed_swap` → sticky banner appears → tap → swap completes → banner disappears.

---

## Acceptance gates (founder smoke-test before merge)

1. **Sandbox end-to-end** — onramp.money sandbox-mode payment completes; SUI arrives at test Sui address; auto-swap fires; USDC lands; receipt + chat notification render.
2. **Webhook security** — bad signature rejected; replay of valid signature is idempotent (no double-spend, no double-swap).
3. **PII redaction** — no payment-method details (card numbers, bank account, UPI ID) ever persist in Audric DB. Only `fiatAmount`, `fiatCurrency`, vendor status, vendor's hashed `merchantRecognitionId`. `OnrampWebhookEvent.rawPayload` MUST be redacted before storage if it contains PII (vendor docs to confirm what fields they send).
4. **Failure paths** — manual test of `failed_payment`, `failed_delivery`, `failed_swap` paths each surface the right UI.
5. **Stuck-SUI recovery** — kill the swap leg mid-flight (network error in dev) → sticky banner appears → tap → recovers.
6. **Slippage cap** — manually set Cetus to return >2% slippage quote → swap orchestrator marks `failed_swap` and surfaces banner instead of executing.
7. **Concurrent-order safety** — user opens 2 widget sessions in 2 tabs → only the first creates an `OnrampOrder`; the second is rejected (mutex on `userId + status='initiated'`).
8. **Country / currency coverage** — confirm INR (UPI) + USD (card) + EUR (SEPA) all complete sandbox payment. Per-country failures get logged to telemetry.

---

## Risks + open questions

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Vendor SUI delivery flakes (slow settlement, occasional drops) | Medium | High | 60s polling budget + admin escalation queue; weekly digest surfaces vendor reliability metrics |
| Cetus aggregator outage exactly when SUI arrives | Low | Medium | Auto-retry every 5min for 24h; sticky banner gives user manual recovery path |
| Slippage spikes on thin liquidity (e.g. SUI flash crash mid-swap) | Low | Low | 200bps cap → `failed_swap` → manual recovery; user sees "we held off swapping; tap to retry" |
| Vendor changes their webhook signature scheme | Low | High | Webhook secret is env var (rotatable in <5min); telemetry alerts on >5 invalid-signature events/hr |
| User signs in from a country onramp.money doesn't serve | Medium | Medium | Country detection at widget-open time (vendor's country API); fallback message: "onramp not available in your country yet — contact us" |
| Onramp.money compliance team flags Audric for high failure rates | Low | High | Bake-in 30d telemetry review with vendor before scaling beyond test users |

### Open questions for founder

1. **D1 — Vendor lock:** confirm onramp.money for v0.1, or layer in Transak/Mercuryo from day one?
2. **D2 — Mode lock:** confirm overlay SDK over hosted-link redirect?
3. **D3 — Trigger surfaces:** confirm 3 entry points (dashboard CTA / chat intent / settings page)?
4. **D4 — Slippage absorption:** confirm Audric absorbs in v0.1?
5. **D5 — Telemetry shape:** confirm `OnrampTelemetry` model + Discord weekly digest?
6. **D6 — Failure handling:** confirm 3-retry + 24h-email + admin manual escalation?
7. **Country scope:** v0.1 ships with vendor's full country list, or limit to specific countries (e.g. India + EU only) for the initial 30d telemetry baseline?
8. **Pricing display:** show fiat-equivalent USDC amount before user opens widget (requires pre-quote API call), or let widget own all pricing display?
9. **Engine intent:** should `add_money` be discoverable in the chat-input chip suggestions (next to "save", "send"), or chat-intent only (typed)?
10. **Phase 5 chained save:** v0.1 fires a chat notification ("save it at 4.99%?") — should we also auto-fire a chained `save_deposit` chip-row card in the dashboard, or leave it as chat-only for v0.1?

### Out-of-scope (deferred to future SPECs)

- **Offramp** — SPEC 11.6 (gated on 30d v0.1 telemetry).
- **Multi-vendor** — SPEC 11.5 v0.2 (gated on v0.1 vendor-availability findings).
- **Recurring deposits** — `add_money` schedule (SPEC TBD).
- **Buy-and-send** — `add_money` to a contact's wallet directly (chained Pay flow, future SPEC).
- **Buy non-USDC** — buy GOLD / NAVX / WAL via similar flow (no demand signal yet).
- **In-app KYC sharing** — vendor offers SDK-driven KYC re-use across onramp transactions; v0.1 lets the vendor handle KYC fully in-widget.

---

## Effort estimate (rolled up)

| Phase | Effort | Output |
|---|---|---|
| A — Vendor + env wiring | 0.75d | npm dep, env schema, CSP allowlist |
| B — Prisma schema + migrations | 0.5d | 3 new models, migration applied |
| C — Engine `add_money` tool | 0.75d | Tool + ToolContext + system-prompt teaching |
| D — Webhook + RPC poller + swap orchestrator | 1.25d | Webhook receiver, poller, orchestrator, sticky-banner cron, post-swap notification |
| E — Audric client surfaces | 1d | `<OnrampWidget>`, dashboard CTA, settings page, sticky banner |
| **Total** | **4.25d** | (estimate range: 3-5d depending on vendor sandbox quirks) |

**Verification budget:** 0.5d acceptance smoke-test (8 gates above) + 0.25d post-deploy production smoke. Total project: **~5d**.

---

## Cross-references

- **Backlog row 7** (`audric-build-tracker.md` Forward backlog table)
- **Pre-spec audit + path decision:** S.91 entry's predecessor S.90 found USDC-on-Sui not supported; this v0.1 doc's revision log captures Path B selection
- **Vendor docs:** `https://docs.onramp.money/onramp/onramp-widget-integration/quick-start`, `https://docs.onramp.money/onramp/rest-api-endpoints/quotes-api-onramp`
- **Existing patterns leveraged:**
  - SPEC 7 v0.3.1 Payment Stream (atomic multi-write) — chained tx pattern inspires the in-bundle swap leg
  - SPEC 10 v0.2.1 picker reusability (`<UsernameClaimModal>`) — same Audric modal mental model
  - S.25 env-validation gate — Zod schema + `instrumentation.ts` boot-time validation
  - S.51 USDsui as saveable — Path B's USDC delivery preserves the canonical USDC stable; USDsui buy is an explicit non-goal (no NAVI USDsui pool relevance to fiat-buyers in v0.1)
- **Cursor rules:**
  - `.cursor/rules/safeguards-defense-in-depth.mdc` — `add_money` is `confirm`-tier (always taps); slippage cap is a guard
  - `.cursor/rules/financial-amounts.mdc` — `Math.floor` on all USDC amounts before display
  - `.cursor/rules/single-source-of-truth.mdc` — wallet-balance reads go through `getCanonicalPortfolio`, not direct RPC
  - `.cursor/rules/env-validation-gate.mdc` — new env vars added through `lib/env.ts` Zod schema
