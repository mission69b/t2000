# SPEC 26 — MPP Settle-on-Success (Atomic Charge-or-Refund Refactor)

> **Status:** v1.0 — **SHIPPED 2026-05-13 ~20:40 AEST** — all 10 phases complete (P1–P10), 68/68 `chargeProxy` routes on settle path, end-to-end LLM signal chain wired across t2000 + audric, D-9 telemetry emitting on Vercel structured logs.
>
> **Phase ship summary:**
> - **P1–P5 (initial)** shipped 2026-05-13 morning–afternoon: chargeProxy settle-on-success path, fingerprint+caches (in-memory + Upstash), openai-images partial-success classifier, openai/v1/images/generations route flip + live smoke, engine D-8 prompt + audric services/complete classification.
> - **P5 review remediation 2026-05-13 ~20:30 AEST:** found 3 bugs (Bug A: SPEC 26 metadata loss in audric `useAgent` → `executeToolAction` chain meant the LLM only saw `paymentConfirmed: false` but lost `settleVerdict` / `settleReason`; Bug B: cache I/O wasn't failure-tolerant; Bug C: confusing self-correcting comment). All 3 fixed. New `SettleNoDeliveryError` typed error class wires the SPEC 26 metadata end-to-end so the LLM's D-8 prompt can actually use the `settleReason` field for transient-vs-correctable retry decisions.
> - **P6 anthropic** shipped 2026-05-13 ~20:31 AEST: route flipped, default classifier (no partial-success shape exists at the HTTP layer). 4 unit tests pin the resulting behavior.
> - **P7 remaining openai routes** shipped 2026-05-13 ~20:32 AEST: chat/completions, audio/transcriptions, audio/speech, embeddings — all use the default classifier (none ship partial-success shapes; non-streaming chat is all-or-nothing).
> - **P8 long-tail bulk migration** shipped 2026-05-13 ~20:34 AEST: 62 routes migrated via one-off `scripts/spec26-bulk-flip.mjs` (idempotent, 0 unmatched). 68/68 `chargeProxy` routes are on settle-on-success. The 21 `chargeCustom` routes (commerce APIs with dynamic pricing — Lob, Printful) remain on the legacy path; out of scope for SPEC 26 v1 since the option doesn't exist on `chargeCustom` yet (follow-up).
> - **P9 Vercel-native telemetry** shipped 2026-05-13 ~20:37 AEST: new `apps/gateway/lib/settle-metrics.ts` helper (~75 LoC) + 4 emission sites in `chargeProxySettleOnSuccess` (idempotency hit, classify deliverable / refundable / mixed, charge_failed). All 5 D-9 measurement points covered. Founder queries via Vercel Logs UI; filter recipes documented in the helper's docstring.
> - **P10 finalization** 2026-05-13 ~20:40 AEST: this status section + handoff refresh + spec mark-complete.
>
> **Final test counts:**
> - t2000 engine: 1166 passing (+1 from D-8 enum drift-pin)
> - t2000 gateway: 152 passing (+21 from cache failure-tolerance, anthropic shapes, P9 metric emission)
> - audric web: 2855 passing (+3 from SettleNoDeliveryError end-to-end coverage)
>
> **Lock summary (so future sessions don't re-litigate):**
>
> **Lock summary (so the next session doesn't re-litigate):**
> - **D-1** locked: 60s upstream-response cache TTL (Upstash Redis).
> - **D-2** locked: `sha256(method + path + sortedJsonBody + apiKeyId)` fingerprint composition.
> - **D-3** locked: $5/request hard limit on absorbed vendor cost when charge fails post-probe + Datadog `mpp.settle.absorbed_cost_usd` weekly gauge. Add weekly cap as a follow-up only if gauge trends bad.
> - **D-4** locked: per-route opt-in `settleOnSuccess: true` flag, rollout in the order listed in § 3 D-4 (openai/images first; ~30 long-tail routes batched in P8).
> - **D-5** locked: `transformUpstreamResponse` runs in probe phase. If it throws → classify as `refundable` with reason `'transform-failed'`. Already wrapped in try/catch (commit `1824147c`).
> - **D-6** locked: openai/v1/images/generations classifier returns `'mixed'` with `chargedFraction = successCount / total` for partial success (e.g. n=4 with 3 successes → charges $0.15 of $0.20).
> - **D-7** locked: async-fulfillment failures (Lob 3-day-later print fail) explicitly OUT OF SCOPE for SPEC 26. Probe still catches synchronous failures for those routes. Real fix needs `refund(digest)` MPP contract primitive (deferred until post-Audric-Store-launch).
> - **D-8** locked: engine prompt extension in P5 — *"If pay_api result has paymentConfirmed: false AND status is 402, the upstream service failed but you were NOT charged. You may retry with corrected parameters. Each retry-after-no-charge is free."*
> - **D-9** locked: 5 measurement points — emitted as Vercel-native structured `console.log` (REVISED 2026-05-13 ~20:15 AEST: t2000 uses Vercel, not Datadog). `mpp.settle.classify.{deliverable, refundable, mixed}` counters, `mpp.settle.charge_failed_after_probe` counter, `mpp.settle.absorbed_cost_usd` (summed via log filter), `mpp.settle.idempotency_hit` counter, `mpp.settle.probe_to_charge_latency_ms` (durationMs field). Founder queries via Vercel Logs UI; log drain to external sink (Axiom/Logtail/etc.) is a one-config-change follow-up if aggregation becomes necessary. See full §3 D-9 for log format + filter recipes.
> - **O-2** locked: keep P8 (~30 long-tail routes) — don't compress effort by skipping. Without it, low-traffic routes stay on broken charge-then-fail forever.
> - **O-4** locked: defer `refund(digest)` MPP contract primitive — promote to a sibling spec only when async-fulfillment volume justifies (post-Audric-Store-launch when Lob/printful traffic > 10/day).
> - **O-5** locked: $5/req absorb-cost trade-off accepted — today's max route is $1 (Lob postcard); 5x headroom covers any medium-cost service we'd add this year without forcing per-route conversations for sub-$5 routes.
>
> **Local-only, gitignored** — same convention as SPEC 23 series, SPEC 24, SPEC 25, AUDRIC_HARNESS_*_SPEC, audric-roadmap, audric-build-tracker, HANDOFF_NEXT_AGENT.
>
> **Predecessors:**
> - Engine v1.29.4 (`extractVendorErrorMessage` + gateway transform try/catch — fixes diagnosability of paid failures).
> - Engine v1.29.5 (`VALID_SIZES` allow-list + engine prompt size note — closes the 256x256 charge-then-fail window).
> - Both shipped 2026-05-13. They surface and prevent failure modes; SPEC 26 ELIMINATES the failure mode itself.
>
> **Trigger:** Two `bug_mpp_no_refund_on_failure` incidents within 24h on the same MPP route (openai/v1/images/generations):
> - 2026-05-13 ~14:00 AEST — green frog probe. OpenAI returned object-shaped error after charge → user paid $0.05, no image, `[object Object]` rendering bug surfaced.
> - 2026-05-13 ~14:33 AEST — green frog retry probe. OpenAI rejected `size: '256x256'` post-charge → user paid $0.05, no image; LLM auto-dispatched second attempt → another $0.05 → total $0.10 for one user-perceived request.
>
> **Founder framing 2026-05-13 ~14:40 AEST:** *"we need to build a reliable product with zero failures, and especially if the user pays for these images and they fail they would not want to use the app, do you think we should not use mpp for image gen and have our own api key hosted, especially with the new audric store coming online soon? whats your honest thoughts here or can we actually solve this as MPP is the actual future."*
>
> **Founder decision 2026-05-13 ~14:43 AEST:** *"Lets try and fix MPP at the root as this is a killer feature for sui and audric and mpp on sui."*
>
> SPEC 26 is the root-cause fix.

---

## 0. The 1-paragraph summary

Today, `chargeProxy` charges Sui USDC BEFORE calling the upstream vendor. Any post-charge upstream failure (rate limit, content policy, bad param, transient outage) leaves the user out the money with no automatic refund mechanism. SPEC 26 inverts the order: **fetch upstream FIRST, capture the response, then charge only on `res.ok`**. If charge fails (chain congestion, user disconnect, replay attack), the captured response is discarded. If charge succeeds, the captured response is returned. Same MPP semantics on the success path; **zero paid failures on the failure path**. Latency cost: +200–500ms per call (one upstream RTT before charge). Idempotency, caching, fingerprinting all designed in. Per-route opt-in flag so the rollout is incremental and reversible.

---

## 1. Why this spec exists

### 1.1 The structural gap

`apps/gateway/lib/gateway.ts` `chargeProxy` (lines 92–157) does this:

```
charge(amount) → handler() {
  fetch(upstream)
  return Response(upstream.body, status: upstream.status)
}
```

The `mppx.charge` wrapper completes the on-chain Sui USDC transfer to treasury BEFORE invoking the handler. So the timeline is:

1. Client request arrives at `mpp.t2000.ai/openai/v1/images/generations`
2. `mppx.charge` builds + signs + executes the Sui PTB → **$0.05 settled on-chain to treasury**
3. Gateway fetches OpenAI
4. **OpenAI returns 400 ("Invalid size") / 429 (rate limit) / 500 (vendor outage) / safety-system rejection**
5. Gateway forwards the error to client → user sees "$0.05 charged · ⚠ Error · Service request failed"
6. **No refund path.** The on-chain leg is irreversible.

### 1.2 Why pre-charge validation is not enough

We've shipped two pre-charge gates already (`VALID_MODELS`, `VALID_SIZES` for the OpenAI image route). They close known-bad-input windows. They CANNOT close:

- **Vendor rate limits** — knowable only at request time
- **Content-policy rejections** — knowable only post-prompt-eval
- **Vendor outages / transient 5xx** — knowable only at request time
- **Quota exhaustion on our key** — knowable only at request time
- **Any vendor error that depends on input semantics** (image safety, copyright, jailbreak detection)

**Defense-in-depth is necessary but insufficient.** We will always have a long tail of post-charge failures unless we change the order of operations.

### 1.3 Why "use our own OpenAI key, bypass MPP" is wrong

Tempting because we already hold the OpenAI key. But:

1. The decision compounds — once we bypass MPP for OpenAI, we'll bypass it for every vendor that errors. Soon MPP is just a brand.
2. It hides the architectural debt — settle-on-success is a 1-week refactor; bypassing one vendor only fixes one vendor and adds a NEW code path forever.
3. **Audric Store depends on MPP being trustworthy.** Music gen ($0.50), video gen ($5), ebook gen ($1) are all MPP routes at higher dollar amounts. Today's image-gen failure rate at $5 = "$5 paid for nothing, contact support" — fatal for a marketplace.
4. The protocol thesis (Sui-native MPP for AI services, third-party creators MPP-enable their listings) requires MPP to handle vendor failures gracefully. If MPP can't, MPP isn't a protocol.

The protocol gap is a 1-week refactor. We close it now. Bypassing MPP would cost more long-term than fixing it.

### 1.4 What "the right MPP" looks like

Same model Stripe used: **Auth → Capture-on-success.** Stripe could have charged cards immediately on `POST /charges`; instead they introduced PaymentIntents (auth → confirm → capture) so that a card auth doesn't move money until the merchant explicitly captures after delivery. That semantic — *intent-to-charge separated from settlement-of-charge* — is what SPEC 26 brings to MPP.

For MPP specifically:
- **Probe** — fetch upstream, capture full response in a short-lived cache.
- **Verify** — if upstream returned `res.ok` AND the response is structurally valid (deliverable), proceed.
- **Charge** — settle the Sui USDC leg.
- **Deliver** — return the cached response.

Failures at any phase before charge → no on-chain transfer → user keeps their money.

---

## 2. The architectural change — concrete

### 2.1 New `chargeProxy` signature (no API break)

Add a `settleOnSuccess: boolean` option (default `false` for backward-compat). When `true`, the order of operations inverts:

```typescript
interface ProxyOptions {
  // ... existing fields ...

  /**
   * When true, fetch upstream FIRST and charge only after `res.ok`.
   * Eliminates the `bug_mpp_no_refund_on_failure` window for synchronous
   * vendor failures. Adds ~200–500ms latency (one upstream RTT before
   * charge). See SPEC 26 for full rationale + edge cases.
   *
   * Default: false (legacy charge-first behavior). Set true per-route
   * after vendor-specific verification.
   */
  settleOnSuccess?: boolean;

  /**
   * Required when settleOnSuccess: true. Classifies an upstream response
   * into one of three buckets so the charge gate can decide:
   *   - 'deliverable'   → upstream succeeded, charge + return body
   *   - 'refundable'    → upstream failed, NO charge, return error to user
   *   - 'mixed'         → partial success (e.g. n=4 image gen, 3 succeeded
   *                       1 rate-limited). Charge for delivered fraction
   *                       only. Return mixed body.
   *
   * Default classifier (when omitted): `res.ok ? 'deliverable' : 'refundable'`.
   * Per-route classifiers handle vendor-specific shapes (e.g. OpenAI's
   * `data[].error` partial-success shape).
   */
  classifyResponse?: (res: Response, body: unknown) => Promise<
    | { kind: 'deliverable'; price?: string }
    | { kind: 'refundable'; reason: string }
    | { kind: 'mixed'; chargedFraction: number; reason: string }
  >;
}
```

### 2.2 The new flow

```
chargeProxy(req, settleOnSuccess: true) {
  // Phase 1 — pre-charge validation (existing, unchanged)
  if (validate(body)) return 400

  // Phase 2 — PROBE upstream
  const fingerprint = sha256(method + url + body + auth-key-id)
  if (cache.has(fingerprint)) {
    // Idempotency: same request within 60s → return cached result + skip upstream
    return cache.get(fingerprint)
  }

  const upstreamRes = await fetch(upstream, ...)
  const upstreamBody = await upstreamRes.<consume>()
  const transformedRes = await transformUpstreamResponse(upstreamRes, upstreamBody)

  // Phase 3 — CLASSIFY
  const verdict = await classifyResponse(transformedRes, transformedBody)
  if (verdict.kind === 'refundable') {
    return Response(transformedBody, status: transformedRes.status)
    // No charge. User keeps the money.
  }

  // Phase 4 — CHARGE
  const chargeAmount = verdict.kind === 'mixed'
    ? amount * verdict.chargedFraction
    : amount
  try {
    const chargeReceipt = await mppx.charge({ amount: chargeAmount })
  } catch (chargeErr) {
    // On-chain failure (chain congestion, user disconnect, replay).
    // Discard upstream body. User keeps the money. Vendor cost absorbed by us.
    return Response.json({ error: 'Charge failed', detail: chargeErr.message }, { status: 402 })
  }

  // Phase 5 — DELIVER
  cache.set(fingerprint, { body: transformedBody, status: transformedRes.status }, ttl: 60s)
  return Response(transformedBody, status: transformedRes.status, headers: { ...chargeReceipt.headers })
}
```

### 2.3 What changes for the client

**Nothing on the success path.** Same response shape, same status codes, same headers, same Payment-Receipt header.

**On the failure path,** the client now sees:
- Same error body it would have seen before
- `HTTP 402` (Payment Required) instead of HTTP 4xx/5xx — explicit signal "no charge happened"
- No `Payment-Receipt` header (no on-chain digest)

Audric's `services/complete` route already handles 402 correctly (line 217: `if (!serviceResponse.ok && serviceResponse.status !== 402) {...}` — 402 falls through to a different path). We add an explicit branch for "402 means no-charge-can-retry" so the LLM gets a clear signal.

---

## 3. D-questions — founder must lock before P0

These are the architectural decisions that bind the implementation. Each has a default recommendation; founder confirms or overrides.

### D-1 — How long does the upstream-response cache live?

**Default: 60 seconds.** Long enough for the charge round-trip (typical: 2–5s on Sui), short enough that idempotency-window replay attacks are bounded. Stored in Upstash Redis (existing dependency).

Alternative: 5 minutes (matches Sui finality + retry window). Trade-off: more memory, longer replay window.

**Recommendation: 60s.**

### D-2 — Idempotency key fingerprint composition

**Default:** `sha256(method + path + sortedJsonBody + apiKeyId)`.

- `apiKeyId` so multi-tenant gateway deployments don't collide
- `sortedJsonBody` so semantically-equal requests (different key order) hash identically
- `path` not full URL so query params don't poison the cache

**Recommendation: lock the default.**

### D-3 — Vendor cost absorption budget when charge fails

When upstream succeeds but charge fails (chain congestion, user disconnect after probe), WE absorb the upstream vendor cost. For OpenAI image gen at $0.05, this is small. For Lob postcard at $1, it's larger.

**Default: hard limit at $5 absorbed cost per request.** Routes pricier than $5 (none today) require a separate D-question per route at add-time.

Alternative: weekly absorbed-cost budget cap ($50/week) with circuit breaker.

**Recommendation: $5 hard limit per request + Datadog metric on absorbed-cost-per-week. Add weekly cap as a follow-up if metric trends bad.**

### D-4 — Migration strategy: per-route flag vs. global flip

**Default: per-route opt-in flag.** Each route adds `settleOnSuccess: true` after verification. Rollout order:

1. **openai/v1/images/generations** (highest incident rate, highest user impact)
2. **openai/v1/audio/speech** (Audric voice)
3. **openai/v1/audio/transcriptions** (Audric voice)
4. **openai/v1/chat/completions** (rare failure mode, lower priority)
5. **openai/v1/embeddings** (very rare failure, lowest priority)
6. **elevenlabs/v1/text-to-speech** (post-charge 404 known incident)
7. **lob/v1/postcards** (async fulfillment — see D-7)
8. **resend/v1/emails** (known `bug_gateway_resend_from_field`)
9. **All remaining ~30 routes** — one batch after first 8 are stable

**Recommendation: lock per-route opt-in. Tracks risk per vendor, allows rapid rollback per route.**

### D-5 — How to handle the `transformUpstreamResponse` interaction

Today the b64→Blob normalizer (`apps/gateway/lib/openai-image-blob-normalize.ts`) runs INSIDE the existing handler — so under settle-on-success, it would run BEFORE charge. That's actually correct: the Blob upload IS part of "delivering the response," and if Blob upload fails (Phase 2 transform throws), we want to NOT charge.

**Default: transform runs in Phase 2 (probe). If transform throws, classify as 'refundable' with reason 'transform-failed'.** Already wrapped in try/catch from commit `1824147c` so the throw doesn't bubble.

**Recommendation: lock the default. The transform IS part of delivery; treating it as a deliverability check is correct.**

### D-6 — Classification of OpenAI partial-success responses

OpenAI image gen with `n: 4` can return `{ data: [{ url }, { url }, { url }, { error: { code: 'rate_limit' } }] }` — 3 deliverable images + 1 failed. Under today's flow user pays $0.20 ($0.05 × 4) for 3 images.

**Default `classifyResponse` for openai/v1/images/generations:**
```typescript
classifyResponse: async (res, body) => {
  if (!res.ok) return { kind: 'refundable', reason: `OpenAI ${res.status}` }
  const data = (body as { data?: unknown[] })?.data
  if (!Array.isArray(data)) return { kind: 'deliverable' }
  const successCount = data.filter(d => d && typeof d === 'object' && 'url' in d).length
  if (successCount === 0) return { kind: 'refundable', reason: 'all-images-failed' }
  if (successCount === data.length) return { kind: 'deliverable' }
  return {
    kind: 'mixed',
    chargedFraction: successCount / data.length,
    reason: `${successCount}/${data.length} images delivered`,
  }
}
```

This means a `n: 4` request with 3 successes charges $0.15 (3/4 × $0.20). Audric's receipt UI shows "3 of 4 delivered · $0.15 charged."

**Recommendation: lock this for openai/v1/images/generations. Other routes use the default `res.ok ? 'deliverable' : 'refundable'` until per-route partial-success shapes are characterized.**

### D-7 — Async fulfillment vendors (Lob postcards / printful orders)

Lob's `POST /v1/postcards` returns 200 immediately upon ACCEPTANCE of the print job. The actual print can fail 3 days later (address invalid, printer outage, content rejection). Settle-on-success at probe time can't catch async failures.

**Default: SPEC 26 does NOT solve async-fulfillment failures.** Those need the `refund(digest)` MPP contract primitive (multi-week scope, deferred).

For Lob/Printful in SPEC 26: still ship `settleOnSuccess: true` because the probe DOES catch synchronous failures (validation errors, missing API key, malformed body). Async failures remain a known gap until `refund(digest)` ships.

**Recommendation: lock the deferred decision. Add a roadmap item for `refund(digest)` post-Audric-Store-launch.**

### D-8 — Engine prompt update — does the LLM need to know?

Today engine prompt says "If pay_api result has `paymentConfirmed: true`, NEVER retry." That stays. Under SPEC 26, we ALSO get a new "no charge happened, safe to retry" signal:

```
If pay_api result has `paymentConfirmed: false` AND status is 402,
the upstream service failed but you were NOT charged. You may retry
with corrected parameters. Each retry-after-no-charge is free.
```

This explicitly enables the LLM's "auto-retry with corrected params" behavior — but ONLY when no charge happened.

**Recommendation: add this paragraph to `packages/engine/src/tools/pay.ts` description in P5.**

### D-9 — Telemetry surface

**REVISED 2026-05-13 ~20:15 AEST — t2000 uses Vercel, not Datadog.** Same 5 measurement points, but emitted as structured `console.log` lines that Vercel's function-logs pipeline captures automatically. Founder queries via Vercel Logs UI; if aggregation becomes necessary later, a Vercel log drain to any external sink (Axiom, Logtail, Datadog if reactivated) is one config change away — no code change required.

Each event emitted on a single line as JSON-prefixed structured log so Vercel's filter UI + log drains can parse it:

```
[mpp.settle] event=classify       route=openai/v1/images/generations verdict=refundable durationMs=1287
[mpp.settle] event=classify       route=openai/v1/images/generations verdict=deliverable durationMs=14203 chargeAmount=0.05
[mpp.settle] event=classify       route=openai/v1/images/generations verdict=mixed       durationMs=18901 chargeAmount=0.0375 chargedFraction=0.75
[mpp.settle] event=charge_failed  route=openai/v1/images/generations reason=mppx-receipt-invalid absorbedCostUsd=0.05
[mpp.settle] event=idempotency_hit route=openai/v1/images/generations cacheKey=ab12cd34
```

The 5 D-9 measurements map 1:1:
- `mpp.settle.classify.{deliverable,refundable,mixed}` → `event=classify verdict=...`
- `mpp.settle.charge_failed_after_probe` → `event=charge_failed`
- `mpp.settle.absorbed_cost_usd` → `event=charge_failed absorbedCostUsd=...` (sum across week via Vercel filter)
- `mpp.settle.idempotency_hit` → `event=idempotency_hit`
- `mpp.settle.probe_to_charge_latency_ms` → `durationMs=...` field on every classify event

**Vercel filter recipes** (founder uses these directly):
- All settle events: filter `[mpp.settle]`
- Refundable count today: filter `[mpp.settle] event=classify verdict=refundable` + time range
- Weekly absorbed cost: filter `[mpp.settle] event=charge_failed` + time range, sum `absorbedCostUsd` field
- Slow probes: filter `[mpp.settle] event=classify` + `durationMs>5000`

**Implementation:** single helper `apps/gateway/lib/settle-metrics.ts` exports `logSettleEvent(event, fields)`. `chargeProxySettleOnSuccess` calls it at exactly 4 sites (after classify, after charge_failed, on cache hit, on absorbed-cost). Dependency-free — `console.log` is already the Vercel-native primitive.

**Recommendation: lock the 5 measurement points; emit via structured logs (Vercel-native). Add a log drain only if/when external aggregation becomes necessary.**

---

## 4. Phase plan

| Phase | Scope | Effort | Verify |
|---|---|---|---|
| P0 | Founder D-question lock | n/a | All 9 D-questions answered |
| P1 | `chargeProxy` settle-on-success implementation behind flag (default off) | 1d | 100% existing tests pass with flag off; new probe-charge-classify tests cover flag on |
| P2 | Idempotency cache (Upstash Redis) — fingerprint + 60s TTL | ½d | Unit tests for fingerprint determinism; integration test for replay |
| P3 | Per-route classifier framework + default classifier + openai-images-classifier | ½d | Unit tests for all 3 verdict paths (deliverable / refundable / mixed) |
| P4 | Migrate openai/v1/images/generations to `settleOnSuccess: true` | ½d | Live probe: trigger 256x256 failure → no charge. Trigger 1024x1024 success → charge fires. Trigger n=4 partial → fractional charge. |
| P5 | Engine prompt update (D-8) + audric `services/complete` 402 explicit branch | ½d | Engine tests; audric services/complete unit tests |
| P6 | Migrate openai audio + chat + embeddings (4 routes) | ½d | Per-route smoke probe |
| P7 | Migrate elevenlabs, lob, resend (3 routes) | ½d | Per-route smoke probe; Lob async-failure mode acknowledged |
| P8 | Migrate remaining ~30 routes (one batch) | 1d | Smoke probe set on representative routes |
| P9 | Datadog dashboard + alert on `absorbed_cost_per_week > $50` | ½d | Dashboard renders all 5 metrics; alert threshold tested |
| P10 | HANDOFF + audric-build-tracker update + lessons | ½h | Spec status flipped to ✅ COMPLETE |

**Total effort: ~5–6 working days.** Conservative estimate.

---

## 5. Edge cases — explicit treatment

### 5.1 Client disconnect mid-charge

Probe succeeds → upstream cost incurred. Client TCP disconnects before charge completes. We absorb the upstream cost. Cache entry expires after 60s.

**Mitigation:** Datadog metric tracks absorbed-cost-per-week. If trends bad, add weekly cap circuit breaker (D-3 alternative).

### 5.2 Replay attack (same request fingerprint within 60s)

Phase 2 cache hits → returns cached response + same `Payment-Receipt` header. **No double charge.** Idempotent.

### 5.3 Charge succeeds, return-trip TCP fails

Charge fires on-chain. Response can't reach client. Client retries same request → cache hit → returns same digest. Idempotent. Same as 5.2.

### 5.4 Upstream returns 200 + invalid body

Phase 2 transform throws (try/catch from commit `1824147c`) → classified as `refundable` with reason 'transform-failed'. No charge. User keeps money. We absorb the upstream cost.

### 5.5 Vendor doesn't allow free probes (rate-limit aware)

Most vendors don't. Each probe fires an actual upstream call → we pay the vendor cost for failed-probe responses. This is the **structural cost** of settle-on-success. Acceptable for sub-dollar services; would need re-evaluation for $5+ services.

### 5.6 Sui chain congestion / charge takes >30s

Probe response sits in cache. If charge takes >60s (cache TTL), the next request with same fingerprint will re-probe (wasted upstream cost). For typical 2–5s Sui finality this is rare.

**Mitigation:** Increase cache TTL to 5min if Sui p99 latency trends >30s.

### 5.7 Multi-region gateway deployment

Cache must be shared (Upstash Redis is). Already shared today for `getDigestStore`.

### 5.8 The "n: 4 partial success" charge math

Per D-6: charge `chargedFraction × amount`. Sui USDC supports 6 decimals → $0.05 × 0.75 = $0.0375 = `37500` raw units. Cleanly divisible. No precision loss.

---

## 6. Testing strategy

### 6.1 Unit tests (P1, P3)

- `chargeProxy.settleOnSuccess.test.ts` — probe-classify-charge happy path
- `chargeProxy.settleOnSuccess.refundable.test.ts` — upstream 4xx → no charge
- `chargeProxy.settleOnSuccess.mixed.test.ts` — n=4 partial → fractional charge
- `chargeProxy.settleOnSuccess.transform-throw.test.ts` — transform throws → refundable
- `chargeProxy.settleOnSuccess.idempotency.test.ts` — same fingerprint within TTL → cache hit
- `chargeProxy.settleOnSuccess.charge-failure.test.ts` — charge throws → no double-charge, no delivery

### 6.2 Integration tests (P4)

- `openai-images-generations.integration.test.ts` — actual gateway → mock OpenAI
  - Success path: probe 200 → charge → deliver
  - Failure path: probe 400 → no charge → error returned
  - Partial path: probe 200 with mixed body → fractional charge

### 6.3 Live smoke (P4)

Real probes against `mpp.t2000.ai/openai/v1/images/generations`:
- Probe 1: `size: '256x256'` → 400, no charge (verify via on-chain query: no Sui USDC delta)
- Probe 2: `size: '1024x1024'` → 200, $0.05 charge (verify on-chain digest)
- Probe 3: `n: 4, size: '1024x1024'` (force one failure via rate-limit-trigger) → fractional charge

### 6.4 Regression bar

ALL existing gateway tests must pass with `settleOnSuccess: false` (default). The flag is the ONLY behavioral change.

---

## 7. Rollback plan

Each route migration is independent. Rollback = flip `settleOnSuccess: false` on the affected route + redeploy gateway. ~5min recovery.

Worst case (full SPEC 26 rollback): single PR reverts the flag flips. The settle-on-success code stays in `chargeProxy` but is unused.

---

## 8. Success metrics — how we know SPEC 26 worked

Measured 30 days post-P10:

| Metric | Pre-SPEC-26 baseline (today) | Post-SPEC-26 target |
|---|---|---|
| `bug_mpp_no_refund_on_failure` incidents | 2 in 24h on openai/images alone | 0 across all routes |
| Mean latency on synchronous routes | ~800ms (charge then upstream) | ~1100ms (probe then charge) — acceptable |
| Absorbed cost per week | $0 (charge always succeeds) | <$10/week (well under D-3 budget) |
| User-reported "$X charged for nothing" complaints | unknown — count from this point | 0 |
| LLM auto-retry-with-correction rate | 0 (every retry costs) | >50% of failed calls (free retries enabled) |

---

## 9. Out of scope

- **`refund(digest)` MPP contract primitive** — required for async-fulfillment vendors (Lob postcard 3-day-later print failure). Multi-week scope. Deferred until Audric Store stable.
- **Auto-retry policy at the engine level** — should the LLM auto-retry on a 402-no-charge response? D-8 enables it but doesn't mandate. Engineering decision can be re-litigated as a follow-up if telemetry shows over-aggressive retries.
- **MPP protocol-level changes** — SPEC 26 is gateway-implementation only. The MPP protocol spec at `suimpp.dev` doesn't need changes. The settle-on-success pattern is a valid implementation strategy under the existing protocol.
- **Client-side caching** — audric/web does NOT cache MPP responses today. Adding client-side caching is a different SPEC.

---

## 10. Open questions for founder review

1. Are the 9 D-question recommendations acceptable as defaults?
2. Is the 5–6 day effort estimate acceptable, or do you want to compress (skip P8 batch migration to a follow-up)?
3. Is the per-route opt-in rollout acceptable, or would you prefer a global flip with a kill-switch?
4. Do you want the `refund(digest)` contract primitive promoted to a sibling spec NOW (parallel work), or defer until Audric Store ships?
5. Does the "WE absorb upstream cost on charge failure" trade-off feel right at $5/request hard limit?

---

## 11. Predecessor commits (so the history is straightforward to read)

| Commit | Repo | What it shipped |
|---|---|---|
| `dad14712` | t2000 | Engine prompt: dall-e-3 deprecation + abort-on-paid-failure rule. Gateway pre-charge `VALID_MODELS` allow-list. (First defense-in-depth pass.) |
| `8479db02` | t2000 | Gateway b64→Blob normalizer for gpt-image-* responses. |
| `1824147c` | t2000 | Gateway try/catch around `transformUpstreamResponse` (defensive backstop for SPEC 26 P4 transform-throw classification). |
| `b4f03a79` | t2000 | Gateway pre-charge `VALID_SIZES` allow-list (closes 256x256 paid-failure window). |
| `240a9a2b` | t2000 | Engine prompt: gpt-image-* size allow-list + "small image" override. |
| `94110dc` | audric | `extractVendorErrorMessage` walker (closes `[object Object]` rendering bug — not strictly a SPEC 26 dep, but a sibling fix that surfaces what SPEC 26 prevents). |
| `89af44d` | audric | `extractVendorErrorMessage` moved to sibling file (Lesson 1.0 fix). |

SPEC 26 picks up where this trail ends. Defense-in-depth gates close known windows; SPEC 26 closes the structural gap that creates the windows.

---

## 12. First action when SPEC 26 starts

After founder D-question lock:

1. Spec doc rev-bumped to v0.2 with all D-questions resolved inline.
2. P1 starts: implement `settleOnSuccess: true` code path in `apps/gateway/lib/gateway.ts` behind the flag. ~1 day.
3. Smoke test from CLI before any commit:
   ```bash
   curl -X POST https://mpp.t2000.ai/openai/v1/images/generations \
     -H 'content-type: application/json' \
     -d '{"prompt":"test","model":"gpt-image-1","size":"256x256"}'
   # Expected (settleOnSuccess: true): HTTP 402, no charge, no Payment-Receipt header
   # Today (settleOnSuccess: false): HTTP 4xx, $0.05 charge, Payment-Receipt header
   ```

The first observable outcome of SPEC 26 working: the 256x256 probe returns HTTP 402 with no Sui USDC delta on the test wallet.

---

## Post-ship hotfix log

### v1.0.1 — Credential-presence guard ATTEMPTED + REVERTED (2026-05-14)

**Status: REVERTED. Do NOT re-apply without solving the on-chain pre-settle gap first.** Commit `06a9b634` shipped the guard at ~06:11 AEST; reverted in `bc15cefb` ~06:15 AEST after immediate post-ship review caught the regression.

**Trigger.** The 2026-05-13 ~21:30 AEST live image-gen smoke produced a false alarm: founder saw three `[mpp.settle] event=classify ... verdict=deliverable chargeAmount=0.05` log entries in Vercel and feared $0.15 had been charged. Morning verification confirmed only **$0.05** actually moved on-chain (one charge), but the investigation surfaced what looked like two bugs.

**The "fix" that turned out to be wrong.** Adding a Phase 0 credential-presence guard at the top of `chargeProxySettleOnSuccess` so prepare-phase calls (no `Authorization: Payment ...` header) short-circuit through `mppx.charge({ amount })(noOpHandler)(req)` without probing upstream. Local rationale was: probe result is discarded when mppx returns 402, so why probe at all? Save vendor cost + eliminate the misleading log entries.

**The regression the guard introduced.** In audric's flow, the on-chain USDC moves DURING `/api/services/complete` (Enoki sponsors + executes the user-signed tx) BEFORE the gateway is called. The prepare-time probe is what catches bad params (e.g. `quality=standard`) and returns `x-settle-verdict: refundable` so audric's prepare can return `402 settle-no-delivery` to the client BEFORE building the payment tx. With the guard removed:
- pre-fix bad-params: prepare returns 402 → no tx built → no on-chain settlement → user safe (gateway absorbs $0.05 vendor cost).
- post-fix bad-params: prepare returns mppx Challenge → tx built + signed + executed → **on-chain $0.05 orphaned in treasury** + gateway absorbs $0.05 vendor cost. Total $0.10 lost split across user and treasury, where pre-fix only the $0.05 vendor cost was lost (gateway-side).

So the prepare-time probe **isn't wasted** — it's the safety gate that keeps SPEC 26's "no on-chain settlement on refundable verdict" property intact. The `verdict=deliverable chargeAmount=X` log entries that DO emit for non-charged probes are a **telemetry / observability bug**, not a money bug.

**Why the legacy `chargeProxy` path doesn't have this issue.** Legacy path doesn't classify upstream responses — it goes mppx-first, so no creds → 402 challenge → handler never runs. The whole reason SPEC 26 inverted the order is to classify deliverable vs refundable BEFORE charging. That classification needs the upstream call to have happened. There's no path to "skip the probe but still get the classification" — they're inseparable.

**The remaining real bug (telemetry).** The `event=classify ... verdict=deliverable chargeAmount=X` log fires at classify time, before `mppx.charge` runs. Probes that don't lead to an on-chain charge (because the request had no credential and mppx 402'd) still emit a log line that looks identical to a real charge. Founder reading Vercel logs naturally counts entries as charges, leading to false-alarm counts (the night-before $0.15 panic).

**Correct fix path for the telemetry bug (NOT YET SHIPPED):**
- Option A: split the `classify` log event in two — `event=probe` (always emits, no chargeAmount) + `event=charge_succeeded` (only emits when `mppx.charge` returns 200, includes chargeAmount). Founder counts `count(event=charge_succeeded)` for true charge count.
- Option B: keep one event but only include `chargeAmount` when the charge actually succeeds. Founder reads `chargeAmount > 0` as the filter.
- Option C: leave it alone; document that founders must read Vercel logs as `count(event=classify AND chargeAmount > 0)` minus any `event=charge_failed` entries with the same probe id. (Brittle; needs a probe-id correlation that doesn't exist today.)

A is cleanest and most honest. The split has zero behavior change — only telemetry. Worth doing in a future spec or hotfix.

**Correct fix path for the double-probe efficiency (NOT YET SHIPPED, lower priority).** The double-probe (prepare → discarded; complete → charged) doubles vendor cost per pay flow. The cleanest fix is to make the prepare-time probe write to the response cache so the complete-time call hits the cache → single probe per flow. Today the prepare-time probe is followed by an `mppx.charge → 402` pass-through that exits before the cache.set call. Moving the cache.set higher (after the probe, before the mppx.charge attempt) would close the gap — but only when the probe verdict is `deliverable` (refundable probes shouldn't cache because the next retry might succeed). Defer until vendor-cost telemetry shows it matters.

**The original SPEC 26 invariant remains correct.** The probe-then-classify-then-charge order is load-bearing for the "no on-chain settlement on refundable verdict" property. Don't break it.

**On-chain ground truth (the false-alarm resolution).** The 2026-05-13 incident: ONE successful pay flow, $0.05 charged on-chain, multiple `verdict=deliverable` log entries because the same flow produces N classify events (one per gateway hit; prepare counts for one even when mppx 402s right after). Audric `/api/services/complete` log confirmed exactly one Enoki settlement + one gateway call. Founder is whole.

### v1.0.2 — Probe-throw safety net + telemetry split + quality validate (2026-05-14)

**Status: SHIPPED. Three concurrent fixes in one commit. All defense-in-depth around the v1.0.1 lesson; none touch the load-bearing probe-then-charge invariant.**

**Trigger.** The 2026-05-14 ~06:19 AEST live image-gen smoke produced a real bug + reproduced the v1.0.1 telemetry confusion at the same time:

| Attempt | LLM action | Gateway log | Audric prepare log | On-chain |
|---|---|---|---|---|
| 1 | `quality=standard` | `verdict=refundable durationMs=808` | `402 settle-no-delivery` | $0.00 ✓ |
| 2 | retry (corrected params) | `verdict=deliverable durationMs=38298` | **`POST 500` in 5s** + Vercel envelope `{"error":{"code":"500","id":"rwkyzYGQaEI1EUD3RMcrz7XcEuJ3YwST","message":"Internal Server Error"}}` | $0.00 ✓ |
| 3 | retry (identical to attempt 2) | `verdict=deliverable durationMs=39298` + `verdict=deliverable durationMs=38xxx` | `POST 200` (success) | **$0.05 ✓** (digest `Gj2meEk8...`) |

The 5-second 500 with a Vercel invocation ID (`rwkyzYGQ...`) was Vercel's outer wrapper catching an unhandled throw inside the gateway function. The throw site was inside `chargeProxySettleOnSuccess`'s probe phase — neither `fetchAndTransformUpstream`'s raw `fetch` to OpenAI nor the classifier had a try/catch above them. A transient network error (TCP reset / DNS hiccup / abort) propagated to Vercel as 500. Attempt 3 succeeded with identical params, confirming it was a transient infra blip not a logic bug.

Founder also noted **4 `verdict=deliverable chargeAmount=0.05` log entries vs 1 actual on-chain charge** — the same v1.0.1 telemetry trap. The on-chain truth was ONE charge (digest matched the wallet delta + `[services/complete] Payment executed:` log entry); the other 3 deliverable verdicts came from prepare-phase probes where mppx returned 402 (no Payment-Receipt) and never moved USDC.

**Fix #1 — Probe-throw safety net (the actual bug).** Wrap the probe + classifier in a try/catch at the top of `chargeProxySettleOnSuccess`. On throw → return HTTP 402 with `X-Settle-Verdict: refundable` + `X-Settle-Reason: probe-failed: <message>`. User-money invariant is identical (no charge in either case — we never reach mppx.charge), but the LLM gets the typed retry signal that drives the D-8 prompt instead of an opaque 500. The catch surface is intentionally narrow: probe + arrayBuffer + classifier. Everything else stays uncatched (mppx.charge has its own try/catch already).

```typescript
try {
  probeRes = await fetchAndTransformUpstream(...);
  probeBytes = await probeRes.arrayBuffer();
  // ... parse + classifier
  verdict = await classifier(probeForClassifier, parsedBody);
} catch (probeErr) {
  // log [mpp.settle] event=classify verdict=refundable reason=probe-failed:...
  return Response.json({ error: 'Upstream probe failed', detail: ... }, {
    status: 402,
    headers: { 'X-Settle-Verdict': 'refundable', 'X-Settle-Reason': `probe-failed: ${...}` },
  });
}
```

**Fix #2 — Telemetry split (v1.0.1's correct fix path A, finally landed).** `event=classify` keeps `verdict` + `durationMs` + `chargedFraction` + `reason`, DROPS `chargeAmount`. New `event=charge_succeeded` emitted only after `mppx.charge` returns 200, carries the actual `chargeAmount`. Founder reads `count(event=charge_succeeded)` over a window === true on-chain charge count for that window. Math becomes the truth, no more reading inflated probe counts as charges.

```
[mpp.settle] event=classify         route=openai/v1/images/generations verdict=deliverable durationMs=38298
[mpp.settle] event=charge_succeeded route=openai/v1/images/generations chargeAmount=0.05
```

**Fix #3 — `quality` allow-list in pre-charge validate.** The 2026-05-13 21:30 + 2026-05-14 06:19 smokes both hit the same LLM mistake: `quality=standard` (DALL-E 3 value gpt-image-* rejects). Each attempt burned ~38s of OpenAI probe RTT + ~$0.05 of gateway-absorbed vendor cost. Add `VALID_QUALITIES = {low, medium, high, auto}` to `validateImagesGenerationsBody`; rejected with the same actionable error pattern as the existing `model` and `size` gates. Defense-in-depth — settle-on-success still catches it as refundable, but the LLM sees a 400 with the allowed values immediately (no upstream RTT).

**What this fix does NOT solve (deferred):**
- The double-probe efficiency (each pay flow probes upstream twice — once at prepare, once at complete). Still defer per v1.0.1 reasoning until vendor-cost telemetry shows it matters.
- The `bug_mpp_no_refund_on_failure` class for COMPLETE-phase probe-throws (would-be on-chain settlement that didn't deliver). The probe-throw safety net returns refundable, but if the throw happens during a complete-phase call, the on-chain USDC has already moved via Enoki and is orphaned in treasury awaiting the deferred `refund(digest)` primitive (spec O-4). Same situation as today's charge-failed verdict path; not a new bug class.

**Tests.** Gateway suite went from 156 → 170 tests:
- `gateway.settle-on-success.test.ts`: +5 tests (probe try/catch — fetch throws / classifier throws / classify-event reason field / 10kb-message truncation; charge_succeeded NOT emitted when mppx 402's). Updated 3 existing tests that asserted `chargeAmount=` on `event=classify` lines.
- `settle-metrics.test.ts`: +2 tests for `event=charge_succeeded`, +1 test for `event=classify reason=` field. Updated 3 existing tests for the dropped `chargeAmount` field.
- `validate.test.ts`: +9 tests for the `quality` allow-list (all 4 valid values + `standard` / `hd` / unknown / non-string / combined-with-other-params).

170/170 passing, typecheck clean. ESLint script in the gateway package is broken at the binary-resolution level (pre-existing, unrelated).

**Operator filter recipes (post-hotfix):**
- True charge count today: `[mpp.settle] event=charge_succeeded` + last 24h
- Probe failures today: `[mpp.settle] event=classify reason=probe-failed:` + last 24h
- Refundable (intended) today: `[mpp.settle] event=classify verdict=refundable` + last 24h, exclude `reason=probe-failed:`
- Charge-failed (after probe succeeded) today: `[mpp.settle] event=charge_failed` + last 24h

---

### v1.0.3 — Audric prepare passes through gateway 4xx error message (2026-05-14)

**Status: SHIPPED. Audric companion fix to v1.0.2 Fix #3. The `quality` allow-list returns the right error from the gateway; this fix makes sure the LLM actually SEES it.**

**Trigger.** The 2026-05-14 06:35 AEST live smoke (post-v1.0.2 deploy) hit `quality=standard` exactly as v1.0.2 Fix #3 was designed for. Gateway pre-charge validate hook returned the right thing — HTTP 400 + `{ error: "Quality \"standard\" is not currently supported. Valid qualities: low, medium, high, auto. ..." }`. Audric's `services/prepare` route then **swallowed** the body and returned `{ error: "Gateway error (400)" }` to the LLM. The LLM read that as "prompt parsing issue", retried with the same params, looped twice, gave up. Net result: zero charges, but the user saw two "FAILED" cards instead of one self-corrected retry → success.

**Three-attempt timeline (audric chat UI):**

| Attempt | LLM action | Gateway | What audric sent to LLM | LLM next action |
|---|---|---|---|---|
| 1 | `quality=standard` | `400 + { error: "Quality \"standard\" is not currently supported. Valid qualities: low, medium, high, auto. ..." }` | `"Gateway error (400)"` | "likely a prompt parsing issue" → retry with cleaner prompt (still `quality=standard`) |
| 2 | identical | same `400` | `"Gateway error (400)"` | "gateway is rejecting the request structure" → give up, ask user to try later |
| (no 3) | — | — | — | — |

**Root cause.** `services/prepare/route.ts` had a hardcoded generic envelope on the non-402 / non-2xx branch:

```typescript
return NextResponse.json(
  { error: `Gateway error (${challengeRes.status})` },
  { status: challengeRes.status },
);
```

The actual error body was logged (so operators could see it in Vercel logs) but never returned to the client. The LLM only sees what audric returns — log lines don't enter its context.

**Fix.** Reuse the existing `extractVendorErrorMessage` helper (already used on the SPEC 26 settle-no-delivery 402 path):

```typescript
const errText = await challengeRes.text().catch(() => '');
let parsedBody: unknown = null;
try { parsedBody = JSON.parse(errText); } catch { /* not JSON */ }
const fallback = errText.trim().length > 0
  ? errText.slice(0, 500)
  : `Gateway error (${challengeRes.status})`;
const errMsg = extractVendorErrorMessage(parsedBody, fallback);
return NextResponse.json({ error: errMsg }, { status: challengeRes.status });
```

Three branches:
1. **JSON body with `.error` field** (gateway validate hook, OpenAI 400s) → return the message verbatim.
2. **Non-JSON body** (some Vercel infra errors return plain text) → return raw text capped at 500 chars.
3. **Empty body** → fallback to `Gateway error (status)` (the old behavior; only path that still uses the generic envelope).

**Why now and not earlier.** The settle-no-delivery 402 path got `extractVendorErrorMessage` in P5.2 (2026-05-13) because that was the obvious LLM-facing failure mode at the time. The 4xx path was an "operators see it in logs" assumption — fine until v1.0.2's `quality` validate gate created the FIRST production-grade 400 the LLM was actually expected to read and self-correct on. v1.0.2 + v1.0.3 land together as one usable flow: validate gate produces actionable 400, audric threads it through, LLM sees `Valid qualities: low, medium, high, auto` and uses one of those on the next attempt.

**Tests (audric/apps/web).** `app/api/services/prepare/route.integration.test.ts` went from 10 → 13 tests:
- `passes through gateway 4xx error message verbatim (SPEC 26 v1.0.2)` — asserts the literal `Quality "standard"` message threads through and the `Valid qualities: low, medium, high, auto` substring is preserved.
- `falls back to generic message when 4xx body is not JSON` — asserts plain text bodies survive.
- `falls back to "Gateway error (status)" when 4xx body is empty` — asserts the empty-body floor.

13/13 prepare tests pass; `pnpm --filter @audric/web typecheck` clean; ESLint clean for touched files (1 pre-existing unrelated `react/display-name` error in the wider lint run).

**Commit.** `9516d65` on audric main, auto-deployed via Vercel ~07:00 AEST 2026-05-14.

**What this fix does NOT solve.** Same deferred items as v1.0.2 (double-probe efficiency, complete-phase probe-throw orphaned USDC). Plus one new one: this fix only covers `services/prepare`. The `services/complete` route already uses `extractVendorErrorMessage` for its own paths, but if a future audric route adds a similar generic-envelope shortcut for non-2xx gateway responses, the same bug class is back. Mitigation: this is now the third route that uses `extractVendorErrorMessage` for upstream pass-through; pattern is established. Future code review should flag any `error: \`Gateway error...\`` shortcut.

---

### v1.0.4 — DALL-E brand scrub (chrome + prompt + LLM narration) (2026-05-14)

**Status: SHIPPED. Closes the SPEC 26 hotfix series. Pure UX/brand fix — no on-chain semantics change, no charge-path change. Follows v1.0.2 + v1.0.3 because the smoke that exposed the brand leak only became reproducible AFTER the LLM started successfully self-correcting on `quality=standard` (v1.0.2 + v1.0.3 wins) and surfacing the receipt card on attempt 2 instead of looping to give-up.**

**Trigger.** The 2026-05-14 ~07:30 AEST live smoke (post-v1.0.3 deploy) confirmed the v1.0.2 + v1.0.3 self-correct loop worked end-to-end: attempt 1 hit `quality=standard` → 400 with allow-list error → LLM corrected → attempt 2 → $0.05 charged → image rendered. But the receipt card header showed **"DALL-E · IMAGE"** and the LLM's pre-attempt narration was **"Image generation via DALL-E is $0.05"**. OpenAI shut down the DALL-E family on 2026-05-12 (per row 7j); `gpt-image-1` is what actually renders. Founder framing: *"Again with the DALL-E!!!! I thought we removed it. and its still failing."*

The brand survived the v1.29.4 deprecation fix (row 7j) in 6 places that v1.29.4 didn't touch — gateway service description (parenthetical), engine `DEFAULT_SYSTEM_PROMPT`, engine `pay_api` tool description (multi-step composition examples), audric `STATIC_SYSTEM_PROMPT`, audric `mpp-services-tool` description, audric `CardPreview.tsx` chip vendor label. v1.29.4 only fixed the `MODEL_REGISTRY` data path (gateway validate hook + engine prompt model list); the brand-name leakage in surrounding chrome and prompt prose stayed intact.

**Why the LLM narrates DALL-E.** Two surfaces feed it:
1. **`mpp_services` tool result** rendered the gateway service description verbatim — `services.ts` had `'Generate images with gpt-image-1 (DALL-E was shut down 2026-05-12)'`. The parenthetical is correct historical context for an operator reading the catalog; for an LLM reading the catalog it's an explicit invitation to reference DALL-E in user-facing narration.
2. **`pay_api` tool description + audric STATIC_SYSTEM_PROMPT + engine DEFAULT_SYSTEM_PROMPT** all referenced "DALL-E images" in pricing lines and intent-mapping examples. The model copies the brand into its narration even when the actual call goes to `gpt-image-1`, because the prompts use "DALL-E" as the user-facing label.

**Fix — six surfaces, one session.**

1. **Gateway service description** (`apps/gateway/lib/services.ts`) — drop the `(DALL-E was shut down 2026-05-12)` parenthetical. Description becomes `'Generate images with gpt-image-1'`. The shutdown context is now in `apps/gateway/app/openai/v1/images/generations/route.ts` doc-comment + the `MODEL_REGISTRY` rejection error message — operator-readable surfaces, not LLM-fed surfaces.

2. **Engine `DEFAULT_SYSTEM_PROMPT`** (`packages/engine/src/prompt/index.ts`) — 5 mentions scrubbed across pricing, intent mapping, multi-step compositions, and the "what we cannot do" list. "DALL-E images $0.05" → "image generation (gpt-image-1) $0.05". "OpenAI DALL-E + Lob letter" → "openai images + Lob letter". Used by CLI + non-Audric consumers.

3. **Engine `pay_api` tool description** (`packages/engine/src/tools/pay.ts`) — pricing line scrubbed; multi-step examples scrubbed; "OpenAI image models" guidance now says `gpt-image-1` is the only option AND explicitly tells the LLM **"do NOT mention 'DALL-E' to the user"**. One internal reference to DALL-E retained so the LLM can reject `dall-e-*` model names if it sees them (defense behind v1.29.4 `MODEL_REGISTRY`).

4. **Audric `STATIC_SYSTEM_PROMPT`** (`apps/web/lib/engine/engine-context.ts`) — 5 DALL-E mentions scrubbed. Hit the 10,700-token budget gate (`harness-metrics.test.ts`) by 14 tokens on first pass; tightened wording instead of raising the budget per the test's explicit instruction. "image generation (gpt-image-1)" condensed to "images" where context already names OpenAI; "OpenAI gpt-image-1 is the only image option" condensed to "(gpt-image-1 only)". Net 63 chars saved, prompt back inside budget.

5. **Audric `mpp-services-tool`** (`apps/web/lib/engine/mpp-services-tool.ts`) — 2 mentions scrubbed in tool description. "DALL-E images" → "image generation via gpt-image-1".

6. **Audric `CardPreview.tsx`** receipt chip header — `vendorLabel('openai')` for the images endpoint returned `'DALL-E · IMAGE'`. Changed to `'OPENAI · IMAGE'`. The user-visible receipt now reads `OPENAI · IMAGE / $0.05` (matches the 5-product Audric framing — the user transacts with a vendor, not with a model brand).

**Tests.**
- Engine: 1169/1169 passing (+3 from `pay.test.ts` + `prompt/index.test.ts` regex bans on `/dall-?e/i` matching the user-facing prose blocks).
- Gateway: 170/170 passing (no new tests — the `services.ts` change is a string description with no behavioral assertion).
- Audric: 198/198 passing on the directly-touched components (`CardPreview.test.tsx` + `engine-context.test.ts`); regex ban added to `engine-context.test.ts` for the STATIC_SYSTEM_PROMPT body matching `/dall-?e/i`.

**Commits.**
- t2000 `1638044d` (gateway + engine source) → `bfed20f4` (v1.30.2 release: sdk + engine + cli + mcp).
- audric `e35769c` (chrome + STATIC_SYSTEM_PROMPT + mpp-services-tool initial scrub) → `f66e718` (`@t2000/engine` + `@t2000/sdk` bump to 1.30.2) → `c9b0e2f` (budget-fix tightening to land under 10,700 tokens).

**Smoke confirmation 2026-05-14 ~08:00 AEST.** Same prompt (`Generate an image of a golden retriever surfing a wave at sunset, photorealistic style.`) — discover-services chip showed `Generate images with gpt-image-1`, LLM narrated `Image generation via OpenAI — $0.05`, single charge, receipt chip read `OPENAI · IMAGE / $0.05`. Zero "DALL-E" anywhere in the user-visible flow.

**What this fix does NOT solve.** Brand scrub doesn't address the architectural items already deferred (refund(digest), double-probe, complete-phase orphan, chargeCustom settle-on-success). It also doesn't add a regression guardrail at the schema level — if a future tool description references DALL-E in a place the regex ban doesn't cover, it can leak again. The structural answer to that class of drift is SPEC 25 SSOT reactivation (one model registry, one prompt-interpolation source, drift dies at the seam) — out of scope for SPEC 26, but `spec_mpp_cross_repo_audit_v1` (the next SPEC) explicitly carries this as a finding.

---

**SPEC 26 hotfix series closed at v1.0.4.** Any further work on MPP correctness lands as either a sibling SPEC (refund(digest), chargeCustom settle, vendor failover) or a finding inside the cross-repo audit spec.
