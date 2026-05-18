# SPEC 11 — Pre-Draft Review (PayButton + Audric-payer routing)

> **Status:** Pre-draft review. NOT the spec yet. Founder paused SPEC 16 development to ship SPEC 12 first; SPEC 11 drafts AFTER SPEC 12 closes per backlog ordering.
>
> **Purpose:** Capture everything I found during the end-to-end deep-dive of the existing pay flow + the placeholder backlog context, so when SPEC 11 actually drafts (after SPEC 12), the review is the starting point. Surfaces the architectural decisions that need locking BEFORE drafting.
>
> **Owner (review):** Audric Intelligence (Agent Harness team)
> **Trigger:** founder request 2026-05-07 — "review SPEC 11 for everything"
> **Cross-references:** SPEC 7 v0.4 Layer 0 (`composeTx` substrate, closed S.60 2026-05-04), `audric-canonical-write.mdc` (PayButton bypass rationale + ESLint rule), `audric-pay-flow.mdc` (existing Audric Pay surface), audric-build-tracker.md backlog row 6 + Master Priorities P2.9 + Pay family future-scope section (line 790–832).

---

## TL;DR

> **The placeholder is well-scoped already.** Founder kept SPEC 11 narrow at ~3.25d (PayButton routing only, onramp/offramp split into SPEC 11.5 / 11.6). The hard dependency (SPEC 7 v0.4 Layer 0 → `composeTx` primitive) shipped 2026-05-04, so SPEC 11 is unblocked.
>
> **What's not yet locked:** 5 architectural decisions that shape the implementation before any code goes in. Most important: the surface model (augment `/pay/[slug]` page in-place vs. redirect signed-in Audric users to chat with a pre-filled intent) — this single decision changes ~60% of the implementation surface.
>
> **What I found that wasn't in the placeholder:** 5 implementation gaps (open-amount payment links, edge-case state reuse, server-side session detection nuances, telemetry shape, handle-display from SPEC 10 integration) + 3 small additions worth folding in (mobile flow optimization, doc/tracker housekeeping, the partner-shareable explainer pattern).
>
> **The narrow scope holds.** Nothing I found suggests we should widen SPEC 11 beyond the ~3.25d budget. The 5 decisions are all locking choices, not scope-expanding ones. After locks, ship in 1 week.

---

## What exists today (the deep-dive findings)

### The 3 production payment surfaces (all dapp-kit-based)

| Surface | File | Signer | Verifier path |
|---|---|---|---|
| `/pay/[slug]` page (any-wallet payer) | `audric/apps/web/components/pay/PayClient.tsx` + `PayButton.tsx` | dapp-kit `useSignAndExecuteTransaction` (Slush, Phantom, Suiet) | `/api/payments/[slug]/verify` — registry-event mode (`PaymentReceipt` event match by nonce) OR digest-balanceChanges mode |
| `/pay/[slug]` manual digest paste | `PayClient.tsx` → `DigestForm` | (no signer — user already signed elsewhere, pastes the digest) | Same `/api/payments/[slug]/verify` route, digest mode |
| `/[username]` profile page send | `audric/apps/web/app/[username]/SendToHandleButton.tsx` | dapp-kit (mirrors PayButton pattern) | Direct USDC transfer + Suivision link, no Payment row, no nonce |

### The exact mechanics of the existing `/pay/[slug]` payment

**On the chain side:** `@mysten/payment-kit`'s `processRegistryPayment` Move call wraps the USDC transfer in a `PaymentReceipt` event with the `nonce` from the link. The on-chain footprint is:
1. `paymentKit.tx.processRegistryPayment({ nonce, coinType: USDC, amount, receiver, sender })` — single PTB
2. Emits `0xbc126f1535fba7d641cb9150ad9eae93b104972586ba20f3c60bfe0e53b69bc6::payment_kit::PaymentReceipt` event with `{ nonce, receiver, payment_amount }`
3. Server polls `suix_queryEvents` filtered to `MoveEventType: PaymentReceipt`, matches by nonce + receiver + amount

