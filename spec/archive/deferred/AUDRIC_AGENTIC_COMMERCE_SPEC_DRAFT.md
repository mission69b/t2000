# Audric Agentic Commerce Spec — DRAFT v0.1

> **Status:** DRAFT, 2026-05-19. Founder-framed during Phase 4b deferral of `pay_api`. Not implementation-ready — needs 7 D-questions locked before Phase 1 can ship.
>
> **Trigger:** founder framing 2026-05-19 (during web-v2 Phase 4b scope discussion): *"it does fall under Audric Store as users will generate ai content that most likely use MPP services. AGENTIC COMMERCE — 'Make me a coloring book and sell it' or 'Buy everything for my house party this Saturday' or 'Order flowers and a card for mom's birthday' or 'Christmas shopping for the whole family, max $50 each'."*
>
> **Why this spec exists:** the `pay_api` engine tool (one of 12 in `@t2000/engine` `WRITE_TOOLS`) has been homeless in the audric 5-product taxonomy since the S.18 product reframe locked Passport / Intelligence / Finance / Pay / Store. This spec defines its product home (**Audric Store + a new Agentic Commerce sub-capability**), the use cases that justify bringing it back into web-v2, and the technical work needed to ship it without re-creating the legacy 1.5k-LoC fragility.
>
> **Cross-references:**
> - **Phase 4b deferral (S.177 — to be written today):** drops `pay_api` from web-v2's tool set; legacy `apps/web` keeps shipping it; this spec drives its return.
> - **CLAUDE.md product taxonomy lock:** binding rule #2 — "MPP / 40+ AI services is NOT a product. It's an internal capability... exposed via the `pay_api` engine tool... Do not brand it as Audric Pay."
> - **`audric-roadmap.md` (local):** Audric Store roadmap (Phase 5 in product timeline).

---

## 1. Strategic framing

### 1a. The problem `pay_api` solves

Today, a user with a zkLogin wallet on audric can save / send / swap / borrow USDC. They cannot *spend* USDC on services or goods directly through audric. Every commerce intent ("buy this", "pay for that") forces them OUT of audric and into a credit card / PayPal / vendor checkout flow.

`pay_api` is the runtime that closes this loop: a single LLM-orchestrated USDC payment that goes through audric's zkLogin signer, audric's sponsored-tx gas, audric's `<financial_context>` budget awareness, and audric's agentic tool selection — but settles to an MPP (Mass-market Protocol) gateway service that actually delivers the good or service.

The legacy `audric/apps/web` ships pay_api today, but with no clear user-facing wedge — it's a generic "agent pays the gateway" pipe that the LLM rarely chooses to invoke. **That's the gap this spec fills.**

### 1b. The four founder-validated use cases

These are NOT speculative. The founder framed them verbatim 2026-05-19:

| # | Tagline | Category | Intent shape | Vendor count | Settlement |
|---|---|---|---|---|---|
| 1 | "Make me a coloring book and sell it" | AGENTIC COMMERCE — creator | LLM generates content → user lists for sale | 1 MPP (image gen) | Settlement is single-leg pay_api for inference cost; SALE is a separate Audric Store payment-link |
| 2 | "Make me a beat and sell it for $5" | AGENTIC COMMERCE — creator | Same as #1 but music gen | 1 MPP (audio gen) | Same — pay_api for inference, Store for sale |
| 3 | "Order flowers and a card for mom's birthday" | AGENTIC SERVICES — buyer | Multi-vendor curation in a single intent | 2-3 MPPs (flowers + card + maybe delivery) | Atomic multi-leg pay_api |
| 4 | "Buy everything for my house party this Saturday — balloons, lights, cake, banner, drinks" | AGENTIC COMMERCE — buyer | Multi-item, multi-vendor, agent infers missing items ("spotted I had no drinks") | 4-5 MPPs | Atomic multi-leg pay_api with "one signature" UX |
| 5 | "Christmas shopping for the whole family, max $50 each" | AGENTIC COMMERCE — buyer | Multi-recipient, multi-vendor, budget-capped | 5-N MPPs | Atomic multi-leg pay_api with per-recipient budget enforcement |

Common thread: **single user intent → LLM curates → multiple vendor payments → atomic settlement → one Passport tap-to-confirm**.

This is fundamentally different from today's "user pays one MPP service, one transaction" — which is why the legacy single-leg `payService` doesn't generalize cleanly.

### 1c. Product home

`pay_api` (and its multi-leg evolution) belongs to **Audric Store**, with a new sub-capability called **Agentic Commerce**.

**Why Store, not Pay:**
- **Pay** is user-to-user transfers (send / receive / payment links / invoices). User-to-vendor isn't Pay.
- **Store** is the "buy / sell on Sui" surface. Today it's framed as creator marketplace (Phase 5 in the roadmap). Agentic Commerce expands Store to include "buy from external vendors via the MPP gateway", which is structurally the same primitive (USDC → vendor → goods/services) just with a different vendor lookup path.

