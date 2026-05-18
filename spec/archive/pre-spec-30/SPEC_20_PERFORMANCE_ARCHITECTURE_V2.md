# SPEC 20 — Performance Architecture v2

**Status:** **v0.1 LOCKED 2026-05-09 ~20:00 AEST (S.139)** — all 11 D-questions locked to founder-approved recommendations. Phase 20.2 implementation begins immediately.
**Owner:** Founder + assistant
**Slot:** Immediately after SPEC 19 closes; before SPEC 11 (PayButton inherits the BEST architecture, not a pragmatic one — founder rationale, S.130)
**Estimated effort:** ~5d total (revised from S.129's ~4d after Phase F + cleanup work in SPEC 19 informed scope)
**Locked sequencing:** **20.2 → 20.1 → 20.3** (founder approved 2026-05-09 ~19:00 AEST, supersedes S.129's 20.1 → 20.2 → 20.3 default)
**Triggered by:** SPEC 19's pragmatic-with-headroom recommendations (D-1, D-3, D-6 in `SPEC_19_PERFORMANCE_RELIABILITY_SWEEP.md`) + 1 deferred phase (C, blocked by Vercel cross-function isolation) + 1 outstanding P2 UX bug (S19-F2, structurally fixed by 20.2).

---

## TL;DR

SPEC 19 shipped the perf + reliability gains we could get with surgical, low-risk changes. The wins are real (`engine.pwr.total_ms` -78% p50, resume_stream p50 2.16s, unified retry telemetry, published SLOs, BV-outage drill), but **3 of the 6 D-questions in SPEC 19 had structurally better answers we deferred** because the structural rebuilds were too risky to fold into a perf-and-reliability sweep:

- **D-3 → SPEC 20.2** — Eliminate the in-process route cache by threading the Cetus route through `pending_action.cetusRoute`. Same fix structurally closes **S19-F2** (LLM cites stale swap routes in narration) — the route becomes the single source of truth from quote → confirm → prepare → narration.
- **D-1 → SPEC 20.1** — Redesign `getPortfolio` as parallel-by-default at the architecture level (concurrent fetcher composition, not Promise.all-in-3-places). The current implementation is `Promise.allSettled` over 3 top-level calls but each top-level call internally serializes its own fan-out — 9 sequential BV per-token lookups in the post-write refresh path are a relic of the v0.54 SSOT rewrite that no one has revisited since.
- **D-6 → SPEC 20.3** — Replace SPEC 19's quarterly manual BV-outage drill with an automated chaos test in CI. The manual drill works but decays; CI catches the regression the day it ships.

**Sequencing rationale (founder-locked 2026-05-09):** ship 20.2 first because it closes 2 open items (Phase C + S19-F2) in one structural fix on the write path. Then 20.1 (read path) — front-loading the write fix makes the next perf measurement easier to interpret because read perf is measured in isolation. Then 20.3 — chaos harness needs Phase E to be stable first (which it now is post-S.135).

**Targets:**
- Single swap perceived: 7-8s (post-SPEC-19 baseline) → 6-7s (-1-1.5s from 20.1+20.2)
- Bundle perceived: 11-13s (post-SPEC-19 baseline) → 9-11s (-2s from 20.1+20.2)
- S19-F2 narration grounding: P2 UX bug → 0% reproducibility (structural fix in 20.2)
- BV-outage drill cadence: quarterly manual → nightly automated in CI
- SLO breach detection time: SPEC 19 SLOs → reduced from "next observation window" to "next CI run" for any BV-degradation-class regression

**Out of scope:**
- Any LLM-tier work (S.126 + SPEC 19 covered that — diminishing returns until baselines shift)
- Sui `waitForTransaction` reduction (floor for on-chain settlement; documented as irreducible)
- Cold-start onboarding perf (Path 0 in SPEC 18; different surface, different SPEC)
- PayButton / Audric-payer routing perf (SPEC 11 territory; PayButton ships AFTER this SPEC closes per S.130)
- Multi-wallet / atomic-MPP perf (SPEC 16, paused)
- Stress / throughput / load testing (single-user perf, not throughput; new SPEC if 10k+ DAU)
- Replacing Vercel serverless with always-on Node (architectural rewrite, separate SPEC)

---

## Background — what SPEC 19 surfaced + left on the table

SPEC 19's "GO for launch" close (founder S.135 sign-off pending Phase G+H smoke) shipped the pragmatic version of the perf rebuild. The structural rebuilds it deferred are not "nice to have someday" — they're **load-bearing for items already in our backlog:**

| What SPEC 19 left | Why it matters NOW (not "Q3 2026 quarterly review") |
|---|---|
| In-process Map cache for Cetus routes (Phase C blocker) | Phase C is required for the prepare-route latency target. SPEC 19 D-3's pragmatic answer (in-process Map) was killed by Vercel's per-route serverless isolation. SPEC 20.2 is the only path to that win. |
| `getPortfolio` parallel-by-default redesign | Post-SPEC-19 the resume_stream p95 is 2.81s. About 600ms of that is still serial BV per-token lookups. PayButton (SPEC 11) hits the same `getPortfolio` path on every Pay-button render — inheriting the pragmatic perf would regress PayButton p95 by ~500ms vs. inheriting the structural perf. |
| Automated chaos drill (SPEC 19 D-6's deferred answer) | Manual quarterly drills decay. The April 2026 silent-degradation incident (S.20) was an unobserved BV regression that ran 4 days in production. A nightly chaos test would have caught it on day 0. |
| **S19-F2 — LLM cites stale swap routes in narration (P2 UX)** | Confirmed in v1.24.13 round-2 smoke. Card is canonical (correct route shown), narration cites first-quote-ever-seen. Tactical fix (system prompt nudge) was tried in S.126; ineffective. **Structural fix is the SAME `pending_action.cetusRoute` threading as 20.2** — the route becomes the source of truth for both prepare and narration, eliminating the LLM's ability to fabricate from stale context. |

S19-F2's structural closure under 20.2 is the highest-ROI item in this entire spec. One change, two open items closed, zero risk of regression because the route data already exists at quote time — we're just stopping it from being thrown away.

### Five concrete tails post-SPEC-19

After SPEC 19's wins, the remaining latency + correctness gaps are:

1. **`/api/transactions/prepare` re-discovers the Cetus route** (~0.4-0.5s) every swap. SPEC 19 Phase C wanted to cache this but the in-process Map can't span Vercel functions. → **SPEC 20.2 fixes structurally.**
2. **`getPortfolio` per-token price lookups still serial** (~0.5-0.8s in worst case for wallets with >10 tokens). → **SPEC 20.1 fixes structurally.**
3. **Narration cites stale routes** (P2 UX, S19-F2). LLM has no canonical reference for "the route the user is actually about to confirm" — it samples from earlier turn context. → **SPEC 20.2 fixes structurally as a side effect.**
4. **No regression detection for BV-degradation paths between quarterly drills.** SPEC 19's Phase E runbook is solid but human-cadenced. → **SPEC 20.3 fixes structurally.**
5. **PayButton (SPEC 11) inherits whatever architecture exists at PayButton-spec-time.** If PayButton ships before SPEC 20, its perf budget assumes serial reads + route re-discovery. → **Founder's S.130 rationale: ship SPEC 20 before SPEC 11 so PayButton inherits the BEST architecture.**

---

## Scope (locked sequencing 20.2 → 20.1 → 20.3)

### IN SCOPE

| Phase | What | Estimated win | Effort | Risk |
|---|---|---|---|---|
| **20.2** | Thread Cetus route through `pending_action.cetusRoute` (engine + audric). Closes SPEC 19 Phase C + S19-F2. | -0.4-0.5s prepare; closes P2 UX bug | ~2d | Medium — touches engine type contract + audric resume/prepare wiring. Backward compat needed for in-flight pending actions. |
| **20.1** | Redesign `getPortfolio` as parallel-by-default. Concurrent fetcher composition. Per-token price lookups in parallel-batch (chunked, BV-rate-limit-aware). | -0.5-0.8s p95 on every wallet read | ~1.5d | Low-medium — read-only path, sticky-positive cache absorbs failures. Risk concentrated in `partialSource` propagation under partial failures. |
| **20.3** | Automated chaos drill in CI. Codify Phase E runbook as nightly synthetic test. | Catches BV-degradation regressions on day 0 (vs. quarterly drift) | ~1.5d | Low — net-new test infra, doesn't touch production code. Risk concentrated in CI environment fidelity (mock vs. real BV). |

**Total: ~5d.** Slightly higher than S.129's ~4d estimate because Phase F's audit work informed how much retry-telemetry instrumentation 20.1 + 20.3 will reuse.

### OUT OF SCOPE

Same as SPEC 19's OUT OF SCOPE list (LLM-tier, Sui finality, cold-start, PayButton, multi-wallet, throughput, serverless replacement) plus:

- **Replacing the BlockVision Indexer REST API with a different vendor.** The retry policy + sticky-positive cache + circuit breaker stack (SPEC 19 + this SPEC) is BV-specific. Vendor migration is a separate SPEC.
- **Adding real-time portfolio push (WebSocket / SSE from BV).** Would be the structural fix for "wallet reads are stale by N seconds" but requires BV vendor support that doesn't exist today.
- **Speculative pre-prepare** (build the prepare-route Tx before user confirms). Risks burning Enoki sponsor budget on writes the user declines. Possibly worth revisiting at 10×+ DAU if Enoki billing model changes.

---

## D-Questions — TO LOCK before implementation

### Phase 20.2 — Threading Cetus route through pending_action

| # | Question | Options | Recommendation | Verdict |
|---|---|---|---|---|
| **D-1** | **Route shape on `PendingAction`.** Should the route be (a) `cetusRoute: SerializedCetusRoute` (typed structured field — engine + audric both reference by path); (b) `opaqueBlob: string` (engine treats as opaque, audric deserializes — keeps engine type surface narrow but loses LLM-grounding ability); (c) `cetusRoute` typed AND a `routeSummary: string` for LLM context (full structured data for prepare + a flat human-readable summary for narration grounding)? | (a) — structured. The route IS the canonical fact. The cost of typing it (~10 LoC of types) buys us narration grounding, snapshot storage for AdviceLog + ConversationLog, and easier debugging. (c) is overengineered: LLM can read structured fields just fine via a tool-result or system-prompt rendering. | **🔒 LOCKED (a) — founder approved 2026-05-09 19:55 AEST** |
| **D-2** | **Integrity / signing.** The route flows engine → client → audric prepare-route. Client could in theory tamper. Should we (a) sign the route with a server-side HMAC at quote time, verify at prepare time (security gate); (b) re-validate the route at prepare time by re-running `findSwapRoute` and asserting the input/output coins match — but using the structured route to skip the EXPENSIVE discovery (compromise: no signing, but route is structurally verified); (c) trust the client (the user who signed the tx is the same user who got the quote — no escalation path)? | (b) — structural verification. The user already signs the prepared tx; tampering with the route would just make the tx fail at on-chain settlement (Cetus aggregator rejects mismatched routes). HMAC adds infra without closing a real attack vector. The structural verification is essentially free because the prepare-route already does input validation. | **🔒 LOCKED (b) — founder approved 2026-05-09 19:55 AEST** |
| **D-3** | **TTL / staleness handling.** User taps Confirm 60s after quote. Route is now 60s old (Cetus pool prices may have moved). Should we (a) reject any `pending_action` older than 30s (matches existing quote-freshness contract — clean but loses the route advantage when user is slow); (b) re-validate the route at prepare time and re-discover ONLY if price impact has shifted >X% (uses route as fast-path; falls back to current behavior on stale); (c) always re-discover (no-op — back to SPEC 19 baseline)? | (b) — fast-path with re-validation. Most users tap Confirm within 5-10s of quote (S.108 telemetry). For those, we get the full -0.4-0.5s win. For the slower tail, we degrade gracefully to current behavior. The re-validation adds ~30ms (a single price-check call) which is well below the noise floor. | **🔒 LOCKED (b) — founder approved 2026-05-09 19:55 AEST** |
| **D-4** | **Narration grounding mechanism.** Once the route is on `pending_action`, how does the LLM use it for narration? (a) Inject a `<canonical_route>` block into the post-write resume system prompt — explicit, in-prompt, costs cache invalidation on the resume turn; (b) Tool result rewrite — the post-write resume runs a synthetic tool result `{type: 'route_summary', from, to, route: [...]}` that the LLM is instructed to mirror in narration; (c) Both — system-prompt block for context, tool result for required fields the narration MUST cite. | (a) — system-prompt block. Cleanest, easiest to test, doesn't require new tool infra. The cache invalidation cost is one-time per resume turn (turn-level, not session-level). | **🔒 LOCKED (a) — founder approved 2026-05-09 19:55 AEST** |
| **D-5** | **Backward compat for in-flight pending actions.** When 20.2 ships, audric production has live `PendingAction` rows persisted from pre-20.2 sessions. Those rows have NO `cetusRoute` field. The prepare route needs to handle both. Should the legacy fallback (a) re-discover via current `findSwapRoute()` for any pending action without `cetusRoute` — ~7d of dual-path code that gets removed once the session TTL clears; (b) reject any pending action without `cetusRoute` and force the user to re-confirm — clean cutover, but breaks the ~5% of users mid-flow at deploy time; (c) snapshot the v1.24.x→v1.25.x cutover and migrate in-flight rows by re-running `findSwapRoute()` server-side at deploy — most thorough but most code? | (a) — dual-path with TTL cleanup. Session TTL is 7d; after 7d the legacy code is dead and gets deleted. Cleanest user experience (no mid-flow break). | **🔒 LOCKED (a) — founder approved 2026-05-09 19:55 AEST** |

### Phase 20.1 — Parallel-by-default getPortfolio

| # | Question | Options | Recommendation | Verdict |
|---|---|---|---|---|
| **D-6** | **Per-token price parallelization concurrency cap.** Wallets with 20+ tokens hit BV's per-second rate limit if we fan out fully. Should the price-lookup batch be (a) chunked at concurrency=3 (matches the existing `fetchAddressDefiPortfolio` pattern from S18-F4); (b) chunked at concurrency=5 (slightly aggressive, may hit 429 occasionally — relies on SPEC 19 retry layer); (c) batched per-call to BV's `/multi-token-price` endpoint (eliminates the fan-out entirely if the endpoint exists for our token set)? | (c) IF the endpoint exists. (a) otherwise. Need to verify BV supports a multi-token endpoint for our SUPPORTED_ASSETS — if yes, this is the clean architectural answer. If no, the c=3 pattern is the safe fallback. | **🔒 LOCKED (c) pending BV API check, fallback (a) — founder approved 2026-05-09 19:55 AEST** |
| **D-7** | **Partial-failure semantic when one chunk fails.** Today: `partialSource: 'partial'` flags the result. Sticky-positive cache (SPEC 19 v0.54) serves last-known on degradation. Should the parallel-by-default version (a) preserve the exact same `partialSource` semantic (no behavior change observable at the read interface); (b) add granular per-asset failure tagging (`failedAssets: ['SUI', 'USDC']` so the LLM can narrate "I have stale data for SUI and USDC"); (c) auto-retry failed chunks once before flagging partial (-50ms latency on failure paths but improves first-response success rate)? | (a) — preserve exact semantic. SPEC 19's sticky-positive cache + LLM narration grounding (post-S.134 strip-on-persist) are calibrated to the current `partialSource` contract. Changing the semantic invalidates SPEC 19's smoke baselines. | **🔒 LOCKED (a) — founder approved 2026-05-09 19:55 AEST** |
| **D-8** | **Fast-path response.** Should the redesigned `getPortfolio` (a) wait for ALL fetchers to settle before returning (current behavior — predictable latency, consistent shape); (b) return as soon as the wallet+positions calls settle and stream prices via SSE (lower TTFB, complex consumer code); (c) return as soon as the wallet+positions+prices for SUPPORTED_ASSETS settle, fire-and-forget the long-tail tokens (best of both — supported assets always fresh, long-tail tokens may be one read behind)? | (a) — wait for all. Streaming responses break the LLM tool-result contract (LLM expects synchronous, complete results). Fast-path-with-tail (c) introduces consistency hazards we don't need to solve. | **🔒 LOCKED (a) — founder approved 2026-05-09 19:55 AEST** |

### Phase 20.3 — Automated chaos drill

| # | Question | Options | Recommendation | Verdict |
|---|---|---|---|---|
| **D-9** | **Chaos environment.** CI runners don't have BV credentials AND we don't want to point production tests at staging BV. Options: (a) Mock BlockVision at the network layer in CI (use `msw` or similar — full request/response fidelity, no real BV traffic); (b) Maintain a dedicated staging BV API key for CI, hit real BV with synthetic test wallets (highest fidelity, costs vendor quota); (c) Run the chaos test in a Vercel Preview deployment that talks to staging BV (closest to production, requires Preview infra setup). | (a) — mocked. Real BV traffic from CI is a vendor-cost + flakiness liability. Mocked BV with the same response shapes lets us assert the retry layer + circuit breaker + sticky cache stack with full determinism. The cost of "we tested against a mock" is mitigated by the quarterly manual drill (still runs against real BV). | **🔒 LOCKED (a) — founder approved 2026-05-09 19:55 AEST** |
| **D-10** | **Cadence + failure semantic.** Should the chaos test run (a) on every PR + nightly main (catches regressions ASAP, may add 1-2min to CI critical path); (b) nightly main only (lower CI cost, regression detected within 24h); (c) weekly main only (cheapest, catches drift but not fast regressions)? | (a) — on every PR + nightly. The chaos test exists BECAUSE the cost of a missed regression is higher than the CI minutes. PR-blocking is the canonical "fail fast" pattern; nightly catches non-PR drift (env changes, dependency bumps). | **🔒 LOCKED (a) — founder approved 2026-05-09 19:55 AEST** |
| **D-11** | **What the test asserts.** The Phase E runbook has 4 gates (retry telemetry → CB opens → sticky cache serves → narration acknowledges). Should the CI version (a) assert all 4 gates as separate test cases — fine-grained reporting, complex setup; (b) assert a single end-to-end "BV is down → user gets a stale-but-non-zero answer" scenario — coarse but reflects the user-visible contract; (c) BOTH — coarse e2e gate as the merge-blocker, fine-grained gates as informational? | (c) — both. The coarse gate is the user contract (don't ship if it breaks); the fine-grained gates tell us WHERE the contract broke when it does. Cost is one extra test file to maintain. | **🔒 LOCKED (c) — founder approved 2026-05-09 19:55 AEST** |

---

## Phases

> **Time box:** entire SPEC 20 ≤ 5.5d. Each phase has a hard time cap. If a phase runs over, founder is consulted to decide cut/continue.

### Phase 20.2 — Thread Cetus route through pending_action (~2d, hard cap 12h)

**Surfaces touched:**
- Engine: `packages/engine/src/types.ts` (`PendingAction` interface), `packages/engine/src/tools/swap-quote.ts`, `packages/engine/src/engine.ts` (pending_action emission), system-prompt rendering
- SDK: `packages/sdk/src/protocols/cetus-swap.ts` (route serialization helper)
- Audric web: `apps/web/app/api/engine/chat/route.ts` (persist `cetusRoute` on TurnMetrics), `apps/web/app/api/engine/resume/route.ts` (read back), `apps/web/app/api/transactions/prepare/route.ts` (use `cetusRoute` instead of `findSwapRoute()`)

**Steps (locked at founder review):**
1. Engine: extend `PendingAction` with optional `cetusRoute?: SerializedCetusRoute` field (D-1).
2. Engine: `swap_quote` tool returns the route in its result; `swap_execute` tool's pending_action emission carries it through.
3. SDK: add `serializeCetusRoute(route)` + `deserializeCetusRoute(serialized)` helpers (round-trips the Cetus aggregator route shape; small surface).
4. Audric: `TurnMetrics.cetusRoute` JSON column (Prisma migration); chat route persists; resume route reads back; prepare route uses.
5. Audric: prepare route's compose path uses `deserializeCetusRoute(pendingAction.cetusRoute)` and skips `findSwapRoute()` if present + within TTL (D-3).
6. Audric: prepare route's structural verification (D-2) — re-runs the input/output coin check; falls back to fresh discovery if mismatch.
7. Engine: post-write resume system prompt renders a `<canonical_route>` block from the just-confirmed `pending_action.cetusRoute` (D-4) so narration grounds against the structured route.
8. Audric: dual-path fallback for legacy pending actions (D-5) — if `cetusRoute` is absent, run current `findSwapRoute()`.
9. Tests: engine type test + audric prepare-route test asserting both fast-path (with route) and fallback (without) work. Smoke test asserting narration cites the canonical route (regression test for S19-F2).

**Acceptance gates:**
- G20.2.1: Prepare route p50 drops by ≥300ms when `cetusRoute` is present (target: -400-500ms)
- G20.2.2: S19-F2 narration regression: 0 stale-route citations across the same 11-prompt smoke as v1.24.13 round-2
- G20.2.3: Backward compat: any pending action without `cetusRoute` still works (legacy fallback)
- G20.2.4: Structural verification (D-2): tampered route rejected at prepare-time without on-chain failure
- G20.2.5: Engine + audric typecheck + lint + test all clean

**Tx mutex / safety net:** No new write paths added — 20.2 reroutes existing data through `pending_action`. Same SPEC 18 tx mutex applies. Same Spec 1 attemptId resume keying applies.

### Phase 20.1 — Parallel-by-default getPortfolio (~1.5d, hard cap 9h)

**Surfaces touched:**
- Audric web: `apps/web/lib/portfolio.ts` (the canonical fetcher)
- Engine: `packages/engine/src/blockvision-prices.ts` (price-lookup helpers if we adopt `/multi-token-price` per D-6c)

**Steps:**
1. Audit current `getPortfolio` execution graph — where exactly are calls serial vs parallel today, and what's the BV rate-limit envelope.
2. Verify D-6 — does BV support a multi-token-price endpoint for our SUPPORTED_ASSETS? If yes, refactor price lookups to single batched call; if no, fan-out at concurrency=3 with the SPEC 19 retry layer absorbing 429s.
3. Refactor `getPortfolio` to parallel-by-default composition: wallet + positions + prices all fan-out concurrently, results composed into the final shape only after all settle (D-8a).
4. Preserve `partialSource` semantic exactly (D-7a) — the sticky-positive cache + narration grounding contracts are calibrated to it.
5. Telemetry: add `audric.portfolio.fetch_concurrency` histogram + `audric.portfolio.fetch_duration_ms` per chunk, plus per-chunk failure tagging (informational, doesn't break the contract).
6. Smoke test: same 11-prompt SPEC 19 closeout smoke; assert resume_stream p95 drops by ≥400ms vs SPEC 19 baseline.

**Acceptance gates:**
- G20.1.1: `getPortfolio` p50 drops by ≥300ms (target: -500-800ms on wallets with >5 tokens)
- G20.1.2: `partialSource` semantic preserved exactly (existing tests + sticky-positive cache regression tests still pass)
- G20.1.3: BV 429 rate during peak smoke: <1% (no rate-limit regression)
- G20.1.4: `external.retry_count{vendor:bv, outcome:retried_success}` rate stays under 5% (the parallel pattern doesn't amplify retries)
- G20.1.5: All engine + audric tests pass

### Phase 20.3 — Automated chaos drill in CI (~1.5d, hard cap 9h)

**Surfaces touched:**
- Audric web: `apps/web/__chaos__/bv-outage.test.ts` (new test file), `apps/web/vitest.config.ts` (chaos test scope), `.github/workflows/ci.yml` (CI cadence)
- Engine: `packages/engine/src/__chaos__/bv-mock.ts` (new — shared BV mock used by chaos tests)

**Steps:**
1. Write `bv-mock.ts` — `msw` (or similar) handler that simulates the 4 BV failure modes from Phase E runbook (401 auth, network err, 429 burst, slow response).
2. Write `bv-outage.test.ts` — 4 test cases mirroring Phase E gates (G-E1 retry telemetry, G-E2 CB opens, G-E3 sticky cache serves, G-E4 narration acknowledges), plus 1 coarse e2e gate (D-11c).
3. Wire into CI: PR-blocking job + nightly main job (D-10a).
4. First run on a PR: assert all gates pass on green production code.
5. Validate failure mode: introduce a synthetic regression (e.g. comment out the CB-open emit), assert CI catches it.

**Acceptance gates:**
- G20.3.1: All 5 chaos gates pass on green production code (one PR run + one nightly run)
- G20.3.2: Synthetic regression test (assistant adds a deliberate bug, asserts CI fails the chaos test, then reverts)
- G20.3.3: CI runtime impact: <2min added to PR critical path (mocked tests should be fast)
- G20.3.4: Phase E quarterly drill runbook updated to reference the CI test as the primary signal; manual drill becomes the spot-check

---

## Acceptance gates (closeout-level)

> A closeout score across all 3 sub-phases. Each sub-phase has its own gates above; this table is the SPEC-level summary used for the S.137 (or whatever follows) tracker entry.

| Gate | Test | Source |
|---|---|---|
| **G20-1** | Prepare-route p50 -300ms or better | 20.2 G20.2.1 |
| **G20-2** | S19-F2 closed (narration grounding regression test passes) | 20.2 G20.2.2 |
| **G20-3** | `getPortfolio` p50 -300ms or better | 20.1 G20.1.1 |
| **G20-4** | `partialSource` contract preserved (existing sticky-cache tests pass) | 20.1 G20.1.2 |
| **G20-5** | BV chaos test green on PR + nightly | 20.3 G20.3.1 |
| **G20-6** | Synthetic regression test catches a deliberately broken chaos path | 20.3 G20.3.2 |
| **G20-7** | Combined SPEC-19+20 smoke: single swap perceived ≤7s p50, bundle ≤11s p50 | post-20.1+20.2 closeout smoke |
| **G20-8** | All engine + audric typecheck + lint + test clean across all 3 sub-phases | per-phase |
| **G20-9** | No new dependencies added (sticking with current vendor set: BV, Cetus, NAVI, Anthropic, Sui, Enoki) | per-phase |
| **G20-10** | Forward backlog row 7c marked ✅ FULLY SHIPPED + S.137 tracker entry written | closeout |

---

## Risks

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| **R1** | 20.2's `cetusRoute` field bloats `TurnMetrics` row size > Prisma's per-row limit | Low | Cetus routes are typically <2KB serialized. JSON column. If tail ever crosses 8KB, compress with `LZString` (one extra dependency, defer to that point). |
| **R2** | 20.2's structural verification (D-2b) misses an edge case where route is "valid" but semantically wrong (e.g. routes through a different pool with worse price) | Low | Mitigated by Cetus on-chain verification — even a "valid"-shaped route that's semantically wrong will fail on-chain at Cetus's input/output assertion. The structural check is layered defense, not the only line. |
| **R3** | 20.1's parallel-by-default amplifies BV 429 rate beyond what SPEC 19's retry layer can absorb | Medium | D-6's concurrency cap (=3 if no multi-token endpoint) explicitly ceiling-bounds fan-out to match the proven `fetchAddressDefiPortfolio` pattern. Telemetry on `external.retry_count{vendor:bv, outcome:exhausted}` will catch any escalation in the smoke. |
| **R4** | 20.3's CI mock drifts from real BV response shapes over time | Medium | Mitigated by the quarterly manual drill (Phase E runbook stays in place, just demoted from primary signal to spot-check). Any drift surfaces in the manual drill within 90 days at worst. |
| **R5** | Founder underestimates cost of typing `cetusRoute` end-to-end across engine + sdk + audric (D-1a) | Low | The Cetus route shape is already typed in `@cetusprotocol/aggregator-sdk`. We're just re-exporting + adding a serialization helper. ~50 LoC of types. |
| **R6** | 20.2's TTL re-validation (D-3b) introduces a new race condition where the route's source-of-truth differs between narration (uses `pending_action.cetusRoute`) and prepare (re-validates and may use a fresh route) | Medium | The structural verification only fires when the route's input/output coins MATCH but price impact has shifted. In that case, the prepare route returns the FRESH route in the response — narration on the resume turn uses the post-execution data anyway, not the quote-time data. This is consistent with current behavior. |

---

## What this SPEC does NOT solve (deferred to SPEC 21+ or out of repo)

- **Real-time portfolio push.** Eliminating wallet-stale-by-N-seconds requires BV WebSocket support that doesn't exist.
- **Speculative pre-prepare.** Building the prepare-route Tx before user confirms — wastes Enoki sponsor budget on declines. Defer until Enoki billing model changes.
- **Cross-instance route cache.** If we ever NEED a cross-instance cache (e.g. for shared route discovery across users), the structural answer is Redis. Not needed at current scale.
- **Stress / load testing.** Single-user perf, not throughput. New SPEC if 10k+ DAU.

## Cross-references

- Predecessor: SPEC 19 → `spec/SPEC_19_PERFORMANCE_RELIABILITY_SWEEP.md` (Phase C deferred to 20.2; D-1/D-3/D-6 pragmatic recs are 20.1/20.2/20.3 respectively)
- Closeout entry: S.135 → `audric-build-tracker.md`
- Outstanding bug fixed by 20.2: S19-F2 (LLM stale-route citation) — re-verified in v1.24.13 round-2 smoke
- Forward backlog row: 7c → updated at SPEC 20 closeout
- Cursor rules touched: `external-call-retries.mdc` (Phase F, may extend with new vendor entries), `metrics-and-monitoring.mdc` (SLO updates post-20.1)
- Phase E runbook (becomes spot-check post-20.3): `spec/runbooks/RUNBOOK_spec19_phase_e_bv_outage_drill.md`
