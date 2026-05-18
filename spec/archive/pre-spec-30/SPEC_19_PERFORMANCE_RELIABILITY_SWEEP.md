# SPEC 19 — Performance + Reliability Sweep

**Status:** **✅ FULLY CLOSED 2026-05-09 (S.131–S.135 build + S.137 acceptance smoke + S.138 founder sign-off)** — engine v1.24.8 → v1.24.14, audric web bumped + deployed. Phase C deferred to SPEC 20.2 (Vercel cross-function isolation blocker).
**Owner:** Founder + assistant
**Slot:** post-SPEC-18 sign-off; can parallelize with SPEC 11 (surface scopes don't overlap)
**Estimated effort:** ~3–4 days (actual: ~2.5d build + ~0.5d founder smoke + closeout)
**Promoted from:** S.126 Tier 2b (S.127 closeout)
**Build entry:** S.135 in `audric-build-tracker.md` (pages, files touched, lessons captured).
**Closeout entry:** S.137 in `audric-build-tracker.md` (acceptance smoke score: 5/5 G + 8/10 H + 5 new UX findings catalogued).
**Founder sign-off:** S.138 (Path A approved 2026-05-09 19:50 AEST — SPEC 20 then SPEC 21).
**Structural debt opened by this SPEC:** **SPEC 20 — Performance Architecture v2** (forward backlog row 7c) — the truly structural rebuilds (parallel-by-default `getPortfolio`, threading Cetus route through `pending_action`, automated chaos drills) that SPEC 19's pragmatic recs leave on the table. **SPEC 20.2 is now load-bearing:** the deferred Cetus route cache (Phase C) requires the `pending_action.cetusRoute` threading to land before any structural fix. Also fixes S19-F2 (LLM stale-route citation) as a side effect.
**UX debt opened by this SPEC:** **SPEC 21 — Agent Harness UX Polish** (forward backlog row 7d) — closes 4 of the 5 UX findings surfaced by S.137 acceptance smoke (S19-F3..F6). The 5th (S19-F7 stale route mismatch) closes structurally in SPEC 20.2.

**Final phase status:**

| Phase | Description | Status |
|---|---|---|
| A | Bounded post-write poll | ❌ regressed in production smoke; replaced by Option 3 |
| B | Pre-warmed indexer-catchup poll | ❌ regressed (same root cause as A); replaced by Option 3 |
| Option 3 | Skip post-write sleep entirely (v1.24.12) | ✅ shipped → -78% p50, -82% p99 on `engine.pwr.total_ms` |
| v1.24.13 cleanup | Retire broken safety net + strip pseudo-`<thinking>` tags | ✅ shipped → resume_stream p50 2.16s, p95 2.81s |
| C | Cetus route cache | ⏸️ DEFERRED to SPEC 20.2 (Vercel cross-function isolation blocker) |
| D | SLO publication | ✅ shipped in `audric/.cursor/rules/metrics-and-monitoring.mdc` |
| E | BV-outage drill | ✅ shipped in `spec/runbooks/RUNBOOK_spec19_phase_e_bv_outage_drill.md` (drill log opens Q3 2026) |
| F | Enoki/Sui retry audit + `external.retry_count` counter | ✅ shipped in v1.24.14 — BV + Anthropic + withSuiRetry all wired |
| G+H | Telemetry verification + closeout regression smoke | ✅ founder ran 2026-05-09 19:30 AEST — 5/5 G + 8/10 H (S.137); 5 new UX findings catalogued for SPEC 20.2 + SPEC 21 |

---

## TL;DR

S.126 (Tier 1 instrumentation + Tier 2a/2c/2f LLM tuning) shipped −31% on bundle perceived time (~24s → ~16-17s) and −19-23% on single swaps. The remaining latency tail is now **fixed overhead in the prepare/refresh path** — sequential network calls (BlockVision, Cetus, Enoki) and engine boot work that can be parallelized or prefetched. SPEC 19 attacks that tail with three structural changes (parallelize, prefetch, tighten cache) and adds production-grade reliability safeguards (p95 SLOs, circuit-breaker tuning, retry budgets) so the system stays fast AND degrades predictably under vendor failures.

**Targets:**
- Single swap perceived: ~10s → ~7-8s (−2-3s)
- Bundle perceived: ~16-17s → ~11-13s (−3-5s)
- Per-write resume: ~3.4s → ~2-2.5s (−1-1.5s)
- p95 latency SLOs published + alerted
- BV / Cetus / Enoki degradation paths tested + measured

**Out of scope:** any LLM model / prompt / effort tuning (S.126 covered that — diminishing returns). New SPEC entirely if more LLM-tier work is needed.

---

## Background — what S.126 surfaced

The Tier 1 telemetry shipped in S.126 gave us first-time visibility into the per-stage latency of every write. Across 12 production smokes, the bottleneck pattern is consistent:

| Stage | Single swap | Bundle | Notes |
|---|---|---|---|
| Proposal LLM phase | ~7-8s | ~10-12s | S.126 already attacked this |
| `/api/transactions/prepare` | 2.0-2.3s | 1.5-1.7s | **Composing 0.5s + Cetus discovery + Enoki sponsor 0.7-0.9s** |
| Sui PTB sign + execute | 0.0s (client-local) | 0.0s | Instant |
| `/api/transactions/execute` (Enoki + Sui wait) | 2.9-3.3s | 3.1-3.3s | `enoki_execute_ms` 0.8-1.2s + `sui_wait_ms` 2.1-2.2s |
| Resume narrate + post-write refresh | 3.2-4.3s | 3.2-3.6s | **Engine boot ~1s + 9 sequential BV calls ~1.2s + LLM 0.8-1.2s** |

The bolded items are SPEC 19's targets. They share a common pattern: **work that COULD be done in parallel is being done sequentially**, OR **work that COULD be prefetched is being computed at the moment of request**.

### The five concrete tails

1. **Post-write refresh fires 9 sequential BV calls** inside `resume_stream` (`getPortfolio` for the wallet → fetches balances + positions + prices serially through BlockVision). Visible as `bv.requests` cluster spanning ~1.2s in every resume log.
2. **Engine boot inside resume_stream** is ~1s (recipe registry, MCP manager check, Prisma reads for profile + memories + financial context). All of it runs serially before the LLM can be called.
3. **Prepare-route Cetus discovery** (`cetus.find_route_ms` ~0.5s) runs synchronously inside `/api/transactions/prepare` even though the route was already cached during the prior `swap_quote` LLM tool call. Re-discovery is wasted work.
4. **Enoki sponsor latency** (`enoki_sponsor_ms` 0.6-0.9s in prepare; `enoki_execute_ms` 0.8-1.2s in execute) is purely network — but the prepare and execute calls are split across two HTTP requests. There MAY be an opportunity to overlap parts of the second with client-side signing.
5. **Sui `waitForTransaction`** (`sui_wait_ms` ~2.1s) is the floor for on-chain settlement — IRREDUCIBLE without changing finality model. Documented as the floor, not a target.

### The reliability gaps

S.126's smokes also surfaced reliability questions we don't have answers to today:

- What's the p95 latency for each stage in production over 7d / 30d? (We have histograms; we don't have published SLOs.)
- What happens when BV returns 503 mid-portfolio-refresh? (Code has fallback paths; they haven't been exercised in production at meaningful frequency.)
- What's the Enoki sponsor 5xx rate? Do we retry? With what budget?
- The 9 sequential BV calls in post-write refresh — if 1 fails, does the LLM get a partial portfolio or an error? Is the partial-source flag correctly propagated?

SPEC 19 closes these gaps alongside the perf work because performance optimization without reliability instrumentation creates load-bearing assumptions that silently break.

---

## Scope

### IN SCOPE

| Phase | What | Estimated win | Effort |
|---|---|---|---|
| **A — Post-write refresh parallelization** | Audit `getPortfolio` call graph; parallelize the 9 sequential BV calls (or chunk + parallel-batch); verify `partialSource` flag still surfaces correctly when one chunk fails | −0.8-1.2s on EVERY write resume (single + bundle) | ~0.5d |
| **B — Engine boot prefetch** | Move recipe-registry / MCP-check / Prisma reads (profile / memories / financial context) into a pre-warm path that runs in parallel with the post-write refresh, not serially before it. | −0.5-1.0s on EVERY write resume | ~0.5d |
| **C — Prepare-route route cache** | Persist Cetus route from `swap_quote` tool call into request-scoped cache; reuse in `/api/transactions/prepare` instead of re-discovering. Bound TTL to ≤30s (matches quote freshness contract). | −0.4-0.5s on EVERY swap (single + bundle leg) | ~0.5d |
| **D — Production SLO publication + alerting** | Define p95 SLOs for `prepare_duration_ms`, `execute_duration_ms`, `resume_stream_duration_ms`, `enoki_sponsor_ms`, `enoki_execute_ms`. Add Datadog monitors that page on 1h breach. Document SLOs in this spec. | Reliability instrumentation, not perf | ~0.5d |
| **E — BlockVision degradation drill** | Force BV outage in staging; verify `partialSource: 'sui-rpc'` fallback fires; verify UI surfaces the degraded-data banner; verify the LLM prompt block correctly says "non-stable USD values not available". | Reliability validation | ~0.25d |
| **F — Enoki / Sui retry budget audit** | Audit current retry policy across `enoki_sponsor`, `enoki_execute`, `sui_wait_for_transaction`, `bv.requests`. Document the policy. If budget is unbounded or absent, add a max-3-attempts policy with exponential backoff for transient errors only (5xx / network timeout). 4xx never retries. | Reliability hardening | ~0.5d |
| **G — Wire telemetry for the new paths** | Every parallelization + prefetch + cache change emits its own `audric.perf.*` counter (cache hit/miss/age, parallel-batch outcome, prefetch race winner). | Verifiable smokes for B-C-D | ~0.25d |

### OUT OF SCOPE

- **Any LLM-tier work.** Model picker, prompt rules, effort classification — S.126 covered that. New SPEC if more is needed.
- **Sui `waitForTransaction` reduction.** That's the floor for on-chain settlement and tied to the consensus model. Documented but not optimized.
- **Cold-start onboarding perf** (Path 0 in SPEC 18). Different surface, separate concern, separate measurement.
- **PayButton / Audric-payer routing perf** (SPEC 11). Doesn't exist yet; perf measurement happens after it ships.
- **Multi-wallet / atomic-MPP perf** (SPEC 16). Paused.
- **Stress / load testing** (10k concurrent users). Single-user perf, not throughput. Different SPEC entirely if needed.

---

## D-Questions — ALL LOCKED 2026-05-09 (S.129)

> **Founder's structural-soundness question (2026-05-09):** "Is it all the right solution? No bandaid, all structurally best practice and scalable?"
>
> **Honest audit answer:** 3/6 are structurally optimal (D-2, D-4, D-5). 2/6 are pragmatic-with-headroom (D-1, D-3) — they ship 80% of the value at 30% of the cost and don't lock us out of the structural rebuilds, but they DO leave structural gain on the table. 1/6 is a cost-driven shortcut (D-6) that should be revisited at scale. **No bandaids in the "this'll break next week" sense.** All locked-in choices are forward-compatible. The structural rebuilds are tracked as **SPEC 20 — Performance Architecture v2** (forward backlog row 7c) for when SPEC 19 SLOs alarm or ~Q3 2026 quarterly review, whichever comes first.

| # | Question | Lock | Verdict | Structural debt (SPEC 20) |
|---|---|---|---|---|
| **D-1** | **Parallelization model for post-write refresh.** `getPortfolio` today calls BlockVision Indexer REST API for `balances`, `positions`, `prices` serially, then maps each token to its price serially. Should Phase A (a) parallelize the 3 top-level calls only via `Promise.all` — simpler, ~0.6s win, low risk; OR (b) chunk + parallel-batch every BV call including per-token prices — more complex, ~1.2s win, higher risk of race conditions on the in-process cache? | **(a)** — `Promise.all` of the 3 top-level calls. Smaller win but conservative; in-process cache has a year of hardening on the current sequential access pattern. | 🟡 Pragmatic | Truly structural answer: **redesign `getPortfolio` to be parallel-by-default at the architecture level** (concurrent fetcher composition, not "Promise.all in 3 places"). +1.5d, +~0.5–1s p50. → SPEC 20.1 |
| **D-2** | **Engine boot prefetch placement.** Phase B moves recipe / Prisma / financial-context reads into a parallel pre-warm. (a) Pre-warm INSIDE `resume/route.ts` BEFORE `createEngine` — narrowly scoped, only resume route benefits; (b) Pre-warm at the EDGE of every chat / resume route via a shared helper — broader scope, also benefits the chat route's first-message latency. | **(b)** — shared helper. Chat route's first-message latency has the same bottleneck (S.126 measured ~9s for first-swap proposal of which ~1s is engine boot). | ✅ Optimal | None — the canonical pattern. |
| **D-3** | **Cetus route cache scope.** Phase C persists the Cetus route discovered during `swap_quote` for reuse in `/api/transactions/prepare`. (a) In-process Map keyed by `(fromCoin, toCoin, amount)` — fast, no Redis cost, but doesn't survive between regions / serverless instances; (b) Redis-backed (`route:{address}:{fromCoin}:{toCoin}`) with 30s TTL — survives instance churn, costs 1 Redis read per prepare call. | **(a)** — in-process Map. Vercel serverless instances usually serve a user's full proposal-and-confirm cycle within the same instance lifetime (warm container reuse), so cache hit rate is high. Redis adds 20-50ms RTT per read, which eats most of the win. | 🟡 Pragmatic | Truly structural answer: **eliminate the cache entirely** by threading the Cetus route through the `pending_action` payload from quote → confirm → prepare. No cache means no cache invalidation, no cold-start misses, no cross-instance drift. Requires engine-side change (`PendingAction.cetusRoute` field) + signature verification on the prepare route. +1d. → SPEC 20.2 |
| **D-4** | **SLO targets.** Phase D publishes p95 SLOs. Should the targets reflect (a) current measured p95 (anchor to reality, low surprise); (b) demo-quality p95 with 20% headroom (aspirational, gives the team room to ship slow code without breaching); or (c) "best the architecture can deliver" (opinionated, will require P1 chasing on first regression)? | **(a) anchor + tighten quarterly** — measured p95 NOW so we have a baseline. Re-evaluate every quarter; tighten as the baseline improves. | ✅ Optimal | None — Google SRE Ch. 4 canonical pattern. |
| **D-5** | **Retry policy.** Phase F audits + standardizes retries. For transient errors (5xx, timeout, ECONNRESET), should the default be (a) 3 attempts with exponential backoff (100ms / 300ms / 900ms), (b) 5 attempts with longer backoff (200ms / 500ms / 1.2s / 3s / 7s), or (c) 1 attempt + surface error (no retry — let the user decide)? | **(a) 3 reads / 1 write split** — 3 attempts exp backoff for reads (BV, Sui RPC queries); 1 attempt only for writes (Enoki execute, Sui submit) because re-submit risks double-spend. | ✅ Optimal | None — asymmetric read/write retry is the canonical pattern for non-idempotent writes. (Idempotency keys could enable safe write retries — separate, larger redesign, not worth it at current scale.) |
| **D-6** | **Degradation drill cadence.** Phase E runs a manual BV-down drill once. After SPEC 19 closes, should we (a) make this a quarterly recurring drill (operational discipline, costs ~0.5d/quarter); (b) automate it as a synthetic test in CI that runs nightly (high signal, requires tooling work); or (c) drop it and rely on production telemetry (cheapest, lowest signal)? | **(a)** — quarterly manual drill. Automation cost (b) isn't justified at current scale; production telemetry (c) only catches bugs after they hurt users. | 🔴 Cost shortcut | Truly structural answer: **automated chaos test in CI** — regression-proof, catches the bug the day it's introduced. Quarterly manual drills decay as humans forget. +1.5d to build the chaos harness. → SPEC 20.3 |

**Lock summary:** All 6 D-questions locked with founder's "GO for launch" approval (S.129). Phases A–H proceed in order; structural debt deferred to SPEC 20.

---

## Phases

> **Time box:** entire SPEC 19 ≤ 4.0d. Each phase has a hard time cap. If a phase runs over, the founder is consulted to decide cut/continue.

### Phase A + B — POST-MORTEM: REVERTED in favor of Option 3 (S.133, engine v1.24.12)

> **Both phases shipped, both regressed production median post-write sleep wall-clock by +45% and worst-case by ~4× per founder smoke 2026-05-09 (10 writes).** Replaced by Option 3 (skip the wait entirely; non-blocking staleness counter as safety net). Phase A's `pollForIndexerCatchup` helper stays exported for a possible future re-introduction with a TRUE wall-clock cap (Phase A used `floor(ceiling/interval)` which doesn't account for per-iteration RPC time → "1500ms ceiling" was actually 1500ms + 7×RPC ≈ 3.4s typical / 6.4s with slow RPC). See S.133 for the full forensic + Option 3 design + acceptance gates.