**Why Agentic Commerce as a sub-capability of Store (not a 6th product):**
- The product surface is the same as Store: user lists or buys, USDC moves, goods/services delivered.
- The "agentic" part is HOW the intent gets resolved into vendor selection, not what product the user is in.
- Adding a 6th product would break the 5-product lock in CLAUDE.md and overload the navigation/IA.

**Refined product taxonomy (no rule change, just a sub-capability addition):**

| Audric product | Verbs | Sub-capabilities |
|---|---|---|
| Audric Passport | sign-in, tap-to-confirm, sponsored gas | — |
| Audric Intelligence | profile, memory, advice, guard, skill | — |
| Audric Finance | save, swap, borrow, repay, withdraw, charts | — |
| Audric Pay | send, receive, payment-link, invoice, QR | — |
| Audric Store | list, sell, buy | **Agentic Commerce** (NEW) — agent-orchestrated multi-vendor buying via the MPP gateway, settled in USDC, single Passport tap |

Marketing copy follows from this: the public lead is "buy / sell on Sui"; Agentic Commerce is the "and the agent picks the vendors for you" superpower under Store.

---

## 2. The five guiding principles for Agentic Commerce

These are derived from the four use cases and lock the design space.

### P-1. Single intent → atomic settlement

A user types ONE sentence. They tap ONCE. Either every vendor is paid and every delivery commits, OR nothing settles. No "3 out of 5 vendors paid and now you're stuck chasing refunds for the other 2."

This is the hardest technical principle and the one that most differentiates Agentic Commerce from today's pay_api.

### P-2. Budget caps are first-class

"Max $50 each" / "max $200 total" is part of the intent, not an afterthought. The LLM must respect it; the engine must enforce it; the UX must surface it in the Passport tap card BEFORE the user signs.

This MAY share infrastructure with the existing USD-aware permission resolver (B.4 — `permission-rules.ts`), but Agentic Commerce budget caps are per-INTENT (not per-OPERATION), so the resolver needs an Agentic Commerce-aware extension.

### P-3. Vendor curation is transparent

The user sees every vendor in the Passport tap card before they commit. "5 items, 4 shops, $119 USDC. One signature." — the "4 shops" must be enumerable. No hidden vendors, no "the agent picked something and you don't see it until the receipt."

### P-4. Delivery is tracked, not assumed

For physical goods (flowers, balloons, gifts), payment ≠ delivery. The flow MUST track delivery confirmation per-leg and surface "5/5 delivered" or "4/5 delivered + 1 pending" in the audric chat thread. This is where SPEC 26 settle-no-delivery semantics get extended.

### P-5. Failure recovery is bounded

If a vendor leg fails mid-PTB (atomic case) or mid-execution (sequential case), the system MUST refund cleanly and surface the partial state. No silent failures. No "your $119 is gone, contact support."

---

## 3. Open decisions (D-questions to lock before Phase 1)

### D-1. **Atomic vs orchestrated multi-vendor settlement**

The hardest question. Two viable paths:

**D-1a. Atomic PTB approach.** Build a single Sui PTB with N `pay_api` legs (one per vendor). If any leg's USDC transfer fails, the entire PTB reverts. Pro: true atomicity on-chain. Con: each leg needs an mppx challenge fetch BEFORE the PTB builds, so the build phase has N RTTs to the gateway; if any RTT fails the build aborts (clean, but no actual on-chain atomicity yet); the actual gateway DELIVERY happens AFTER the PTB executes, which is post-atomic — so you can have all 5 USDC transfers commit and 1/5 gateway deliveries fail.

**D-1b. Sequential with rollback.** Each leg is a separate prepare → sign → complete cycle. If leg 3 fails after legs 1-2 confirmed, the orchestrator issues refund tx(s) for the confirmed legs and surfaces a partial-success state to the user.

