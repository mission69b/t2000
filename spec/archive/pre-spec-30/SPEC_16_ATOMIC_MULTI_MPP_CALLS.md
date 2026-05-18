# SPEC 16 — Atomic Multi-MPP Calls (Payment Intent v2)

> **Status: v0.2 LOCKED** — founder decisions locked 2026-05-07. Phase A + Phase B can start. 3 pre-implementation followups (FU-1, FU-2, FU-3 in §"Pre-implementation followups") are nice-to-lock-soon but not blocking.
>
> **Version history:**
> - **v0.1 DRAFT** (2026-05-07) — initial deep-dive + 8 D-questions
> - **v0.2 LOCKED** (2026-05-07) — founder locked D1a, D3a (changed from my D3c rec — see §"D3 lock — auto-refund (founder override of D3c rec)"), D5c, server-side fan-out (open Q #9). Appendix B added (the four-depth explainer for partner / engineer / non-technical / Mysten-pitch conversations). Pre-implementation followups section added with 3 followups + 2 operational items.
>
> **Owner:** Audric Intelligence (Agent Harness team)
> **Surface impact:** `@t2000/engine` (new tool, dispatch path), `@t2000/sdk` (`pay()` extension), `@suimpp/mpp` (verifier patch + optional Challenge.batch), `apps/gateway` (claim accounting + meta passthrough), audric `prepare-bundle` route (extend to handle `pay_api_batch` proposals), audric refund-cron (NEW for D3a)
> **Estimated effort:** Phase 1 ~5–7d (was 5–7d in v0.1; D3a auto-refund adds ~0.75d for the refund-cron, absorbed in Phase D buffer) · Phase 2 ~10–14d · Phase 3 ~7–10d (Move + audit)
> **Trigger:** founder–Mysten engineer chat 2026-05-06 ("can multiple MPP calls be paid atomically?"). Verbal yes-no'd to engineer; this is the scoping doc.
> **Cross-references:** SPEC 7 (multi-write PTB), SPEC 13 (PTB chaining + bundle composition), SPEC 14 (prepare_bundle plan-time commitment). This SPEC is the natural extension that finally pulls `pay_api` into the bundle world.

---

## TL;DR (read this first)

> **The product bet.** Audric's MPP stack is single-call atomic today: one MPP call = one sponsored Sui tx = one tap-to-confirm. When the agent needs to dispatch *N* MPP calls for one user intent ("make me a lo-fi beat" = 4 calls; "buy everything for my house party" = 4 vendors), the user pays N gas-sponsored taps and the wall-clock cost is `N × (challenge + sign + execute + verify)`. This SPEC collapses that to **one tap, one PTB, one digest, N receipts** — the user signs once and the whole bundle either lands together or the unclaimed slices refund themselves.
>
> **What ships in v0.1 (Phase 1 only — minimum-viable atomic-MPP):**
> 1. New engine tool: `pay_api_batch` accepts `{ calls: [{ url, body, ... }, …] }` (≤ MAX_BUNDLE_OPS=4 in v0.1).
> 2. `pay_api_batch` runs in two passes — **resolve** (parallel: fetch each call's 402 challenge) → **bundle** (compose ONE PTB transferring N USDC slices, all to TREASURY today since every t2000 service shares one recipient) → **fan out** (parallel: re-POST each call with the shared digest as credential).
> 3. Gateway gets a one-file patch: dedup key changes from `digest` → `digest:claim_id` where `claim_id = sha256(challenge.id)`. A Redis `HINCRBY` accounts for "how much of this digest has been claimed" so two services can't double-spend the same on-chain transfer.
> 4. SDK extension: `agent.payBatch(calls)` mirrors `agent.pay()` but takes an array, returns N receipts.
> 5. Engine system-prompt rule: when the model proposes ≥2 `pay_api` calls in one turn, force `pay_api_batch` instead of N parallel `pay_api` calls. This is the only behavior change the LLM sees.
>
> **What it unlocks:** the two example flows in the user's message work today only as N sequential taps. Phase 1 makes them work as one tap. **Make me a lo-fi beat** (4 MPP calls = $0.05 + $0.04 + $0 + $5 setup = $5.09) becomes one signature. **Buy everything for my house party** (4 vendors = $20 + $33 + $55 + $11 = $119) becomes one signature. The sponsored-gas + zkLogin trust model is unchanged: one user-consented bundle is still one user-consented bundle.
>
> **What Phase 1 does NOT do:**
> - **No protocol upgrade to mppx.** The 402/credential dance still happens once per call; we just batch them around a shared digest. Future Phase 2 collapses the dance to one round-trip via a `Challenge.batch` extension.
> - **No Move primitive.** Phase 1 is best-effort: if a service fails AFTER on-chain settlement, the user is out the slice. Phase 3 introduces `t2000::payment_promise` (Hot Potato) for refund-on-failure semantics.
> - **No cross-vendor heterogeneous recipients.** The two example flows assume t2000 gateway services with shared `TREASURY_ADDRESS`. External MPP services with distinct recipients (Suno, DALL-E, Walrus, Seal as standalone MPP servers — not yet on `mpp.t2000.ai`) work mechanically (multi-recipient PTB; chain emits N balance changes; per-recipient dedup is trivial), but they need their own gateway-side patch. Out of v0.1 scope unless founder includes it.
>
> **Why now.** Two converging signals:
> - **SPEC 13 Phase 3a just shipped MAX_BUNDLE_OPS=4** for non-MPP writes (save+swap+send+borrow). The bundle infrastructure (`composeTx`, `prepare_bundle`, `pending_action_bundle` SSE event, audric `transactions/prepare` route handling N-step PTBs) exists and is battle-tested.
> - **Mysten engineer is asking.** A joint-build candidate. If we ship Phase 1 in 1 week, Phase 2 (mppx protocol upgrade) is a natural co-design pitch — uniquely Sui-native (Hot Potato + PTB + sponsored gas), useful to every MPP-server author.

---

## Pre-spec findings — what's possible TODAY (the deep dive)

Before designing the new flow, I traced the full execution path from the LLM's `pay_api` tool call → audric route → SDK `pay()` → mppx 402 dance → suimpp `verify()` → on-chain Sui tx → gateway upstream call. Three load-bearing facts:

### Fact 1 — The mppx protocol already supports "multiple challenges in one response" — but for the WRONG axis

`mppx@0.4.9` exports `Mppx.compose()` and `Challenge.fromResponseList()`. These solve "one resource, multiple payment methods to choose from" — e.g. a server says *"pay this $5 with either tempo OR stripe OR sui."* RFC 9110 §11.6.1 lets multiple `WWW-Authenticate` headers ride one 402 response.

**This is NOT the axis we want.** We want "many resources, one payment-batch." The current `compose()` would be misused if reinterpreted; we'd need a new orthogonal primitive (`Challenge.batch` or equivalent), and that's only Phase 2's job.

### Fact 2 — `@suimpp/mpp@0.6.0`'s `verify()` is the single point of contention

```typescript
// node_modules/@suimpp/mpp/dist/server.js — paraphrased
async verify({ credential }) {
  const digest = credential.payload.digest;
  if (await digestStore.has(digest)) {
    throw new Error(`Digest already used: ${digest}. Each transaction can only pay for one API call.`);
  }
  const tx = await client.core.getTransaction({ digest, include: { balanceChanges: true } });
  const payment = tx.balanceChanges.find(
    (bc) => bc.coinType === currency
         && normalizeSuiAddress(bc.address) === normalizedRecipient
         && BigInt(bc.amount) > 0n
  );
  if (BigInt(payment.amount) < requestedRaw) throw new Error('underpaid');
  await digestStore.set(digest);
  return Receipt.from({ method: 'sui', reference: digest, status: 'success', ... });
}
```

Two structural choices in this 30-line verifier define the entire blocker:
1. **`digestStore.has(digest)` then `digestStore.set(digest)`** — the dedup key is the bare digest. First gateway to verify consumes the slot; the second gateway's call hits "Digest already used" even if the on-chain tx had room for both.
2. **`balanceChanges.find(... amount > 0)`** — the verifier only checks "transferred ≥ requested" against the matching recipient row. Sui consolidates same-recipient transfers into one balance-change row. So a PTB that pays `$0.05 + $0.04 + $5` to TREASURY emits one row of `+$5.09`, and any single service-call could "claim" that whole row.

The fix surface is small: change the dedup key from `digest` → `digest:claim_id` and add accounting (HINCRBY in Redis) so the verifier can refuse claims that exceed the on-chain total. **~50 LoC patch in `@suimpp/mpp`** + a matching **~30 LoC update in `apps/gateway/lib/upstash-digest-store.ts`** to expose the new key shape.

### Fact 3 — `composeTx` is the existing "atomic multi-write" primitive — but explicitly excludes `pay_api`

`packages/sdk/src/composeTx.ts` is the single canonical entry-point for every Audric Enoki-sponsored write. SPEC 7 → SPEC 13 evolved it from "1 write per PTB" → "MAX_BUNDLE_OPS=4 with chainable inputCoinFromStep + DAG-aware adjacency." It assembles the PTB, returns `txKindBytes` ready for Enoki, auto-derives `derivedAllowedAddresses`.

But — quoting the JSDoc:

> **Excluded by design:**
> - `pay_api` — recipient/amount unknown at compose time; the on-chain leg uses `send_transfer` after the gateway 402 challenge resolves.
> - `save_contact` — no on-chain leg (Prisma-only).

That single sentence is the entire SPEC 16 problem statement. **`pay_api`'s recipient and amount become known after the 402 round-trip.** SPEC 16's job is to **insert a "resolve" pass before compose** so the recipient and amount are known by the time `composeTx` runs.

The existing primitive — `composeTx({ steps: [{ toolName: 'send_transfer', input: { to: TREASURY, amount: 0.05, asset: 'USDC' } }, …] })` — handles N-transfer PTBs flawlessly today. Phase 1 doesn't need to extend `composeTx` at all; it builds a thin wrapper that turns a list of resolved 402 challenges into a list of `send_transfer` steps and hands them to the existing primitive.

### Fact 4 — The engine's `pay_api` tool is `permissionLevel: 'confirm'` and serial-by-mutex

`packages/engine/src/tools/pay.ts` declares `isReadOnly: false, permissionLevel: 'confirm', flags: { mutating: true }`. This means the engine's `TxMutex` serializes every `pay_api` call — when the LLM emits 4 `pay_api` tool_use blocks in one turn, they execute sequentially, each with its own `pending_action` event, its own user tap-to-confirm, its own digest. This is the user-visible pain.

Phase 1's behavioral contract: **the LLM's parallel-pay_api emission pattern stays unchanged**, but a system-prompt rule + an LLM-side preflight (in `EarlyToolDispatcher` / `runTools`) **collapses N adjacent parallel `pay_api` calls into one `pay_api_batch` call** before the mutex sees them. Same emission, different dispatch.

### Fact 5 — The audric prepare-bundle / pending_action_bundle pipeline is reusable as-is

SPEC 14 already ships:
- `prepare_bundle` engine tool — LLM commits a multi-write bundle at plan time, stash in Redis.
- `pending_action_bundle` SSE event — engine emits it on user-affirmative reply, audric `transactions/prepare` builds the PTB via `composeTx` and returns `txKindBytes`.
- `bundleId` round-trip through `/api/transactions/execute` → on-confirm callback fires `EngineConfig.onAutoExecuted` per slice (TurnMetrics row per slice with shared `bundleId`).

Phase 1 reuses this pipeline verbatim. `pay_api_batch` synthesizes a `BundleProposal` shaped exactly like a multi-`send_transfer` proposal. Audric's prepare route runs the existing `composeTx` path. The only audric-side delta: **after `transactions/execute` returns the digest**, audric also fires N parallel POSTs to fan out the credential to each gateway endpoint — that's the new bit.

---

## Founder decisions — D1–D8 (PROPOSED)

Lock these before any code lands. My recommendation in italics under each.

### D1 — Phase 1 scope: t2000-internal-only or include external MPP servers? — **LOCKED: D1a**

> **What "internal only" actually means today (the founder asked this exact question — clarifying for the record).**
>
> **There are no third-party MPP servers in production today.** Every MPP service that exists right now routes through `mpp.t2000.ai` — all 41 services (Lob, Fal, OpenWeather, Resend, Brave, Serper, NewsAPI, Coingecko, AlphaVantage, ExchangeRate, DeepL, Jina, GoogleMaps, Perplexity, Firecrawl, SerpApi, Printful, etc.) are t2000-operated proxies. The Suno / DALL-E / Walrus / Seal services that appear in the user's example flows are **aspirational** — they are normal HTTP APIs today, not MPP-protocol services.
>
> So **"D1a t2000-internal-only" today literally means "all MPP services that exist."** It is not a user-facing constraint. It is a code-path constraint — we don't pre-build the multi-recipient PTB code path until a real external MPP partner appears and asks for it. When that happens (e.g. Mysten ships their own MPP server, or a partner like Tempo wires into `@suimpp/mpp@0.7.0`), we add the multi-recipient code path as a v0.2 minor extension (~5–7d).
>
> The mechanism works for external servers — chain-side semantics are identical, just N balance-change rows instead of one consolidated row. The only gating factor is "does the external server run the patched verifier?" Once `@suimpp/mpp@0.7.0` ships in Phase A, any new external server adopts it natively, and any existing external server that upgrades gets atomic-batching for free.

t2000 gateway services share `TREASURY_ADDRESS`. An external MPP server would have its own recipient. Multi-recipient PTBs work mechanically (chain emits N balance-change rows, per-recipient dedup is trivial). The blocker is that **each external server must run the patched `@suimpp/mpp` verifier** — which means we'd need to publish the patch as an `@suimpp/mpp@0.7.0` minor release and coordinate adoption.

**Options:**
- **D1a (LOCKED).** v0.1 ships t2000-internal-only (single-recipient via TREASURY + claim accounting). Equivalent to "the entire MPP universe today." External MPP servers stay sequential until an explicit partner integration ask. Phase 1 acceptance test: 4 t2000 calls atomically.
- ~~D1b. v0.1 ships both. Add multi-recipient code path (5–7d extra). External MPP servers get atomic batching as soon as they upgrade to `@suimpp/mpp@0.7.0`.~~ **REJECTED — defer to v0.2 when a real partner integration justifies the extra 5–7d.**

> **Founder lock 2026-05-07:** "Will go with your recommendation but not sure what you mean with internal only." → clarified above + locked D1a. The user-facing scope of v0.1 = every MPP service that exists today.

### D2 — Maximum batch size

SPEC 13 capped non-MPP atomic bundles at `MAX_BUNDLE_OPS=4` with rationale: "every additional step is another wallet-fetch race." MPP bundles have a different load profile — each step is a transfer (no swap routing, no NAVI oracle), so pure-transfer PTBs scale linearly to ~30 transfers before Sui's per-tx gas budget gets uncomfortable.

**Options:**
- **D2a.** Reuse `MAX_BUNDLE_OPS=4`. Lifts the cap exactly when SPEC 13's lifts. Cleanest mental model.
- **D2b.** New constant `MAX_PAY_API_BATCH=8` (or 12). Acknowledges MPP batches are cheaper than mixed-tool bundles.
- **D2c.** No engine-side cap; let chain gas budget be the natural limit (~30 transfers).

> *My rec: D2b @ 8.* The two example flows max at 4–5 calls today, but realistic future flows ("send postcards to all my LinkedIn connections from last week" → 20+ Lob calls) want headroom. 8 is enough to capture 95% of realistic batch flows without inviting "one giant batch of 30 things" anti-patterns. Revisit in 6 months with telemetry.

### D3 — Fail-mode for the "PTB lands, K of N services 5xx after settlement" — **LOCKED: D3a (founder override of my D3c rec)**

Phase 1 is no longer best-effort. PTB lands → digest is recorded → fan-out POSTs go to each service → if service K returns 5xx (upstream Suno is down, Lob rate-limits, etc.), an audric-side cron auto-fires a compensating sponsored transfer from TREASURY → user, and the user sees "$24 refunded" instead of "we'll get back to you."

**Options:**
- **D3a (LOCKED).** Auto-refund-on-failure via audric-side compensating transfer from TREASURY → user (Audric eats the failed slice + the on-chain refund tx, both sponsored).
- ~~D3b. Surface the partial failure to the user, tell them to file a refund request via support. Audric does NOT auto-refund.~~ **REJECTED — brand-killer for a finance product.**
- ~~D3c. Phase 3 (Move primitive) is the only proper answer — defer to Phase 3 for refund-on-failure, accept best-effort in Phase 1 with clear UX warning.~~ **REJECTED — Phase 3 becomes the on-chain native version of D3a, not the prerequisite for it.**

> **Founder lock 2026-05-07:** "Wouldn't auto refund be the best solution here?" → yes, founder is right. My D3c rec underweighted the brand-trust cost of "you're owed money, please wait." Switching to D3a as v0.1 default. The five reasons the lock holds:
> 1. **We own all 41 services.** No adversarial-gateway risk in v0.1 (D1a guarantees t2000-only scope). External-gateway adversarial-refund risk is a v0.2 problem when it appears.
> 2. **Sponsored gas means the refund tx is free for the user.** No "you got refunded but now you owe gas" weirdness.
> 3. **Brand promise.** Audric's whole pitch is "your money is yours, on-chain, instant." Manual refund queue contradicts that.
> 4. **Fewer support tickets.** Operationally cheaper than building a manual refund triage workflow.
> 5. **Phase 3 Move primitive becomes the native version of D3a**, not its prerequisite. Same UX, on-chain enforcement instead of off-chain cron. Clean upgrade path.

#### D3a guardrails (the 5 things that keep auto-refund safe)

These are NOT optional — they ship in Phase D alongside the refund cron, and ship together with the auto-refund mechanism in Phase 1.

| Guardrail | Mechanism | Why |
|---|---|---|
| **G1 — Per-gateway circuit breaker** | If a service's refund-rate exceeds 5% over a rolling 1h window, pause the service in the engine's `mpp_services` catalog + alert ops via Discord webhook. Service stays paused until manual unpause. | Prevents a misbehaving upstream from draining TREASURY through repeated 5xx → refund cycles. |
| **G2 — Idempotent refunds** | Refund key = `(digest, claim_id)`. Each slice gets at most one refund. Refund cron checks Prisma `RefundLedger` table before firing. | Prevents double-refund on cron retry / race condition. |
| **G3 — 24h auto-refund window** | Auto-refund fires within 24h of the failed fan-out POST. After 24h, switches to manual review queue. | Bounds the financial exposure to a fixed window; gives ops a chance to investigate weird failure clusters before they auto-refund. |
| **G4 — Treasury balance monitor** | Daily cron compares TREASURY USDC balance to projected 30-day refund volume (computed from rolling refund-rate × rolling batch volume). Alerts if reserve < 30 days at current refund rate. | Prevents TREASURY from running dry. Ops can pre-fund based on alert. |
| **G5 — On-chain audit log** | Every refund tx has a memo `refund:{digest}:{claim_id}` and a matching `RefundLedger` Prisma row + matching `AdviceLog` entry. Every refund is on-chain reconcilable. | Audit + dispute-resolution hygiene. Mandatory for the audit trail SPEC 7+ established for every write. |

#### D3a edge cases (must be handled correctly in Phase D)

| Failure mode | Detection | Action |
|---|---|---|
| **Upstream returns 5xx after on-chain settlement succeeded** | fan-out POST returns 5xx; gateway's `Payment-Receipt` was issued | **Auto-refund.** This is the canonical D3a case. |
| **Gateway returns 402 `over-claimed` (claim accounting refused)** | fan-out POST returns 402 with `over-claimed` body | **NO refund needed.** The user never paid this slice — the on-chain Redis HINCRBY refused to consume it. Surface "1 of N calls couldn't claim" to user. |
| **Upstream returns 4xx with `payment-confirmed: true`** | fan-out POST returns 4xx but Payment-Receipt header is set | **Auto-refund + flag for fraud review.** Gateway charged us but refused fulfillment. Per-gateway circuit breaker (G1) catches repeated occurrences. |
| **Fan-out POST itself times out (network failure)** | no response within timeout (5s/attempt × 3 attempts = 15s max) | **Retry via orphan-recovery cron** (see FU-3 in §"Pre-implementation followups"). If still no response after 24h, auto-refund the slice. |
| **User closes browser between EXECUTE and FAN OUT** | fan-out POST never fires from server because client never invoked the route | **Server-side fan-out (open Q #9 = server-side) means this is impossible.** The server fires fan-out automatically on EXECUTE-success, not waiting for client. |
| **Treasury insufficient balance for refund** | refund cron checks TREASURY balance before firing | **Pause refund + page ops.** Manual top-up + manual fire from ops tooling. G4 catches this before it happens. |

### D4 — Plan-time commitment via `prepare_bundle`?

SPEC 14's `prepare_bundle` is the LLM's plan-time commitment for non-MPP bundles. Should `pay_api_batch` use the same pipeline?

**Options:**
- **D4a.** Yes — `pay_api_batch` IS a `prepare_bundle` call under the hood. The LLM calls `prepare_bundle({ kind: 'pay_api_batch', calls: [...] })`. Existing fast-path consumes the stash on user-affirmative reply.
- **D4b.** No — `pay_api_batch` is its own independent plan-time tool. Different telemetry, different stash key.

> *My rec: D4a.* SPEC 14's stash + fast-path is exactly the right shape. Reusing it gives us SSE compatibility, telemetry parity, and one fewer concept to maintain. The internal `BundleProposal` discriminator gets a `kind: 'send_writes' | 'pay_api_batch'` enum.

### D5 — Engine-side preflight: force `pay_api_batch` when LLM emits ≥2 parallel `pay_api`? — **LOCKED: D5c**

When the LLM emits 4 `pay_api` tool_use blocks in one turn, today they get serialized via TxMutex.

**Options:**
- ~~D5a. **Hard force only** — engine intercepts ≥2 `pay_api` blocks in `EarlyToolDispatcher`, refuses individual dispatch, returns synthetic tool_result `{ _gate: 'use_pay_api_batch', batchId: '...' }` that prompts the LLM to re-emit as a single `pay_api_batch` call.~~ **REJECTED — pure hard-force without prompt guidance wastes a turn re-prompting the LLM that already complied with prompt rules.**
- ~~D5b. **Soft prompt only** — system prompt says "for ≥2 simultaneous MPP calls, prefer `pay_api_batch`." LLM may or may not comply.~~ **REJECTED — SPEC 13 proved soft-only drifts under load.**
- **D5c (LOCKED). Both** — soft prompt for the happy path + hard force as the safety net (matches SPEC 13's `MAX_BUNDLE_OPS` enforcement pattern).

> **Founder lock 2026-05-07:** "Go with your recommendation." Locked D5c. SPEC 13's analogous `MAX_BUNDLE_OPS` gate pattern has shipped without regression for 30 days.

### D6 — Tap-to-confirm card UX for batches

The `pending_action_bundle` SSE event already triggers the "atomic bundle" tap-to-confirm card in audric (mockup matches the user's "PAYMENT INTENT COMPILED" example exactly). But for `pay_api_batch`, the per-step preview is different: each row is "service + endpoint + cost + upstream result preview" rather than "save 100 USDC into NAVI."

**Options:**
- **D6a.** Reuse the existing bundle-confirm card with new row renderers per step kind.
- **D6b.** New "Payment Intent Card" component with vendor logos + per-call line items + total.
- **D6c.** Auto-execute under USD threshold: if `total < $5` and `permissionConfig.preset === 'aggressive'`, no card — just receipt.

> *My rec: D6a + D6c (for the conservative cohort, never auto-execute multi-call batches even if individually below threshold; the AGGREGATE risk is what the user is consenting to).* New component = scope creep; reuse the existing card with a new `BundleStep.kind === 'pay_api_call'` renderer. Auto-execute is OK for the aggressive preset because they've explicitly opted into "small writes happen without a tap" — but only if the AGGREGATE total is under their threshold, not just each individual slice.

### D7 — Receipt fan-out: parallel or sequential?

After the PTB lands, the engine has the digest and N pre-resolved 402 challenges. It POSTs back to each gateway endpoint with `Authorization: Payment <credential>`. These N POSTs can run in parallel.

**Options:**
- **D7a.** Parallel (N concurrent fetches with `Promise.all`). Fastest happy path. Risk: if 3 of 4 gateways go down simultaneously, all 3 fail without backoff.
- **D7b.** Sequential with backoff. Resilient but slow (N × ~500ms).
- **D7c.** Parallel with per-call retry (3-attempt exponential backoff on 5xx). Best of both.

> *My rec: D7c.* Single MPP calls already have retry-on-5xx via `fetchWithRetry` in the gateway. Phase 1 batches mirror this per-call.

### D8 — Telemetry / TurnMetrics shape

SPEC 7+ writes one `TurnMetrics` row per write step in a bundle, all sharing a `bundleId`. Phase 1 should mirror this for `pay_api_batch` — one row per call, one shared `batchId == bundleId`.

**Options:**
- **D8a.** Reuse `bundleId` exactly. One MPP call = one TurnMetrics row with `bundleId` + `attemptId`.
- **D8b.** New `mppBatchId` distinct from `bundleId` to avoid mixing telemetry with non-MPP bundles.

> *My rec: D8a.* Same telemetry surface, simpler analytics. The `kind` field on the row already disambiguates.

---

## Architecture overview

### Layer map

```
┌────────────────────────────────────────────────────────────────────────┐
│ Audric web (apps/web)                                                  │
│  • engine-context: registers `pay_api_batch` audric-side tool           │
│  • /api/transactions/prepare: handles `kind: 'pay_api_batch'` via      │
│    composeTx (synthesize N send_transfer steps from resolved 402s)     │
│  • /api/transactions/execute: returns digest as today                  │
│  • NEW: /api/mpp/fan-out: parallel POSTs N credentials, returns N      │
│    receipts (called from client after execute)                         │
│  • PendingActionBundle UI: extends existing card with pay_api_call rows│
└────────────────────────────────────────────────────────────────────────┘
                                 ▼
┌────────────────────────────────────────────────────────────────────────┐
│ @t2000/engine (packages/engine)                                        │
│  • tools/pay-batch.ts: NEW pay_api_batch tool                           │
│  • EarlyToolDispatcher: hard-force gate when ≥2 pay_api detected (D5c) │
│  • engine.ts: agentLoop emits pending_action_bundle for pay_api_batch  │
│  • compose-bundle.ts: extend BundleProposal.kind enum                  │
└────────────────────────────────────────────────────────────────────────┘
                                 ▼
┌────────────────────────────────────────────────────────────────────────┐
│ @t2000/sdk (packages/sdk)                                              │
│  • t2000.ts: NEW agent.payBatch(calls) — multi-call mppx orchestrator  │
│  • composeTx.ts: NO CHANGES — synthesized N×send_transfer flows        │
│    through unchanged                                                   │
└────────────────────────────────────────────────────────────────────────┘
                                 ▼
┌────────────────────────────────────────────────────────────────────────┐
│ apps/gateway (mpp.t2000.ai)                                            │
│  • lib/gateway.ts: PATCH — new mppx wrapper that passes claim_id meta  │
│    to @suimpp/mpp's challenge.opaque (challenge.id is already unique)  │
│  • lib/upstash-digest-store.ts: PATCH — keys become                     │
│    `mpp:digest:{digest}:{claimId}`. NEW: `mpp:digest-claims:{digest}`   │
│    Redis hash tracks { claimed, total } via HINCRBY                     │
│  • Each route handler: NO CHANGES (mppx wrapper is the only seam)      │
└────────────────────────────────────────────────────────────────────────┘
                                 ▼
┌────────────────────────────────────────────────────────────────────────┐
│ @suimpp/mpp (external npm package)                                     │
│  • dist/server.js: PATCH `verify()` to read `claimId` from               │
│    challenge.opaque, update digest-store call shape, add HINCRBY         │
│    accounting against the on-chain balance-change total                  │
│  • Publish as @suimpp/mpp@0.7.0                                         │
│  • NO breaking change: callers without claimId fall through to old       │
│    bare-digest dedup (single-call mode). Backwards-compat preserved.   │
└────────────────────────────────────────────────────────────────────────┘
                                 ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Sui chain (mainnet)                                                    │
│  • One PTB: splitCoins → transferObjects([slice1, slice2, …])           │
│  • One digest, N balance-change rows (or one consolidated row if all to│
│    same TREASURY recipient)                                            │
│  • Sponsored gas via Enoki                                             │
└────────────────────────────────────────────────────────────────────────┘
```

### The four-pass flow

For the example user query *"Make me a lo-fi beat called Midnight Rain and sell it for $5"*:

#### Pass 1 — RESOLVE (parallel, ~200–500ms total)

LLM emits one tool_use:
```json
{
  "name": "pay_api_batch",
  "input": {
    "calls": [
      { "url": "https://mpp.t2000.ai/suno/v1/generate", "body": "{\"prompt\":\"lo-fi beat\",\"length\":134}", "method": "POST" },
      { "url": "https://mpp.t2000.ai/fal/fal-ai/flux/dev", "body": "{\"prompt\":\"lo-fi cover art\"}", "method": "POST" },
      { "url": "https://mpp.t2000.ai/walrus/v1/upload", "body": "{...}", "method": "POST" },
      { "url": "https://mpp.t2000.ai/seal/v1/gate", "body": "{\"price\":\"5\"}", "method": "POST" }
    ]
  }
}
```

Engine `pay_api_batch.call()`:
1. `Promise.all([fetch(call0.url, { method:'POST', body:call0.body }), …])` — fires all 4 POSTs in parallel with NO Authorization header.
2. Each gateway returns 402 with `WWW-Authenticate: Payment id="…", realm="mpp.t2000.ai", method="sui", intent="charge", request="<base64 {amount, currency, recipient}>"`.
3. Engine collects 4 challenges. Computes `claimId = sha256(challenge.id)` per call.
4. Builds the bundle proposal:
   ```typescript
   {
     kind: 'pay_api_batch',
     batchId: randomUUID(),
     steps: [
       { toolName: 'send_transfer', input: { to: TREASURY, amount: 0.05, asset: 'USDC' }, mppContext: { url: '…/suno/…', challengeHeader: '…', body: '…' } },
       { toolName: 'send_transfer', input: { to: TREASURY, amount: 0.03, asset: 'USDC' }, mppContext: { url: '…/fal/…', … } },
       { toolName: 'send_transfer', input: { to: TREASURY, amount: 0,    asset: 'USDC' }, mppContext: { url: '…/walrus/…', … } },
       { toolName: 'send_transfer', input: { to: TREASURY, amount: 5,    asset: 'USDC' }, mppContext: { url: '…/seal/…', … } },
     ],
     totalUsd: 5.08,
     ttl: 60_000,
   }
   ```
5. Stashes via existing `writeBundleProposal()`. Emits `pending_action_bundle` SSE.

> Side note: Walrus charges $0 in the example. The PTB still includes a $0 transfer for that slice — keeps the per-slice claim-id accounting symmetric. Alternatively, the resolver could skip $0 calls (call them with no Authorization, store the result directly). Decision deferred to D-questions follow-up.

#### Pass 2 — USER CONFIRM (~200ms)

Audric UI renders the existing bundle-confirm card with new `pay_api_call` row renderer:

```
PAYMENT INTENT COMPILED · 4 CALLS · ATOMIC
─────────────────────────────────────────
call[0]  Suno  generate lo-fi beat 2:14         $0.05
call[1]  FAL   flux/dev cover art 1024×1024     $0.03
call[2]  Walrus upload (free)                    $0.00
call[3]  Seal  $5 USDC unlock gate config        $5.00
─────────────────────────────────────────
ATOMIC · 1 SIGNATURE · GAS SPONSORED         $5.08
                                            [TAP TO CONFIRM]
```

User taps. Audric `/api/transactions/prepare` reads stash via `bundleId`, calls `composeTx({ steps: [send_transfer × 4], … })`, returns `txKindBytes + derivedAllowedAddresses`.

#### Pass 3 — SIGN + EXECUTE (~1.5–3s)

Standard sponsored-tx path. zkLogin signs `txKindBytes`, Enoki sponsors gas, `/api/transactions/execute` returns `{ digest, balanceChanges }`.

#### Pass 4 — FAN OUT (parallel, ~300–800ms total)

Audric client (or a NEW server-side `/api/mpp/fan-out` route — see D-question follow-up on where this lives) iterates `bundleProposal.steps`:

```typescript
const credentials = steps.map((step, i) => Credential.from({
  challenge: deserializeChallenge(step.mppContext.challengeHeader),
  payload: { digest },
}));

const receipts = await Promise.all(
  steps.map((step, i) =>
    fetchWithRetry(step.mppContext.url, {
      method: 'POST',
      headers: {
        'Authorization': Credential.serialize(credentials[i]),
        'Content-Type': 'application/json',
      },
      body: step.mppContext.body,
    }, 3),
  ),
);
```

Each gateway:
1. Receives credential. Extracts `claimId` from `challenge.opaque.claimId`.
2. Checks `digest-claims:{digest}` Redis hash. If `claimed + request.amount > total`, refuses with 402 `{ error: 'over-claimed' }`.
3. Otherwise: `HINCRBY digest-claims:{digest} claimed +request.amount`, sets `digest:{digest}:{claimId}`, runs upstream service call, returns 200 with body + `Payment-Receipt`.

Engine collects N receipts, returns to LLM:
```json
{
  "data": {
    "results": [
      { "url": "…/suno/…", "status": 200, "body": {...}, "paid": true, "cost": 0.05 },
      { "url": "…/fal/…", "status": 200, "body": {...}, "paid": true, "cost": 0.03 },
      { "url": "…/walrus/…", "status": 200, "body": {...}, "paid": true, "cost": 0 },
      { "url": "…/seal/…", "status": 200, "body": {...}, "paid": true, "cost": 5 },
    ],
    "totalPaid": 5.08,
    "digest": "0xABC...",
    "batchId": "..."
  },
  "displayText": "4 MPP calls completed — paid $5.08 atomically"
}
```

Total wall-clock: ~2.5–4.5s. Single tap. Single signature.

---

## Phased implementation

Five phases. Phase 1 is the v0.1 ship target. Each phase has its own verify gates.

### Phase A — `@suimpp/mpp@0.7.0` claim accounting (~2d)

**What:** Patch the verifier to support optional `claimId` in `challenge.opaque`. When present, use `(digest, claimId)` as the dedup key + the new `digest-claims:{digest}` Redis hash for accounting. When absent, fall through to legacy bare-digest dedup. Publish as a minor release; backwards-compat preserved.

**Files touched:**
- `packages/mpp/src/server.ts` — extend `verify()`. ~50 LoC patch.
- `packages/mpp/src/in-memory-digest-store.ts` — extend `DigestStore` interface to support `incrClaim(digest, amount, total): boolean` (returns false if would exceed `total`). ~30 LoC.
- `packages/mpp/CHANGELOG.md` — document the new opt-in claim mode.
- `packages/mpp/README.md` — usage example for batched calls.

**Verify gates:**
- Existing single-call test suite passes (no behavioral regression for callers without `claimId`).
- New test: 4 charges to same recipient with same digest, distinct `claimId`s, totaling ≤ on-chain transfer → all 4 succeed.
- New test: 5th charge that would exceed on-chain total → returns 402 `over-claimed`.
- New test: 2 charges with same `claimId` → second one returns 402 `claim-id already used`.

### Phase B — `apps/gateway` claim-key + Redis hash patch (~1d, can run in parallel with Phase A)

**What:** Update `apps/gateway/lib/upstash-digest-store.ts` to implement the new `incrClaim` interface. Update `apps/gateway/lib/gateway.ts`'s `Mppx.create()` config to pass `claimId` automatically (derived from `challenge.id`) on every charge. Roll forward to the patched `@suimpp/mpp@0.7.0` once Phase A ships.

**Files touched:**
- `apps/gateway/lib/upstash-digest-store.ts` — new `incrClaim` method using Redis Lua script (atomic HGET total + HINCRBY claimed + comparison). ~40 LoC.
- `apps/gateway/lib/gateway.ts` — pass `meta: { claimId: sha256(challenge.id) }` in `mppx.charge()` invocation. ~5 LoC.
- `apps/gateway/package.json` — bump `@suimpp/mpp` to `^0.7.0`.
- `apps/gateway/__tests__/gateway-claim-accounting.test.ts` — 4 t2000 services share a digest with claim accounting; test all 4 verify successfully + 5th over-claim is rejected.

**Verify gates:**
- All existing gateway tests pass.
- New integration test: 4 t2000 service calls with shared digest + claim accounting all return 200.
- Manual: deploy to staging, hit 4 endpoints with shared digest from a test wallet, verify all 4 receipts.

### Phase C — `@t2000/sdk` `agent.payBatch()` + engine `pay_api_batch` tool (~3d)

**What:** New SDK method that orchestrates the resolve → bundle → fan-out flow on the SERVER side (same module that already houses `agent.pay()`). New engine tool `pay_api_batch` that calls it. New `EarlyToolDispatcher` gate that intercepts ≥2 parallel `pay_api` blocks and synthesizes a single `pay_api_batch` proposal.

**Files touched:**
- `packages/sdk/src/t2000.ts` — new `payBatch(calls): Promise<BatchPayResult>`. ~120 LoC. Reuses internal `Mppx.create()` + `mppx.fetch()` per call but coordinates the digest across all of them via a manual override of the `execute()` callback (returns the same digest for every call).
- `packages/engine/src/tools/pay-batch.ts` — NEW tool. ~80 LoC. Calls `agent.payBatch()`.
- `packages/engine/src/tools/pay.ts` — extend description to point at `pay_api_batch` for ≥2 calls.
- `packages/engine/src/index.ts` — export the new tool.
- `packages/engine/src/early-tool-dispatcher.ts` — new D5c hard-force gate. ~30 LoC.
- `packages/engine/src/__tests__/pay-api-batch.test.ts` — full coverage (resolve, bundle, fan-out, partial-failure handling, dispatcher gate).

**Verify gates:**
- Engine test: 4 `pay_api` blocks in one turn → dispatcher synthesizes 1 `pay_api_batch` call → tool produces a `pending_action_bundle` event with 4 send_transfer steps.
- Engine test: `pay_api_batch` with 1 call → falls through to single-call mode (works like a regular `pay_api`).
- Engine test: `pay_api_batch` with N > MAX_PAY_API_BATCH (D2) → refuses with `_gate: 'max_pay_api_batch'`.
- Live test against gateway: 4 t2000 services in one batch → 1 PTB on Sui mainnet → 4 receipts back. Latency ≤ single-call × 1.5.

### Phase D — Audric host integration (~1.5d)

**What:** Audric `/api/transactions/prepare` learns to handle `BundleProposal.kind === 'pay_api_batch'`. The synthesized N-step `composeTx` call is unchanged from the existing send_transfer path. NEW route `/api/mpp/fan-out` (or client-side fan-out — see D-question follow-up) handles credential POSTs after execute. Bundle-confirm UI gets the new row renderer for `pay_api_call`.

**Files touched:**
- `audric/apps/web/lib/engine/prepare-bundle-tool.ts` — extend `BundleProposal.kind` discriminator. ~20 LoC.
- `audric/apps/web/app/api/transactions/prepare/route.ts` — handle the new kind (composeTx call is identical, just different step source). ~30 LoC.
- `audric/apps/web/app/api/mpp/fan-out/route.ts` — NEW route. Reads bundle stash by `batchId`, fans out credentials in parallel with retry, returns N receipts. ~70 LoC.
- `audric/apps/web/components/PendingActionBundleCard.tsx` — new row renderer for `pay_api_call`. ~50 LoC.
- `audric/apps/web/__tests__/pay-api-batch-e2e.test.ts` — full e2e against gateway-staging. Asserts 1 user click → 1 PTB → 4 receipts in <5s.

**Verify gates:**
- E2E happy-path against staging gateway: 4 calls, 1 tap, 4 receipts.
- E2E partial-failure: simulate 1 of 4 upstream services 503'ing → user sees "3 of 4 succeeded; we owe you $X" UI; ops queue captures the failed slice.
- Manual: trigger from chat ("make me a lo-fi beat" with mocked Suno endpoint) → verify the canvas renders correctly.

### Phase E — Telemetry, observability, runbook (~1d)

**What:** Per-call TurnMetrics rows with shared `bundleId == batchId`. Datadog dashboard tile for "atomic MPP batches per day" + "atomic MPP partial-failure rate." RUNBOOK entry for the partial-failure ops queue.

**Files touched:**
- `audric/apps/web/lib/engine/engine-context.ts` — `onAutoExecuted` already fires per slice; verify no changes needed.
- `audric/apps/web/lib/metrics/datadog.ts` — new histogram `mpp.batch.size` + counter `mpp.batch.partial_failures`.
- `t2000/spec/runbooks/RUNBOOK_atomic_mpp_partial_failure.md` — NEW runbook. Manual refund flow, ops queue triage SLO, escalation path.

**Verify gates:**
- Datadog tile populates after first staging run.
- Runbook walked through with on-call rotation; partial-failure simulation triggers ops alert within 60s.

---

## Acceptance gates (merge-time smoke test)

These are the binary go/no-go checks before any Phase 1 code merges to main. All must pass.

1. **Single-call regression — t2000 gateway.** `curl -X POST /openweather/v1/weather` (with payment) returns 200. Latency ≤ pre-patch baseline + 50ms (claim accounting overhead is one Redis Lua call).
2. **Backwards-compat — third-party MPP servers.** A self-hosted `@suimpp/mpp@0.6.0` server (still on the old version) accepts charges from the patched audric SDK without errors. The audric SDK detects the old server and falls back to single-call mode.
3. **Atomic batch happy path — 4 t2000 services.** From a chat session, ask the agent to "send 4 different postcards via Lob in one turn" → 1 `pay_api_batch` call → 1 PTB → 4 receipts → 1 user tap.
4. **Atomic batch over-claim refusal.** Manually craft a 5-call request where the on-chain transfer total < sum of requested amounts → first 4 verify, 5th gateway returns 402 `over-claimed`. Engine surfaces "1 of 5 calls failed; refund pending."
5. **Atomic batch partial upstream failure.** Mock 1 of 4 upstream services to return 503 → 3 services return receipts, 1 fails → audric UI shows partial-failure card → ops queue receives the unfulfilled slice → manual refund flow works end-to-end.
6. **MAX_PAY_API_BATCH cap.** Try to batch N+1 calls (where N is D2's value) → engine refuses with `_gate: 'max_pay_api_batch'`. LLM splits.
7. **Permission preset interaction.** With `permissionConfig.preset === 'aggressive'` and total batch USD < the preset's threshold → batch auto-executes (no tap). With `preset === 'conservative'` → ALWAYS requires tap regardless of size.
8. **Telemetry parity.** Per TurnMetrics row exists for each call with shared `bundleId`. Datadog histogram populates correctly.

---

## Risks + mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `@suimpp/mpp@0.7.0` patch introduces a regression in single-call mode | Med | High | Comprehensive backwards-compat test in Phase A. Staging soak for 48h before prod cut. Feature flag `MPP_CLAIM_ACCOUNTING_ENABLED` for instant rollback. |
| Redis Lua script (atomic HGET + HINCRBY + compare) breaks under load | Low | Med | Load-test at 100 batches/sec on staging Upstash. Lua scripts are atomic on Upstash but scripts have a soft 5MB output cap; ours is ~200B. |
| LLM regresses to N-parallel-`pay_api` after D5c hard-force gate | Low | Low | Engine returns synthetic `_gate: 'use_pay_api_batch'` tool_result; the gate is deterministic. SPEC 13's analogous gate has shipped without regression for 30 days. |
| Partial-failure UX confuses users (3 of 4 succeeded but they paid for all 4) | Med | Med | Receipt UI is explicit ("$95 of $119 fulfilled; refund of $24 in flight"). Audric ops queue auto-files refund within 24h. D3a (auto-refund) for high-volume failure modes. |
| Cross-vendor batches with distinct recipients (post-D1b) introduce per-recipient ordering bugs | Low | High | Defer to v0.2. v0.1 is single-recipient (TREASURY) only. |
| Move primitive (Phase 3) ships and forces a flag-day migration | Low | Med | Phase 3's `payment_promise` is additive — claim accounting (Phases A/B) keeps working alongside. Long deprecation window. |
| Gas budget exhaustion at MAX_PAY_API_BATCH=8 with all-USDC transfers | Very Low | Low | Sui's per-tx gas budget supports 30+ trivial transfers. 8 is well within. Run `dryRunTransaction` in `composeTx` for safety. |

---

## Out of scope (v0.1)

These are explicit non-goals. Listing them so we don't drift.

- **Cross-vendor batches with distinct recipients** (D1b). Defer until external MPP servers exist + a partner asks for it.
- **Move primitive `t2000::payment_promise`** (Phase 3). Defer until Phase 1 ships and we have telemetry on partial-failure rates.
- **mppx protocol upgrade with `Challenge.batch`** (Phase 2). Defer until Mysten engineer + audric agree on a co-design path. Phase 1 is sufficient.
- **Recurring/scheduled batched payments.** Out of harness scope under zkLogin (ephemeral session keys).
- **Cross-chain MPP batches** (e.g. Sui MPP + EVM x402). MPP is single-chain-per-batch by design.
- **Batched READS with shared payment.** Discovery (`mpp_services`) is free already; batched read economics aren't a real ask.
- **Refund-on-over-claim auto-recovery.** Phase 1 surfaces over-claim as a 402; recovery is manual via ops queue. Auto-recovery is Phase 3 territory.
- **Per-call partial-success refund of the slice.** Phase 1 best-effort: user pays, we promise to chase the refund. Not on the hot path.

---

## Open questions for founder

10 specific questions that need a yes/no/option-pick. Lock these alongside the D-questions before any code lands.

1. Confirm D1a (t2000-internal-only for v0.1)?
2. Confirm D2b (`MAX_PAY_API_BATCH=8`)?
3. Confirm D3c (Phase 1 best-effort with manual refund queue; Phase 3 = Move primitive for refund-on-failure)?
4. Confirm D4a (reuse `prepare_bundle` pipeline, add `kind: 'pay_api_batch'` discriminator)?
5. Confirm D5c (soft-prompt + hard-force gate at engine dispatcher)?
6. Confirm D6a + D6c (extend existing bundle card with new row renderer; auto-execute under USD threshold ONLY for aggressive preset and ONLY if AGGREGATE total is sub-threshold)?
7. Confirm D7c (parallel fan-out with per-call retry)?
8. Confirm D8a (one TurnMetrics per call, shared `bundleId == batchId`)?
9. ~~Where should the fan-out POSTs live~~ — **LOCKED 2026-05-07: server-side `/api/mpp/fan-out` route.** Keeps the `Authorization` header construction off the client; lets us reuse the gateway's HMAC secret-key access for verifying receipts before storing them; survives the user closing their browser between EXECUTE and FAN OUT (critical for D3a auto-refund — server fires fan-out automatically on EXECUTE-success, not waiting for client). ~70 LoC route.
10. Should `pay_api_batch` automatically include `$0` calls in the PTB (preserves per-slice claim-id symmetry; tiny gas cost) or short-circuit them (avoids unnecessary on-chain transfers)? *(My rec: short-circuit. Resolve `$0` calls outside the PTB by POSTing them with no Authorization header in the same parallel batch; merge their receipts into the final result. Avoids 1+ on-chain transfers per Walrus-style free service.)* **Status: deferred to FU-1 (see §"Pre-implementation followups"). Not blocking the lock.**

---

---

## Pre-implementation followups (3 nice-to-lock-soon Qs + 2 operational items)

Surfaced during v0.2 lock. None block Phase A starting — Phase A (`@suimpp/mpp@0.7.0` claim accounting) is independent of all 5. But each should be locked before Phase D (audric integration) starts. Founder review can be inline or batch.

### FU-1 — `$0` calls: include in PTB or short-circuit? *(originally Open Q #10)*

When a batch includes a `$0` call (e.g. a Walrus-style free service), should the resolver:
- **FU-1a (recommended).** Short-circuit — POST the `$0` call with no Authorization header in the same parallel resolve batch; merge its receipt into the final result outside the PTB. Skips a useless on-chain transfer. Total per-batch on-chain cost: `count(non-zero calls) transfers`.
- **FU-1b.** Include in PTB as a $0 transfer for symmetry. Mechanically clean (every call is a slice) but wastes ~3KB of gas budget per $0 call.

Recommendation locks unless founder objects: **FU-1a.**

### FU-2 — Resolve-pass partial failure: fail-fast or best-effort batch?

What happens during the RESOLVE pass (parallel 402 fetches) if 1 of N fetches times out / returns 5xx?
- **FU-2a (recommended).** Fail-fast — if any of the N resolve fetches fails, abort the whole batch. Tell the user "1 of 4 services unreachable; please retry." No on-chain leg fires. Cleanest semantics: a batch is either fully resolved or not at all.
- **FU-2b.** Best-effort — drop the failed one, continue with N-1. Surface "3 of 4 will be charged; 1 unavailable." More forgiving but introduces partial-batch UX before the user even taps to confirm.

Recommendation locks unless founder objects: **FU-2a.** Aligns with the "atomic" brand promise.

### FU-3 — Orphan-recovery cron for in-flight fan-outs

Server-side fan-out (Open Q #9 LOCK) means the server fires fan-out automatically on EXECUTE-success. But what happens if the server itself crashes between "EXECUTE returned digest" and "all N fan-outs POSTed"? The on-chain leg succeeded, the digest is recorded, but K services were never claimed.

**Mechanism (the recommendation that locks unless founder objects).**
- After EXECUTE succeeds, server writes `BatchInFlight` Prisma row: `{ batchId, digest, slices: [{ url, claimId, claimed: false }] }`.
- Each successful fan-out POST flips `claimed: true` for its slice.
- A 5-minute cron scans `BatchInFlight` rows where `now() - createdAt > 5min AND any slice.claimed === false`. Re-fires the fan-out for each unclaimed slice.
- After 24h with `claimed === false`, escalates to D3a auto-refund for that slice.
- After successful claim, row stays in DB for 30 days (audit trail) then GC's.

Effort: ~0.5d. Folds into Phase D.

### FU-O1 — Fee handling (operational clarification)

CLAUDE.md rule #9 says fees are an Audric concern, not an SDK concern. **No NEW per-batch fee.** The per-service prices baked into the gateway routes already include the t2000 markup. Batching is a UX win, not a revenue lever — explicitly do NOT add a "0.1% bundle fee" or any other batch surcharge. Otherwise we'd be incentivizing users to call APIs sequentially to avoid the fee, which defeats the point. Phase 1 ships fee-neutral.

### FU-O2 — Staged rollout plan (operational)

Phase 1 rollout schedule (operational; ops team owns the gates):

| Day | Audience | Gate to advance |
|---|---|---|
| Day 1–3 | Internal dogfood (founder + team) — feature-flagged via `MPP_BATCH_ENABLED=true` per session | 0 unrecovered partial failures; ≥10 successful batches; latency p95 ≤ single-call × 1.5 |
| Day 4–7 | 1% of users (random selector by user ID hash) | Same gates + refund cron has fired ≥1 successful auto-refund AND zero false-positive refunds |
| Day 8–14 | 10% | Per-gateway circuit breaker (G1) verified — at least 1 simulated 5xx-burst triggered the breaker without false positives |
| Day 15–21 | 100% | Telemetry baseline established for `partial_failure_rate`, `refund_rate_per_gateway`, `batch_size_p50/p95`, `wall_clock_per_batch_p50/p95` |

After 21 days at 100%, Phase 1 closes and we evaluate Phase 2 / Phase 3 promotion based on telemetry.

---

## What I need from you next

**v0.2 LOCKED** — D1a, D3a, D5c, server-side fan-out (Open Q #9). Phase A + Phase B can start in parallel.

3 followups (FU-1, FU-2, FU-3) should be locked before Phase D starts (~3 days into the implementation window). FU-O1 and FU-O2 are operational and don't block code.

The next step is **Phase A** (`@suimpp/mpp@0.7.0` claim accounting) — ~2d. Followed in parallel by **Phase B** (`apps/gateway` claim-key + Redis hash patch) — ~1d. Then **Phase C** (engine + SDK) — ~3d, then **Phase D** (audric integration including refund cron) — ~2d, then **Phase E** (telemetry + runbook) — ~1d. Realistic Phase 1 wall-clock from green-light: **~6–8 days** (D3a auto-refund adds ~0.75d to original 5–7d estimate).

---

## Appendix A — Why this is uniquely Sui-native

The Mysten engineer asked the founder if this was possible. Three protocol-level facts that make Sui uniquely good at this (vs. trying it on Ethereum or Solana):

1. **PTB atomicity by construction.** A Sui PTB is one transaction with N programmable steps. `splitCoins` + N × `transferObjects` is a single tx, single digest, single signature. Ethereum's analog is a multicall contract or batched user-op (post-EIP-4337) — both add an additional contract layer; both have their own quirks around gas estimation and revert semantics. Solana has versioned transactions but the lookup-table machinery is more invasive.

2. **Sponsored-gas via Enoki has no per-leg overhead.** A 4-transfer PTB sponsored via Enoki costs the user $0 in gas. A 4-transfer batch on EVM via a sponsored bundler still has per-op gas overhead that grows with N.

3. **Hot Potato (Phase 3 only).** Sui's Hot Potato resource lets us write a `PaymentPromise<T>` that MUST be claimed or refunded within the same on-chain timeout window. No equivalent on EVM (you can write a multi-claim escrow contract, but it's heavier and the refund path requires a user-initiated tx — not an automatic on-chain timeout).

The combination of (PTB + sponsored gas + Hot Potato) is a uniquely Sui pitch. Phase 1 ships without the Hot Potato (best-effort + audric-side auto-refund cron, see D3a), but the doc and the architecture are written so Phase 3 slots in cleanly.

---

## Appendix B — How to explain SPEC 16 to people (partner / engineer / non-technical / Mysten-pitch)

Added 2026-05-07 during v0.2 lock. The founder asked "how can I explain this to people, the issue today and how to fix it?" — these four versions are pre-tuned for different audiences. Copy-paste verbatim or remix as needed.

### B.1 — The 30-second version (anyone)

> *Today, an AI agent that needs to call 4 services on Sui has to make the user tap 4 times. Each call = its own signature, its own transaction, its own ~3 seconds of waiting. The blocker is one line of code in the payment verifier: it treats every transaction as good for exactly one API call.*
>
> *We can change that line. Once we do, an agent can bundle 4 calls into ONE signed transaction — same trust model, same on-chain settlement, but the user sees one tap and one receipt covering everything. The fix is ~80 lines of code across two files. Phase 1 in a week.*

### B.2 — The 2-minute version (engineer / partner Slack DM)

**The issue today.** Every MPP call follows the same dance:

```
LLM → POST /service           (no auth)
service → 402 Payment Required (here's the price)
LLM → build PTB, sign, execute (Sui mainnet)
LLM → POST /service            (with the digest as proof of payment)
service → 200 OK + result
```

That's **one Sui transaction per service call**. When the agent needs 4 calls (generate music + cover art + storage + pay-gate), it's 4 sequential transactions, 4 user taps, ~12 seconds of wait. Even with sponsored gas making it free, the *experience* feels like online banking from 2008.

**The exact blocker.** The verifier at `@suimpp/mpp` does this:

```javascript
if (await digestStore.has(digest)) {
  throw new Error('Digest already used. Each transaction can only pay for one API call.');
}
```

So even if you put 4 USDC transfers into ONE Sui PTB (which Sui supports natively — atomic, one signature), the FIRST gateway service to verify it consumes the digest, and the next 3 gateways all reject with "already used."

**The fix.** Change the dedup key from `digest` to `digest:claim_id`, and add a Redis counter that tracks "how much of this transfer has been claimed so far." Each gateway verifies its own slice without locking out the others. Refuses the claim if the running total would exceed what's actually on-chain. ~50 lines in `@suimpp/mpp@0.7.0`, ~30 lines in the gateway. Backwards compatible — single-call mode keeps working without changes.

**Result.** 4 services → 1 PTB → 1 user tap → 4 parallel receipts. ~3 seconds end to end instead of ~12. Same security model.

### B.3 — The "show, don't tell" version (whiteboard diagram)

Use this if someone says *"wait, what's actually different?"*

**TODAY (sequential):**
```
[user tap 1] → sign tx → 3s → result 1
[user tap 2] → sign tx → 3s → result 2
[user tap 3] → sign tx → 3s → result 3
[user tap 4] → sign tx → 3s → result 4
                                  ─────
                                  ~12s, 4 taps
```

**WITH THE FIX (atomic batch):**
```
                          ┌→ result 1
[user tap 1] → sign tx → 3s ─→ result 2  (parallel verifies)
                          ├→ result 3
                          └→ result 4
                                  ─────
                                  ~3s, 1 tap
```

Same Sui chain. Same gas-sponsored UX. Same per-service prices. Just one signature covering the whole batch.

### B.4 — The "why this is interesting" version (Mysten / co-build pitch)

Three reasons this is uniquely a Sui story, in order of how much they unlock:

1. **PTB atomicity for free.** A Sui PTB is one transaction with N programmable steps. `splitCoins` + N × `transferObjects` is one tx, one digest, one signature. On Ethereum, the equivalent is multicall contracts or EIP-4337 batched user-ops — both add a contract layer with quirky gas estimation and revert semantics. Sui makes this a single line of TypeScript.

2. **Enoki-sponsored gas has zero per-leg overhead.** A 4-transfer PTB sponsored by Enoki costs the user $0 in gas. EVM batched ops still have per-op gas overhead that grows with N. The user feels the difference at N=4, definitely at N=10.

3. **Hot Potato (the long-term unlock).** Phase 3 of the spec introduces `t2000::payment_promise` — a Sui Move resource that MUST be claimed by each gateway or refunded automatically by an on-chain timeout. If 3 of 4 services succeed but Suno's API is down, the unclaimed slice refunds itself. There is no clean EVM equivalent — you'd write a multi-claim escrow contract, but the refund path requires a user-initiated tx, not an automatic on-chain timeout. **This is the "uniquely Sui" pitch.**

Phase 1 (the 80 LoC patch) ships without the Hot Potato (best-effort + audric-side auto-refund cron, see D3a), but the architecture is designed so Phase 3 slots in cleanly later. Phase 1 is the win-fast play; Phase 3 is the joint-build candidate with the Mysten team.

### B.5 — Founder copy-paste templates

If you want to drop these directly into a chat:

**To the Mysten engineer who started this:**
> Did the deep-dive. Surprisingly small fix. Today's `@suimpp/mpp` verifier locks "one digest = one API call" — we change the dedup key to `digest:claim_id` + add a Redis counter for claim accounting. ~80 LoC across `@suimpp/mpp` + the gateway. Phase 1 (single-recipient, t2000-internal) ships in a week. Phase 2 (mppx protocol upgrade with `Challenge.batch`) and Phase 3 (`PaymentPromise` Move primitive for refund-on-failure) are the natural follow-ups — Phase 3 is the joint-build candidate, uniquely Sui-native (Hot Potato + PTB + sponsored gas). I have a full spec drafted; happy to share when you're ready to scope.

**To a non-technical partner / investor:**
> Audric runs on Sui because Sui can do something Ethereum can't: batch four micropayments to four different services into one transaction with one user signature. Today our agent makes users tap four times to dispatch four API calls. Next week's release collapses that to one tap. The same agent that takes 12 seconds and 4 confirmations today will do the same job in 3 seconds and one confirmation. This is the foundation for "buy everything for my house party" working as one signed receipt instead of four trips through checkout.

**To explain "why this isn't trivial elsewhere":**
> The reason no other MPP-style network does this cleanly is that Sui's transactions can hold a programmable list of operations — including multiple payments to multiple recipients — and settle atomically. EVM chains need a smart contract acting as a middleman; Solana needs lookup tables. Sui makes "four payments to four people in one signature" a one-liner. That, plus Enoki sponsoring the gas, is why batching micropayments works on Sui without the user ever touching gas tokens.

---

**End SPEC 16 v0.2 LOCKED.**