### Phase A — Post-write refresh: bounded poll replaces fixed 1500ms sleep ⚠️ SHIPPED 2026-05-09 (S.131), REVERTED 2026-05-09 (S.133)

> **Phase A scope was REWRITTEN at implementation start.** The original spec (parallelize 3 BV calls in `getPortfolio`) was based on a wrong assumption about where the bottleneck lived. Phase A spike (engine v1.24.9 instrumentation) revealed:
>
> 1. The 3 top-level calls in `getPortfolio` are ALREADY parallelized via `Promise.allSettled` (line 155-159, since v0.54 SSOT rewrite April 2026)
> 2. `fetchAddressDefiPortfolio` already uses bounded-concurrency parallel fan-out (concurrency=3 across 9 protocols) per S18-F4 — DELIBERATELY bounded to avoid 429 rate limits
> 3. `runPostWriteRefresh` already runs refresh tools in parallel via `Promise.all`
>
> **The actual bottleneck:** the hardcoded 1500ms `setTimeout` in `runPostWriteRefresh` masking Sui RPC owned-coin index lag. Spike data: 59-64% of post-write refresh wall-clock. See S.131 in `audric-build-tracker.md` for the full forensic.

**Surface:** `packages/engine/src/post-write-poll.ts` (new), `packages/engine/src/engine.ts` `runPostWriteRefresh()`.