**Recommendation (preliminary):** D-1b for Phase 1 (simpler, smaller blast radius, reuses existing route shape), evolve to D-1a in Phase 2 once we understand the actual failure modes from Phase 1 data. Each leg still gets its own Passport tap-to-confirm BATCHED into one (i.e., the Passport card shows N legs and one tap signs all N ephemeral transactions in sequence — Enoki sponsorship handles each leg's gas).

### D-2. **Budget cap enforcement layer**

Three options:

- **D-2a.** Reuse the USD-aware permission resolver (`resolvePermissionTier`) — but it operates per-operation, not per-intent.
- **D-2b.** Add a new layer ABOVE the resolver: `resolveIntentBudget(intent, vendors)` returns OK / OVER → engine guard blocks before any prepare call.
- **D-2c.** Push enforcement to the LLM via system prompt + tool description and let the guard system catch violations as a final gate.

**Recommendation (preliminary):** D-2b — explicit, observable, testable. The engine's `<financial_context>` block already surfaces budget context; this just adds a per-intent enforcement step.

### D-3. **Vendor catalog**

Where does the LLM look up "which MPP services exist for flowers?" / "which MPP services do birthday cards?"

- **D-3a.** Hardcoded vendor registry in audric (`apps/web/lib/agentic-commerce/vendors.ts`).
- **D-3b.** Dynamic discovery via `mpp.t2000.ai/v1/discovery` (would need a new gateway endpoint).
- **D-3c.** LLM-curated from a tool description (`agentic_commerce_search` engine read tool that queries the gateway).

**Recommendation (preliminary):** D-3c. The MPP gateway already has 40+ services; a `agentic_commerce_search(category, budget)` read tool surfaces matching vendors with prices, ratings, delivery times. LLM picks; user confirms via Passport tap.

### D-4. **Confirmation UX**

How does the Passport tap-to-confirm card render N vendors?

- **D-4a.** Vertical scroll list of N vendor cards inside one Passport sheet → user reviews → one tap commits all.
- **D-4b.** Per-vendor mini-cards in the chat thread that all flip to "confirmed" on a single Passport tap.
- **D-4c.** Summary card ("5 items, 4 shops, $119 USDC") with a "Show breakdown" expandable.

**Recommendation (preliminary):** D-4c with D-4a as the expanded view. Founder's framing ("5 items, 4 shops, $119 USDC. One signature.") strongly suggests a summary-first UX.

### D-5. **Delivery tracking**

How does audric know when "the flowers arrived"?

- **D-5a.** Passive — user manually marks complete in chat ("yep got them").
- **D-5b.** Active polling — audric polls each MPP service for delivery status, updates the chat.
- **D-5c.** Webhook-driven — MPP gateway webhooks audric on delivery; audric pushes a chat update.

**Recommendation (preliminary):** D-5c for shippable services (flowers, gifts) where vendor has tracking; D-5a for instant-delivery services (AI inference). Phase 1 ships D-5a only; D-5c is Phase 3+.

### D-6. **Failure recovery — the refund primitive**

When leg 3 fails after legs 1-2 committed, how does audric refund?

- **D-6a.** Vendor-initiated — audric calls vendor refund API; vendor sends USDC back to user wallet.
- **D-6b.** Treasury-bridged — audric refunds from a treasury wallet immediately; reconciles with vendor async.
- **D-6c.** Hold-then-release — payments go into an audric escrow wallet first; only released to vendors AFTER all legs deliver.

**Recommendation (preliminary):** D-6c is the cleanest but requires the MPP gateway to support "delayed settlement", which it doesn't today. D-6b is realistic but requires audric to hold treasury USDC at risk. D-6a is the legacy pay_api model and is what Phase 1 should target — vendor refund APIs already exist via mppx; just wire them up.

### D-7. **Creator-side flow (use cases #1, #2)**

"Make me a beat and sell it for $5" combines:
1. **pay_api** — inference cost to the audio gen MPP (creator pays ~$0.10).
2. **Audric Store payment-link** — listing the resulting beat at $5 for buyers.

Is this one user intent (one Passport tap creates BOTH the inference payment AND the listing) or two (one tap for inference, then another tap to list)?

**Recommendation (preliminary):** Two taps. The user has to LISTEN to the beat before listing it — there's no UX where the listing happens before content review. So Phase 1 ships the inference half (single-leg pay_api revival), and the listing half stays in the existing Store payment-link flow.

---

## 4. Technical surface — what gets built

### 4a. Phase 1 (single-vendor pay_api revival in web-v2) — ~3-5d

**Goal:** restore pay_api to web-v2 for use cases #1, #2, and the single-vendor leg of #3 (e.g., "just order the flowers"). NO multi-vendor atomicity yet.

**Routes to port from legacy `apps/web` into `apps/web-v2`:**
1. `POST /api/services/prepare` — JWT auth + service-gateway mapping + mppx challenge + composeTx + Enoki sponsor → bytes/digest/meta.
2. `POST /api/services/complete` — Enoki execute + waitForTransaction + mppx.fetch with credential → result.
3. (Optional) `POST /api/services/retry` — gateway-only replay using existing digest.

**Helpers to cross-import or port:**
- `lib/service-gateway.ts` — `SERVICE_MAP`, `createRawGatewayMapping`, `matchKnownService`.
- `complete/classify-gateway-response.ts` + `extract-vendor-error-message.ts`.

**Deps to add to web-v2:** `mppx@^0.4.9`, `@suimpp/mpp@^0.3.1`.

**Engine tool change:** re-enable `payApiTool` in web-v2's `WRITE_TOOLS` filter (remove the Phase 4b exclusion).

**Client orchestrator:** `lib/audric/pay-api.ts` exporting `dispatchPayApi(input, session)` — does prepare → sign with `ZkLoginSigner` → complete → return result. Mirrors `dispatchSaveContact` shape.

**Chat client dispatch:** add `pay_api` branch to `audric-chat-client.tsx` Approve handler that calls `dispatchPayApi`.

**Deferred from Phase 1 (Phase 2+ work):**
- Deliver-first path (Lob mail, Printful merch) — needs USDC balance pre-check + spending limits + recordPurchase.
- SPEC 26 settle-no-delivery branches at both legs.
- Prisma `servicePurchase` aggregation for $50/day, $500/month limits.
- Multi-vendor support.

### 4b. Phase 2 (atomic multi-vendor settlement) — ~5-7d

**Resolves:** D-1, D-3, D-6 (preliminary recommendations).

**New engine tool:** `agentic_commerce_search(category, budget)` — read tool that queries the MPP gateway for matching vendors. Returns `{ vendors: [{ id, name, price, deliveryDays, ratings }] }`.

**New engine tool:** `agentic_commerce_purchase(intent, vendors[])` — write tool with permission level `confirm`. Yields a SINGLE `pending_action` with `steps[]` (one step per vendor leg). Approval card renders D-4c summary + breakdown.

**Orchestrator:** sequential prepare → sign → complete per leg, with rollback via vendor refund APIs on any failure. Telemetry captures success/failure per leg.

**Budget enforcement:** new engine guard `intent_budget_cap` runs BEFORE prepare. Rejects if Σ(leg.price) > intent.budget.

### 4c. Phase 3 (delivery tracking + creator-side) — ~3-5d

**Resolves:** D-5, D-7 (preliminary recommendations).

**New backend:** webhook receiver for MPP gateway delivery confirmations. Routes events to the active chat session via existing SSE infrastructure.

**Store integration:** "list and sell" flow that wires `agentic_commerce_purchase` outcomes into Audric Store payment-link creation when the user requests "and sell it for $X."

### 4d. Phase 4 (escrow + treasury bridging) — TBD

**Resolves:** D-6c if the MPP gateway adds delayed-settlement support. Otherwise stays at D-6a / D-6b indefinitely.

---

## 5. Acceptance criteria

### Phase 1

- [ ] `pay_api` re-added to web-v2's tool set.
- [ ] Single-vendor smoke against a sandbox MPP service (Resend / PDFShift / OpenAI) succeeds end-to-end: chat → LLM proposes pay_api → Passport tap → USDC transferred → result rendered in chat.
- [ ] Free-path smoke (gateway returns 2xx without 402) succeeds without USDC movement.
- [ ] Error-path smoke (gateway returns 5xx) surfaces a clean error in chat.
- [ ] `TurnMetrics` row created with `attemptId`, `pendingActionYielded: true`, `pendingActionOutcome: 'confirmed' | 'denied' | 'failed'`, `writeToolDurationMs`.

### Phase 2

- [ ] Multi-vendor smoke succeeds: "Order flowers and a card for mom" → 2 vendor legs → 2 USDC transfers → 1 Passport tap → 2 confirmations in chat.
- [ ] Budget-cap smoke succeeds: "Buy a $50 cake and a $30 banner with a $70 budget" → rejected with clear error.
- [ ] Rollback smoke succeeds: simulate leg 2 failure after leg 1 commit → vendor refund initiated → user sees "1/2 delivered, $X refunded" in chat.

### Phase 3 / 4

- TBD once D-5 / D-6 are locked.

---

## 6. What's NOT in scope

- **Audric Pay extensions** — Pay stays user-to-user. No "send to a vendor" mixing.
- **Direct CC / fiat integration** — USDC is the only settlement currency. Vendors that don't accept USDC via MPP gateway are out of scope.
- **Recurring purchases / subscriptions** — Phase 1-3 is one-shot commerce. Subscription billing is a separate spec.
- **Refund disputes / arbitration** — Phase 1-3 trusts vendor refund APIs. Dispute resolution is a separate spec.
- **Multi-user / gift purchases** — "Buy a gift for John" where John gets the goods but you pay — Phase 4+ work.

---

## 7. Status + next action

- **DRAFT** — needs founder review.
- **Blocking issues:** D-1 through D-7 must be locked before Phase 1 implementation starts.
- **Next concrete action when ready:** founder reviews this spec → locks D-questions → opens Phase 1 implementation as `SPEC_AGENTIC_COMMERCE_PHASE_1.md` in `spec/active/shipping/`.

Until Phase 1 ships, web-v2 ships WITHOUT `pay_api` (per Phase 4b deferral). Legacy `apps/web` ships WITH legacy single-leg `pay_api` unchanged.