**On the verifier side:** `/api/payments/[slug]/verify` accepts:
- **No body** → registry-event mode → polls Sui RPC for `PaymentReceipt` events
- **`{ digest, paymentMethod, senderName }`** → digest mode → first checks events on the digest, then falls back to balanceChanges
- Both paths converge on `markPaid()` which writes `Payment.status='paid'` + creates `pay_received` AppEvent

### The Audric-payer gap (the actual SPEC 11 problem)

When an Audric user (signed in via NextAuth + zkLogin) visits another Audric user's `/pay/[slug]` page:
- The page renders `PayButton` which uses dapp-kit + `useSignAndExecuteTransaction`
- The Audric user's identity is the zkLogin EPHEMERAL key — NOT extension-importable
- Clicking "Connect Wallet to Pay" forces them to:
  - (a) connect a SEPARATE wallet (Slush, Phantom) with a different address — pays from the wrong account, Audric balance untouched
  - (b) abandon the link, copy the recipient address, paste it into the Audric chat agent — degraded UX, multi-step
- They have no Audric-native one-tap path through the canonical `composeTx` + Enoki sponsored route that every other Audric write uses

### What composeTx already gives us (the substrate that's ready)

SPEC 7 v0.4 Layer 0 (closed S.60, 2026-05-04) shipped `composeTx({ steps })` as the canonical entry-point for every Audric Enoki-sponsored write:
- `composeTx({ steps: [{ toolName: 'send_transfer', input: { to, amount, asset: 'USDC' } }] })` returns ready-to-sponsor `txKindBytes`
- `derivedAllowedAddresses` for Enoki (eliminates the PR-H1/PR-H4 bug class — hand-maintained allowlists are extinct)
- Single-step path uses the same code as N-step bundles
- `audric/apps/web/lib/sponsor.ts`'s `sponsorViaEnoki()` wraps the Enoki API call

The Audric-payer path is mechanically a one-line consumer:

```typescript
const composed = await composeTx({
  sender: audricUserAddress,
  steps: [{
    toolName: 'send_transfer',
    input: { to: payment.suiAddress, amount: payment.amount, asset: 'USDC' },
  }],
  sponsoredContext: true,
});
const sponsored = await sponsorViaEnoki({
  txKindBytes: composed.txKindBytes,
  sender: audricUserAddress,
  allowedAddresses: composed.derivedAllowedAddresses,
  jwt: nextAuthJwt,
});
// user signs the sponsored tx with their zkLogin ephemeral key
```