**Implementation (A1 — bounded poll-on-balance-delta):**
1. Capture baseline `Map<coinType, balance>` via Sui RPC `suix_getAllBalances` BEFORE cache invalidation.
2. Poll every 250ms for any balance delta vs baseline (new coin appeared / existing coin's balance changed / coin disappeared).
3. Exit early on first detected change → indexer caught up.
4. Hit defensive ceiling at 1500ms → exit (same correctness as old fixed sleep — never wait longer).
5. All failure modes fall back to fixed-sleep behavior (rpc missing, address missing, baseline throws, single poll throws).
6. `engine.pwr.sleep_ms` metric carries `outcome` (`detected_change` | `ceiling` | `aborted` | `fallback_*`) and `attempts` tags.

**Why A2 (non-blocking refresh) was REJECTED:** breaks v1.5 anti-hallucination guarantee — LLM would narrate from stale `<financial_context>` while fresh balance arrives via SSE side-channel.

**Why A3 (skip refresh on Haiku narrate-only) was REJECTED:** live bundle narrate cited `"Total savings now $14.73"` from `savings_info` refresh. A3 would force LLM to invent or omit that number.

**Tests:** 11 inline regression tests in `post-write-poll.test.ts` cover the full 9-case matrix (detected on first/later poll, new coin, coin disappearing, ceiling, aborted pre/mid, 3 fallback paths, fail-open recovery). Engine: 1042 tests pass (was 1031, +11 new).

**Acceptance (post-deploy):** `engine.pwr.sleep_ms` p50 drops from 1500ms → ~250-750ms (target: median ≥40% reduction). Zero regressions in `audric.harness.post_write_refresh_outcome` (still `outcome=ok`). `outcome=detected_change` ≥80% of writes (proves polling is working as designed).

**Ship:** commit `3fcffc4b`, engine v1.24.10. Founder verifies post-deploy with 5-write smoke.

### Phase B — Pre-warmed indexer-catchup poll overlaps with engine boot ⚠️ SHIPPED 2026-05-09 (S.132), REVERTED 2026-05-09 (S.133)

> **Phase B scope was REWRITTEN at implementation start.** The original plan ("extract Prisma reads into a prewarm helper") would have saved ~50-150ms — most of `createEngine`'s heavy work is already in `Promise.all` (7-way parallel). A pre-implementation audit of `engine-factory.ts` + `runPostWriteRefresh` revealed the real Phase B opportunity: the bounded indexer-catchup poll (post-A1, ~500ms median, 1500ms ceiling) runs SERIALLY after engine boot completes inside `runPostWriteRefresh`. Its only inputs (`suiRpcUrl` + `address`) are both known the moment a resume request lands, so it can run in parallel with the entire engine boot for free.

**Surface:** `packages/engine/src/types.ts` (new `EngineConfig.indexerCatchupPromise`), `packages/engine/src/engine.ts` `runPostWriteRefresh()`, `packages/engine/src/index.ts` (export `pollForIndexerCatchup`), `apps/web/app/api/engine/resume/route.ts`, `apps/web/lib/engine/engine-factory.ts`.

**Implementation:**
1. **Engine** — accept `EngineConfig.indexerCatchupPromise?: Promise<PostWritePollResult>`. If provided, `runPostWriteRefresh` awaits this Promise instead of starting a fresh `pollForIndexerCatchup`. On Promise rejection, falls back to a fresh poll (correctness preserved). Telemetry: `engine.pwr.sleep_ms` carries `source: 'pre-warmed' | 'engine'` so the host can verify the parallelization is shaving wall-clock.
2. **Engine** — export `pollForIndexerCatchup` + `PostWritePollResult` + `PostWritePollOutcome` + `PostWritePollOptions` from the public API so hosts can fire the poll directly.
3. **Audric resume route** — fire `pollForIndexerCatchup({...})` IMMEDIATELY after rate-limit (before `store.get` / Prisma / sessionSpend). Only fires when `approved` (declined writes have no on-chain state to wait for). The Promise's `.catch()` envelope swallows rejections to a console.warn — engine handles re-rejection. AbortController is wired through and fired on session-not-found short-circuit so the orphaned poll doesn't keep RPC-thrashing.
4. **Audric resume route** — parallelize the 3 serial pre-engine reads (`store.get`, `prisma.contacts`, `getSessionSpend`) via `Promise.all`. Saves ~80-150ms vs the prior chain.
5. **Audric engine-factory** — accept + forward `indexerCatchupPromise` opt to `QueryEngine.indexerCatchupPromise`. Chat route does NOT set this (chat turns aren't post-write resumes).

**Why "extract Prisma reads into a prewarm helper" was REJECTED:** `createEngine`'s heavy work is already a 7-way `Promise.all` bottlenecked by `getPortfolio`. The serial Prisma reads inside `createEngine` are ~50ms each, ~150ms total. Extracting them would save ~50-150ms — much smaller than the ~500-1500ms Phase B aimed for. The structural answer is to overlap engine boot with the post-write wait that follows it.

**Tests:** 3 new inline regression tests in `post-write-refresh.test.ts` cover the pre-warmed Promise resolved / rejected / undefined paths. Engine: 1045 tests pass (was 1042, +3 new).

**Acceptance (post-deploy):**
- `engine.pwr.sleep_ms` p50 with `source: 'pre-warmed'` ≥80% of writes (proves the Promise is consistently resolved when refresh starts → boot ≥ poll).
- `audric.engine.resume_stream_duration_ms` p50 drops ≥10% vs post-Phase-A baseline.
- Zero regressions on `engine.pwr.tool_ms` p50 (refresh tools must still complete on the same timeline — Phase B only changes WHEN we wait, not WHETHER we refresh).

**Ship:** commit `a67900f5`, engine v1.24.11. Founder verifies post-deploy with same 5-write smoke as Phase A.

### Option 3 — Skip the post-write sleep entirely ✅ SHIPPED 2026-05-09 (S.133, engine v1.24.12)

> **Replaces Phase A + B.** Founder smoke (10 writes, 5 single swaps + 5 save+swap bundles) showed Phase A regressed median sleep wall-clock by +45% and worst-case by ~4× — the bounded poll's `floor(ceiling/interval)` math doesn't cap wall-clock when per-iteration RPC time is non-zero, AND the baseline captures post-write state because the host's `sui_wait_for_transaction` already ran (~2.1s) before the resume request lands. 9/10 writes hit the ceiling (poll never detected delta), 1/10 won by luck.

**Counter-evidence supporting Option 3:** every one of the 10 narrations cited correct post-write balances ("Saved 0.3 USDC and swapped 0.04 SUI for 0.0437 USDC. Your NAVI savings now total $16.32") — including write 9 where `sleep_ms=0`. By the time refresh tools fire (after ~2.9s of indexer settling time inherited from the host's execute flow + resume boot), the indexer is already caught up.

**Surface:** `packages/engine/src/engine.ts` `runPostWriteRefresh()`, `packages/engine/src/types.ts` (remove `EngineConfig.indexerCatchupPromise`), `apps/web/app/api/engine/resume/route.ts` (remove pre-warm), `apps/web/lib/engine/engine-factory.ts` (remove `CreateEngineOpts.indexerCatchupPromise`).

**Implementation:**
1. Strip the `await pollForIndexerCatchup` block from `runPostWriteRefresh`. Refresh tools fire immediately after cache invalidation.
2. Replace `engine.pwr.sleep_ms` histogram with `engine.pwr.skipped_sleep_count` counter (one per refresh, tagged `has_wallet` + `can_safety_net`).
3. Add **non-blocking staleness safety net**: capture pre-invalidation Sui RPC wallet snapshot in the background; after refresh tools complete, fire a second background fetch and compare. If identical, emit `engine.pwr.observed_stale_balance_check{stale="1"}` counter. Pure observability — never blocks narration, never retries, never throws.
4. Remove `EngineConfig.indexerCatchupPromise`, `QueryEngine.indexerCatchupPromise`, `CreateEngineOpts.indexerCatchupPromise`. Remove host-side pre-warm + AbortController.
5. **Keep** `pollForIndexerCatchup` exported from `index.ts` and the parallelized 3-way reads in resume route (~80-150ms win is real). Future re-introduction would wrap the helper in `Promise.race(loop, setTimeout(800ms))` for a TRUE wall-clock cap.

**Tests:** 3 new `[SPEC 19 Option 3]` regression tests in `post-write-refresh.test.ts` (replaced 3 indexerCatchupPromise tests). Engine: 1045 tests pass — same count as Phase B.

**Acceptance (post-deploy, founder verifies):**
- `engine.pwr.skipped_sleep_count` fires on **100%** of writes
- `engine.pwr.sleep_ms` histogram fires on **0%** of writes (metric removed)
- `audric.engine.resume_stream_duration_ms` p50 drops **≥40%** vs Phase A+B baseline (5121ms → ~2900ms)
- `audric.engine.resume_stream_duration_ms` p99 drops **≥60%** vs Phase A+B baseline (10023ms → ~3500ms)
- All 10 smoke narrations remain numerically correct (no hallucinated balances)
- `engine.pwr.observed_stale_balance_check{stale="1"}` rate **≤ 5%** of `engine.pwr.skipped_sleep_count` over 24h. If clean → close loop. If above 5% → re-add a short bounded wait with TRUE wall-clock cap.

**Ship:** commit `9eb545fc`, engine v1.24.12.

### Option 3 — v1.24.13 cleanup: retire broken safety net + add `<thinking>` tag strip ✅ SHIPPED 2026-05-09 (S.134)

> **Two follow-on fixes after the v1.24.12 production smoke** (10 writes, same prompts as the Phase A+B smoke).

**Findings from the post-Option-3 smoke:**

1. **Engine layer worked exactly as designed.** `engine.pwr.skipped_sleep_count` fired on 100% of writes. `engine.pwr.sleep_ms` histogram fired on 0% of writes. `engine.pwr.total_ms` p50 dropped to 723ms (vs Phase A+B's ~3300ms = -78%); p99 dropped to 1369ms (vs Phase A+B's 7672ms = -82%). All 10 narrations cited correct post-write balances.
2. **Safety net was a 100% false positive.** `engine.pwr.observed_stale_balance_check{stale="1"}` fired on 7/7 captured writes. Investigation revealed a fundamental design flaw: both Sui-RPC snapshots are captured AFTER the write was already settled on-chain (we're inside `runPostWriteRefresh`, which only runs post-execution). Baseline = post-write state. Post-fetch = post-write state. Always identical. The counter promised "the indexer hadn't moved during the refresh window" but actually measured "nothing changed between two snapshots taken inside the same observation window after the write was already on-chain for 2.1s+." Detecting actual staleness requires pre-write state from outside the engine — not worth building when empirical narration accuracy across BOTH smokes (10/10 numerically correct, twice in a row) is the proof.
3. **Haiku `<thinking>` leak escalated from P2 to P0 latency regression.** S19-F3 was filed in S.133 as a known annoyance. Post-Option-3 smoke showed it ballooning: bundle 2's narration emitted **2271 output tokens** for what should be a 30-token receipt, driving `anthropic.latency_ms` to **21938ms** (~10× expected). Bundle 3 hit 14062ms / 1208 tokens. The user-visible text was clean (audric UI strips `<thinking>` tags before render) — but the model still produced 2200+ tokens of pseudo-thinking content that got billed, persisted, cache-written, and streamed to the client over 22 seconds.

**Surface:** `packages/engine/src/engine.ts` (remove safety net + add strip helper + apply at all 7 assistant-message persist sites), `packages/engine/src/__tests__/post-write-refresh.test.ts` (replace v1.24.12 safety-net tests), `packages/engine/src/__tests__/engine.test.ts` (5 new strip tests).

**Implementation:**
1. Remove `safetyNetBaseline` capture before cache invalidation.
2. Remove the entire background diff block + `engine.pwr.observed_stale_balance_check` counter.
3. Remove `walletStateChanged` helper (only consumer was the safety net).
4. Remove unused `fetchWalletCoins` import in `engine.ts` (still used elsewhere — not removed there).
5. Drop `can_safety_net` tag from `engine.pwr.skipped_sleep_count` (no longer meaningful).
6. Add `stripPseudoThinking(blocks)` helper — lazy-matches `<thinking>…</thinking>` (case-insensitive, multi-line, handles unterminated tags), trims whitespace, drops empty text blocks, injects `[narration omitted]` placeholder if entire content is stripped (preserves Anthropic API role-alternation invariant).
7. Apply at all 7 `this.messages.push({ role: 'assistant', ... })` sites: pending_action restore, pendingInput restore, end_turn / no remaining tools, signal-aborted, guard-blocked, max-bundle-ops error, auto-approved tools.

**Why strip on persist (not on stream):** the audric UI already filters `<thinking>` before render (per smoke transcripts). Strip-on-persist doesn't reclaim in-flight tokens (real fix is an audric system-prompt change to forbid `<thinking>` markup), but it stops `<thinking>` content from polluting `cache_read` context on every subsequent turn. Cleaner cache, less context pressure, less risk of the model getting confused by stale pseudo-thinking in history.

**Tests:** 4 updated tests in `post-write-refresh.test.ts` + 5 new tests in `engine.test.ts`. 1051/1052 engine tests pass (1 pre-existing skip).

**Acceptance (post-deploy, founder verifies):**
- `engine.pwr.skipped_sleep_count` still fires on **100%** of writes (regression check on Option 3 path).
- `engine.pwr.observed_stale_balance_check` is **never emitted** (alerting team can drop the metric).
- `engine.pwr.skipped_sleep_count` tag is `{has_wallet}` only (no `can_safety_net`).
- `audric.engine.resume_stream_duration_ms` p50 holds at **≤3000ms** (Option 3 win, no regression from the strip).
- All 10 smoke narrations remain numerically correct.
- Persisted history is clean — spot-check next session for `assistant: [text(<thinking>...)]` blocks (should be zero).

**What v1.24.13 does NOT solve:**
- **In-flight Haiku narrate latency on bundle turns.** v1.24.13 strips on persist, NOT on stream. The model still produces the 2200-token `<thinking>` content during `anthropic.latency_ms`. To fix the wall-clock regression, audric needs to update the post-write resume system prompt to forbid `<thinking>` markup ("This model has no native thinking. Output ONLY the user-facing receipt narration in 1-2 sentences. Do NOT use `<thinking>...</thinking>` tags."). Filed as a follow-up; ~10 LoC audric change, no engine release.

**Ship:** engine v1.24.13.

### Phase C — Prepare-route Cetus route cache (~0.5d, hard cap 6h)

**Surface:** `apps/web/lib/engine/tools/swap-quote.ts` + `apps/web/app/api/transactions/prepare/route.ts` + a new `apps/web/lib/engine/route-cache.ts` helper.

**Steps:**
1. In `swap_quote` tool execution, after a successful Cetus discovery, persist the resolved route into an in-process `Map<routeKey, { route, expiresAt }>` keyed by `(fromCoin, toCoin, amount, ±5% slippage)`. TTL = 30s (matches quote freshness contract).
2. In `/api/transactions/prepare`, before re-running `cetus.find_route`, check the cache. On hit, skip discovery; on miss, run discovery and populate the cache.
3. Add `audric.cetus.route_cache_hit` (counter, tag: `hit` | `miss` | `stale`).
4. Smoke: 3 swaps in sequence; verify swap 2 + 3 hit the cache (swap 1 populates it).

**Acceptance:** `audric.cetus.route_cache_hit` cache-hit rate ≥70% on the 3-swap smoke. `prepare_duration_ms` for swaps drops by ≥0.4s on cache hits.

### Phase D — Production SLO publication + alerting (~0.5d, hard cap 6h)

**Surface:** `metrics-and-monitoring.mdc` (cursor rule) + Datadog dashboard + Datadog monitor configs.

**Steps:**
1. Pull 7d production p95 baseline from Datadog for: `prepare_duration_ms`, `execute_duration_ms`, `resume_stream_duration_ms`, `enoki_sponsor_ms`, `enoki_execute_ms`, `sui_wait_ms`, `chat_stream_duration_ms`.
2. Document each metric's definition + p95 baseline + SLO target (per D-4: "anchor to current measured p95") in `metrics-and-monitoring.mdc`.
3. Create Datadog monitors for each metric: alert at p95 > target sustained for 1h.
4. Document the runbook for each alert (likely vendor-specific: "if `enoki_sponsor_ms` p95 > 2s, check Enoki status page first").
5. Wire alerts to the operational Slack / Discord channel (whichever is the on-call destination).

**Acceptance:** SLO table is published in `metrics-and-monitoring.mdc`. ≥7 monitors are live in Datadog. ≥1 test alert fires successfully (manually trigger via dashboard query).

### Phase E — BlockVision degradation drill (~0.25d, hard cap 3h)

**Surface:** Staging env + `apps/web/lib/blockvision.ts` mock injection.

**Steps:**
1. In staging, set `BLOCKVISION_API_KEY=invalid_for_drill`. Verify env-gate doesn't reject (key is non-empty; the API itself returns 401).
2. Run a portfolio fetch. Observe: degradation banner renders, prices show null for non-stable assets, stable allow-list (USDC=1, USDT=1, USDsui=~1) still produces correct USD valuations.
3. Run a `balance_check` LLM tool call. Observe: tool result includes `defiSource: 'sui-rpc'` provenance flag, displayText surfaces "BlockVision indexer unavailable, showing Sui RPC + stable allow-list only".
4. Run a swap proposal. Observe: LLM does NOT propose a price-impact-sensitive trade against null-priced tokens; if user asks, agent says "I can't price NAVX without BlockVision; let me know if you want me to proceed at any-price".
5. Restore real key. Verify portfolio refresh + LLM responses return to BV-sourced.

**Acceptance:** All 4 observation steps behave as expected. Any deviation is filed as a P1 bug + fixed before SPEC 19 closes.

### Phase F — Enoki / Sui retry budget audit (~0.5d, hard cap 6h) ✅ SHIPPED 2026-05-09 (S.135, engine v1.24.14)

**Surface:** `apps/web/lib/sui-retry.ts` + `packages/engine/src/blockvision-prices.ts` + `packages/engine/src/providers/anthropic.ts` + `audric/.cursor/rules/external-call-retries.mdc` (canonical policy doc).

**What shipped:**
1. ✅ Audited 10 external call sites (3 critical-path retried + 7 cold/LLM-tier intentionally not). See `external-call-retries.mdc` for the full audit table.
2. ✅ Standardized per D-5: 3 attempts for reads (BV at 250→750ms exp, Anthropic at 1000→2000→4000ms exp); 5 attempts for `withSuiRetry` (extension justified by S18-F17 burst-50 contention); 1 attempt for writes (Enoki sponsor/execute, Sui submit).
3. ✅ Policy documented in `audric/.cursor/rules/external-call-retries.mdc` with the 10-site audit, the D-5 contract table, the `MUST NOT happen` examples, and the criteria for extending retry to a new site.
4. ✅ Added unified `external.retry_count` counter (engine-namespaced, vendor-tagged: `bv|anthropic|sui`, outcome-tagged: `first_try|retried_success|exhausted`, attempts-tagged: `1`-`5`).

**Telemetry semantic (intentional):** the metric describes the **retry layer's behavior**, not the call's success/failure. `first_try` covers both "succeeded on first call" AND "non-retriable error on first call" — the retry layer correctly didn't burn retries either way. `exhausted` only fires when retries actually were burned and the layer gave up (max attempts hit OR circuit breaker tripped). This makes the metric directly answer "is the retry layer earning its keep?" without noise from non-retriable failures (which are tracked separately via `bv.requests{status}`, `audric.txn.*_outcome_count`).

**Tests added:** 5 in `packages/engine/src/__tests__/blockvision-retry.test.ts` (BV outcome matrix incl. 4xx-as-first_try and CB-open-as-exhausted), 5 in `apps/web/lib/sui-retry.test.ts` (Sui outcome matrix incl. non-transient-as-first_try and exactly-once emission).

**Acceptance:** ✅ Every retried external call site emits `external.retry_count`. ✅ The policy doc exists. ⏳ Counter emission in production verified by Phase G (post-deploy smoke).

### Phase G — Wire telemetry for the new paths (~0.25d, hard cap 3h)

**Rolling work folded into Phases A-C-F.** Already enumerated:
- A → ~~`audric.portfolio.fetch_concurrency` + `audric.portfolio.fetch_duration_ms`~~ — superseded by Option 3 (`engine.pwr.skipped_sleep_count`)
- B → ~~`audric.engine.prewarm_race_winner`~~ — superseded by Option 3 (no pre-warm)
- C → ~~`audric.cetus.route_cache_hit`~~ — Phase C SKIPPED (architectural blocker, deferred to SPEC 20.2)
- F → `external.retry_count{vendor, outcome, attempts}` (engine-namespaced; Audric+engine emit through one counter)

Phase G is the cross-check: verify the live counter is emitting from BV + Anthropic + Sui retry paths before merging to main.

**Acceptance:** Datadog dashboard query shows non-zero counts for all 4 metrics within 10 minutes of the smoke.

### Phase H — Closeout regression smoke (~0.25d, hard cap 3h)

Same 3-write smoke pattern S.126 used (single swap × 2 + bundle). Compare per-stage latency against pre-SPEC-19 baseline. Expected:

| Stage | Pre-SPEC-19 | Post-SPEC-19 target | Total saved |
|---|---|---|---|
| Single swap perceived | ~10s | ~7-8s | −2-3s |
| Bundle perceived | ~16-17s | ~11-13s | −3-5s |
| Per-write resume | ~3.4s | ~2-2.5s | −1-1.5s |

**Acceptance:** ≥2 of the 3 targets met. (We allow 1 miss because real production has variance and 3-of-3 is sometimes blocked by external vendor blips out of our control.)

---

## Acceptance gates

| Gate | Pass criterion | Phase |
|---|---|---|
| **G1** | Phase A: `audric.portfolio.fetch_duration_ms` p50 drops ≥30% | A |
| **G2** | Phase A: 0 `partialSource: 'partial'` regressions on the smoke | A |
| **G3** | Phase B: `audric.engine.prewarm_race_winner` shows `prewarm_won` ≥80% | B |
| **G4** | Phase B: resume_stream_duration p50 drops ≥15% | B |
| **G5** | Phase C: `audric.cetus.route_cache_hit` ≥70% on 3-swap smoke | C |
| **G6** | Phase C: `prepare_duration_ms` for swaps drops ≥0.4s on cache hits | C |
| **G7** | Phase D: ≥7 Datadog monitors live + 1 test-alert verified | D |
| **G8** | Phase E: All 4 BV-degradation observations behave as expected | E |
| **G9** | Phase F: Every external call site matches the documented retry policy | F |
| **G10** | Phase H: ≥2 of 3 perf targets met on closeout smoke | H |

---

## Risks

1. **R1 — Parallelization introduces race conditions in the in-process cache.** Mitigation: D-1 selects the conservative option (a) parallelize only the 3 top-level calls, not the per-token chunks. The in-process cache's mutation paths are unchanged.
2. **R2 — Prefetch races against engine init and loses sometimes.** Mitigation: G3 measures the race winner explicitly; if `prewarm_won` < 80%, we revisit the placement (Phase B's hard cap is 6h — if we miss the threshold in that window, we ship a partial improvement and document the residual gap).
3. **R3 — Cetus route cache returns stale routes after price moves.** Mitigation: 30s TTL matches the existing quote-freshness contract. The engine's swap-execute guard re-validates against current price impact before signing, so a stale route gets caught at preflight, not at on-chain failure.
4. **R4 — SLO targets anchored to current p95 lock in mediocre baselines.** Mitigation: D-4 explicitly mandates quarterly tightening. The first SLO is a baseline, not a goal.
5. **R5 — BV degradation drill in staging surfaces a real bug we have to fix mid-SPEC.** Mitigation: time-boxed at 3h; if the drill surfaces a P1, file the bug, defer to a hotfix outside SPEC 19, and continue. Phase E doesn't gate Phase F or H.
6. **R6 — Retry policy change causes upstream load amplification (we're now retrying things vendors charge for).** Mitigation: D-5 caps reads at 3 attempts and writes at 1. Any retry policy increase requires a separate SPEC + vendor cost analysis.

---

## Forward-pointer — SPEC 20 — Performance Architecture v2

**Trigger:** SPEC 19's pragmatic recs (D-1, D-3, D-6) leave structural gain on the table. Schedule SPEC 20 when ANY of the following fires:

1. **SPEC 19 SLOs alarm** on cache-miss-driven p95 regression (signal: `audric.cetus.route_cache_hit` cache-hit rate falls below 50% sustained — proves cold-start churn is killing the in-process Map).
2. **A second prod incident** reveals a parallel-fetch missed gap in `getPortfolio` (signal: any P0 / P1 traced to "BV call X took 2s while BV call Y waited").
3. **~Q3 2026 quarterly review** (calendar trigger — even if no incidents, structural debt should be revisited every quarter).

**Estimated scope:** ~4d. Three sub-phases:

| Sub-phase | What | From | Win |
|---|---|---|---|
| **20.1** | Redesign `getPortfolio` as parallel-by-default — concurrent fetcher composition at the architecture level, not Promise.all sprinkled in 3 places | D-1 | +0.5–1s p50 |
| **20.2** | Thread Cetus route through `pending_action.cetusRoute` + signature verification on prepare — eliminate the in-process Map cache entirely | D-3 | More predictable; no cold-start cache miss |
| **20.3** | Automated chaos drill in CI (BV outage, Enoki 5xx, Sui RPC timeout) — replace quarterly manual with regression-proof nightly | D-6 | Catches degradation regressions immediately, not 90 days later |

**Out of scope for SPEC 20:** Frontend perf (bundle size / Edge runtime / connection pooling — those are separate dimensions, not part of "performance architecture v2" of the AI-agent transaction path).

---

## Cross-references

- Closeout decision → S.127 in `audric-build-tracker.md`
- Promoted from → S.126 Tier 2b (deferred during S.126's LLM-tier work)
- Locked at → S.129 in `audric-build-tracker.md`
- Telemetry shipped in S.126 Tier 1 → `apps/web/lib/engine/txn-metrics.ts`
- Canonical portfolio → `apps/web/lib/portfolio.ts` + `.cursor/rules/single-source-of-truth.mdc`
- BlockVision resilience → `.cursor/rules/blockvision-resilience.mdc`
- Existing perf metrics → `.cursor/rules/metrics-and-monitoring.mdc`
- Structural debt opened → forward backlog row 7c (SPEC 20 — Performance Architecture v2)

---

## Open questions (post-D-questions, surfaced during scoping)

- **OQ-1.** Should Phase B's `prewarmEngineContext` be a `LRU<address, ContextSnapshot>` cache rather than a per-request prefetch? Deferred — start with per-request prefetch; if production telemetry shows the same address re-keys within seconds (likely for active users), revisit.
- **OQ-2.** Phase D's SLO publication — where canonically should SLOs live? Cursor rule + Datadog seems right but may want a `docs/SLOs.md` for the public-facing record. Defer to founder preference at sign-off.
- **OQ-3.** Should we add `sui_wait_ms` to the per-write narrate UI ("settled in 2.1s")? Pure UX; not in scope but easy to add post-SPEC-19 if founder wants the on-chain time visible.