The verifier (`/api/payments/[slug]/verify`'s digest-balanceChanges mode) already handles this digest shape — no Move-side changes needed if the Audric-payer goes via `send_transfer` (plain USDC transfer, no PaymentReceipt event).

---

## What the placeholder backlog row already locks (don't re-litigate)

These are settled. The pre-draft review respects them.

| Locked | Where | Don't re-open unless founder direction changes |
|---|---|---|
| Scope is narrow — PayButton routing only | Backlog row 6 + P2.9 line 792 ("kept narrow at ~3.25d") | Onramp + offramp are SPEC 11.5 + 11.6 sibling specs |
| `composeTx` is the substrate | P2.9 line 826 + canonical-write.mdc | No parallel build path; consume the canonical primitive |
| Non-Audric payer path stays unchanged | P2.9 line 817 + canonical-write.mdc bypass row | dapp-kit + `@mysten/payment-kit` keeps working as documented |
| Hard dep on SPEC 7 Layer 0 → satisfied | S.60 closed 2026-05-04 | SPEC 11 is unblocked code-wise |
| ~3.25d effort estimate | Backlog row 6 + P2.9 line 822 | If the 5 decisions don't expand scope, this estimate holds |
| No engine version bump | Backlog item 6 ("no engine bump expected") | All work is host-side |
| Should NOT auto-execute the Audric-payer path under conservative preset | Implicit from `safeguards-defense-in-depth.mdc` (every write is `permissionLevel: 'confirm'`) | Tap-to-confirm is non-negotiable; see decision D-3 below for nuance |

---

## Architectural decisions to lock BEFORE drafting (D-1 through D-5)

These are the 5 load-bearing choices that shape the implementation. Each has my recommendation in italics. Founder should answer all 5 before SPEC 11 v0.1 drafts.

### D-1 — Surface model: in-place augment vs chat-redirect vs hybrid

When an Audric user visits `/pay/[slug]` with a session cookie, where does the confirm UX render?

**Options:**
- **D-1a (in-place augment).** The `/pay/[slug]` page detects the session and shows an "Audric-native pay" button ABOVE the existing dapp-kit `PayButton`. Clicking it renders an inline confirm card on the same page (using the existing send_transfer pending_action UI). The dapp-kit button stays as a fallback for "I want to pay from a different wallet."
- **D-1b (chat-redirect).** The page detects the session and redirects to `/chat?intent=pay&slug={slug}`. Engine receives the intent on the next chat turn, calls `send_transfer` with pre-filled `to` and `amount`, renders the standard confirm card inside `ReasoningTimeline`.
- **D-1c (hybrid — recommended).** Detection chip on `/pay/[slug]` shows: *"You're signed in as @yourhandle — pay with your Audric balance"* + a button. Clicking the button **stays on the page** (no redirect) and renders an inline confirm card. The dapp-kit `PayButton` remains BELOW as "Pay with another wallet" (renamed for clarity). User can also click "Open in Audric chat" to redirect if they want the full chat experience.

> *My rec: D-1c.* In-place augment respects the user's intent (they came here to pay this link, not to chat). Chat-redirect adds a context switch + LLM round-trip that's unnecessary for a pre-filled intent. Hybrid keeps both options visible without sacrificing the fast path.

**Why this is the most important decision:** D-1a vs D-1b changes ~60% of the implementation. D-1a needs an inline confirm component that doesn't depend on `ReasoningTimeline`. D-1b needs a chat-route side-effect handler. D-1c is the union and needs both, but each is small.

### D-2 — On-chain shape: `processRegistryPayment` Move call vs plain `send_transfer`

The dapp-kit path uses `paymentKit.tx.processRegistryPayment` which emits a `PaymentReceipt` event with the nonce. The Audric-payer path could either:

**Options:**
- **D-2a (plain send_transfer — recommended for v0.1).** Use `composeTx({ steps: [{ toolName: 'send_transfer', input: {...} }] })` which produces a plain USDC transfer. The verifier's existing digest-balanceChanges mode already handles this. No Move complexity; no new appender; no engine changes.
- **D-2b (processRegistryPayment via composeTx).** Add a new write tool `payment_link_pay` to the engine + a `addProcessRegistryPaymentToTx` appender to the SDK. The Audric-payer path goes through this new tool, emitting the same `PaymentReceipt` event the verifier registry-mode prefers.

> *My rec: D-2a for v0.1.* The verifier already supports both modes. Adding a new write tool is ~0.75d of work that buys "verifier doesn't need to fall back to balanceChanges mode" — a non-user-visible win. If we ever need atomic batching of `payment_link_pay` (SPEC 16-style), D-2b becomes worth it. Until then, plain send_transfer is the win-fast.

### D-3 — Tap-count under conservative preset

Today the user clicks "Pay" once on `/pay/[slug]`. Under SPEC 11 with the conservative permission preset, that click is followed by ANOTHER tap-to-confirm card (the standard send_transfer confirm). That's 2 taps for a $5 payment.

**Options:**
- **D-3a (2 taps under conservative — strict).** The `/pay/[slug]` "Pay" click is "I'm interested in paying this link"; the confirm card is "I authorize this exact send." Standard SPEC 7+ behavior; matches the trust model.
- **D-3b (1 tap under conservative — fast-path).** Treat the `/pay/[slug]` "Pay" click as the consent itself. Skip the standard confirm card. Justified by "the link's amount + recipient are server-validated and pre-filled; the user is already on the destination page; it's a closed system."
- **D-3c (preset-aware — recommended).** Under `aggressive` preset with amount sub-threshold → 1 tap (auto-execute, same as today's `aggressive` behavior for sub-$25 sends). Under `balanced`/`conservative` → 2 taps with the second card visually compressed (confirm card auto-focuses the action button, no scrolling needed). Net cognitive load = ~1.2 taps.

> *My rec: D-3c.* D-3b breaks the trust model that `safeguards-defense-in-depth.mdc` enshrines (every confirm-tier write taps once with full context). D-3a is correct but slightly clunky. D-3c gets the best of both — aggressive users get one tap, conservative users get the safety they opted into, but the second card is UX-tuned to feel like 1.2 taps not 2.

### D-4 — Modifiable fields: locked or editable?

`send_transfer`'s `modifiableFields` allows the user to edit `amount` and `to` before approving. For the `/pay/[slug]` Audric-payer flow:

**Options:**
- **D-4a (lock both — recommended for fixed-amount links).** Pass `modifiableFields: []` for fixed-amount payment links. The confirm card shows amount + recipient as read-only.
- **D-4b (lock recipient, allow amount edit).** For open-amount payment links (`Payment.amount === null`), `modifiableFields: ['amount']`; for fixed-amount, `modifiableFields: []`.
- **D-4c (always editable).** Pass `modifiableFields: ['amount', 'to']`. Confusing for fixed-amount links (why can I edit?) and dangerous (user types in $500 by accident on a $50 link).

> *My rec: D-4b.* Fixed-amount links lock both. Open-amount links lock recipient + allow amount input. Matches user mental model.

### D-5 — Receipt unification: who gets what AppEvent?

When the Audric-payer flow completes, two records need to land:
1. Recipient's `Payment.status='paid'` row (so PayClient flips to "Payment Complete")
2. Payer's `pay_sent` AppEvent (so the payer's chat-side activity feed shows "Sent $50 to @bob")

Today's verify route writes (1) + a `pay_received` AppEvent for the recipient. It does NOT write a `pay_sent` for the payer (because dapp-kit payers are anonymous to Audric).

**Options:**
- **D-5a (post-success dual-write — recommended).** After `composeTx + sponsor + execute` returns the digest, the audric-payer client POSTs `/api/payments/[slug]/verify` with `{ digest, paymentMethod: 'audric_native' }`. Verify route writes recipient's Payment row + `pay_received` AppEvent (existing behavior). Audric-payer client ALSO POSTs to a NEW route `/api/payments/[slug]/sender-receipt` (or extends verify route) to write the payer's `pay_sent` AppEvent.
- **D-5b (verify route auto-detects payer when paymentMethod==='audric_native').** Same as D-5a but verify route reads the payer's session and writes BOTH AppEvents server-side. Cleaner — one POST, one source of truth.

> *My rec: D-5b.* Single POST, single source of truth, matches the SPEC 7+ "server owns audit trail" pattern.

---

## Implementation gaps surfaced during review (G-1 through G-5)

These aren't decisions — they're things I noticed that need to be in the spec but aren't in the placeholder. None expand scope; all are within the ~3.25d budget if they're called out up-front.

### G-1 — Open-amount payment links (`Payment.amount === null`)

PayClient supports payment links where the amount is null (visitor types in any USDC amount). The confirm card for the Audric-payer path needs to handle this case:
- Show an amount input first
- Validate: `amount > 0` and `amount ≤ payer's USDC balance`
- Then render the confirm card with the typed amount

Today's send_transfer engine tool's `preflight` handles the validation; the UI just needs to wire the input to the pending_action's `modifiableFields: ['amount']`.

Effort: ~0.25d, folded into existing 0.5d UI polish line.

### G-2 — Edge-case state reuse (expired / cancelled / already-paid)

`PayClient` already handles `expired`, `cancelled`, `paid` states. The Audric-payer button MUST respect those — no confirm card if `Payment.status !== 'active'` or `Payment.expiresAt < now()`.

Concrete check: the page-server component passes the Payment row to the client; the Audric-payer button only renders when `state === 'active'`.

Effort: ~0.1d, inline guard in the new component.

### G-3 — Server-side session detection (no flicker)

D-1a/D-1c need server-side session detection to avoid a flash of "Connect Wallet" → "Pay with Audric" replacement on hydration. Implementation:

```typescript
// app/pay/[slug]/page.tsx
import { getServerSession } from 'next-auth';
export default async function PayPage({ params }: PageProps) {
  const { slug } = await params;
  const session = await getServerSession(authOptions);
  return <PayClient slug={slug} audricUser={session?.user ?? null} />;
}
```

Then `PayClient` conditionally renders the Audric-payer chip based on `props.audricUser` from the first render. No client-side detection needed.

Effort: ~0.25d, swallowed by the existing 0.5d session-detect line.

### G-4 — Telemetry shape (how do we know SPEC 11 routing is being used?)

Need to instrument:
- `paymentMethod: 'audric_native'` value on the `Payment` row (alongside existing `wallet_connect` + `manual`)
- New AppEvent type: `pay_sent_audric_native` (alongside `pay_sent` from non-Audric flows — except those don't exist today, so `pay_sent` is the new event type)
- Datadog tile: "audric-payer % of total /pay/ payments" with 30-day rolling window
- Success criteria: if <5% of `/pay/` payments use the Audric-native path 30 days post-launch, the SPEC was over-scoped (not enough Audric-to-Audric link sharing happens)

Effort: ~0.25d, folds into existing Phase E-equivalent telemetry line.

### G-6 — F4 absorption from S.85 B1 deferral (chip-flow error message card-level rendering)

**Why this gap exists.** S.85's B1 chip-flow walkthrough deferred F4 (*"error message visual rendering — currently inline `setError` in chip flow, no card-level surface"*) as cross-cutting visual work that didn't belong in a small-fix commit. SPEC 11 is the right home: it'll already be touching `PayClient` + the chip-flow surface for the Audric-payer routing, so adding card-level error rendering at the same time is incidental scope.

**Concrete scope:**
- Add an `<ErrorCard>` (or extend the existing `<ConfirmationCard>` with an `error?: string` prop) that renders inside the chip-flow surface when an error fires (replaces the inline `setError` text).
- Wire from `useChipFlow.ts` `state.error` to the new card.
- Apply across all 13 chip flows in one pass (the same surface SPEC 11 will be touching for Audric-payer routing).

**Effort:** ~0.25d, folds into the existing 0.5d UI polish line in the placeholder estimate.

**Why slot here, not SPEC 12:** F4 is behavioral (new error-rendering component + wiring), not consistency drift. SPEC 12's charter is "find and fix drift in things that already exist"; F4 is "build a thing that should exist." That's a SPEC 11 surgical add, not a SPEC 12 sweep target.

### G-5 — Handle display when recipient is an Audric user (SPEC 10 integration)

SPEC 10 enabled `username.audric.sui`. When the `Payment.suiAddress` belongs to an Audric user, the Payment row could carry their handle (it does today via `Payment.recipientName`). The Audric-payer confirm card should show:

> "Send $50 to **@alice**" *(0x76d7…b05012)*

Friendlier than "Send $50 to 0x76d70cf9d3ab7f714a35adf8766a2cb25929cae92ab4de54ff4dea0482b05012." This is small but ships nicely with SPEC 11 since SPEC 10 closed.

Effort: ~0.1d, conditional render in the confirm card.

---

## Small additions worth folding in (A-1 through A-3)

### A-1 — Mobile flow optimization

If the Audric user is signed in AND on mobile, the QR code (`SuiPayQr`) becomes redundant — they're already on the device with the wallet. Conditional render: hide the QR when `audricUser != null`, surface it only as a "Pay with another wallet" fallback expand-on-tap.

Effort: ~0.1d.

### A-2 — Doc + tracker housekeeping

When SPEC 11 v0.1 drafts:
- Doc location: `t2000/spec/SPEC_11_PAYBUTTON_AUDRIC_PAYER_ROUTING.md`
- Tracker entry: S.X capturing the draft (anchored to this pre-draft review)
- Update `audric-canonical-write.mdc` PayButton bypass row to add a forward-reference to SPEC 11
- Update `audric-pay-flow.mdc` to add the Audric-payer path to the surface table

Effort: ~0.15d.

### A-3 — Appendix B (the partner-shareable explainer)

Following the SPEC 16 v0.2 pattern (S.93 → S.94 lessons), every spec v0.2+ that's likely to come up in partner conversations gets an "Appendix B — How to explain this to people" section with 3 depths (30s / 2min / pitch). SPEC 11's Appendix B writes itself: *"Today an Audric user can't pay another Audric user's payment link without leaving Audric. SPEC 11 fixes that. Same security model, one tap, runs through the canonical sponsored-tx pipeline."*

Effort: ~0.15d, written during the lock pass.

---

## Updated effort estimate (post-review)

| Sub-task | Pre-review (placeholder) | Post-review |
|---|---|---|
| Detect Audric session | 0.5d | 0.25d (G-3 makes this server-side, simpler) |
| Audric-payer path via composeTx + Enoki | 1.5d | 1.5d (unchanged) |
| Non-Audric payer stays unchanged | 0d | 0d (unchanged) |
| Edge case: payer == recipient | 0.25d | 0.25d (unchanged) |
| Receipt parity test | 0.5d | 0.5d (unchanged) |
| UI polish + dual-path landing | 0.5d | 0.5d (G-1 + G-2 fold in) |
| Open-amount link UI (G-1) | — | 0d (folded into UI polish) |
| Edge-state guard reuse (G-2) | — | 0.1d |
| Telemetry shape (G-4) | — | 0.25d |
| Handle display (G-5) | — | 0.1d |
| F4 chip-flow error card-level rendering (G-6, S.85 absorption) | — | 0.25d |
| Mobile flow optimization (A-1) | — | 0.1d |
| Doc + tracker housekeeping (A-2) | — | 0.15d |
| Appendix B explainer (A-3) | — | 0.15d |
| **Total** | **~3.25d** | **~4.1d** (~0.85d above placeholder; +0.25d for G-6 absorbed from S.85 B1 deferral) |

The 0.6d delta is real but bounded. None of the gaps expand scope; they're all things that would surface during implementation and add ~10 minutes each to the diff. Calling them out up-front avoids the "while I'm here" creep that bloats specs mid-build.

---

## Recommended next step

When SPEC 12 closes and SPEC 11 unblocks for drafting:

1. **Founder answers D-1 through D-5** (5 locks, ~5 minutes per question if I draft the doc with my recommendations as defaults).
2. **Draft SPEC 11 v0.1** using this review as the substrate. ~1d to write the spec doc following SPEC 11.5 + SPEC 16 v0.2 conventions (TL;DR + decisions + architecture + phased implementation + acceptance gates + risks + Appendix B).
3. **Founder reviews v0.1, locks decisions** (same flow as SPEC 11.5 / SPEC 16 — inline answers in the D-questions).
4. **v0.2 LOCKED** → Phase A starts.
5. **Phase 1 implementation** — ~4d wall-clock with the 5 gaps pre-loaded.

Total wall-clock from "SPEC 12 closes" to "SPEC 11 ships": **~6 days** (1d draft + ~1d founder review + 4d implementation).

---

## Open questions for founder (don't need answers now — capture for the lock pass)

1. D-1 — surface model? (recommend D-1c hybrid)
2. D-2 — `processRegistryPayment` Move call or plain `send_transfer`? (recommend D-2a plain)
3. D-3 — tap-count under conservative preset? (recommend D-3c preset-aware)
4. D-4 — modifiable fields? (recommend D-4b: lock recipient always, allow amount on open-amount links)
5. D-5 — receipt unification? (recommend D-5b: verify route auto-detects audric-payer)

---

## What this review is NOT

- **Not the spec.** This is the pre-draft brief. The actual SPEC 11 v0.1 doc drafts after SPEC 12 closes.
- **Not a green-light to start coding.** No code changes from this review. Phase A doesn't start until v0.2 LOCKED.
- **Not scope-expanding.** Every finding fits inside the placeholder's narrow scope. The 0.6d delta is "fewer surprises mid-build," not "more features."

---

**End SPEC 11 pre-draft review. Promote to SPEC_11_PAYBUTTON_AUDRIC_PAYER_ROUTING.md when SPEC 12 closes.**
