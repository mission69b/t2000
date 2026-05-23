# SPEC 272 — BlockVision/DeFi cron rate-limits + abort hangs

> Status: **LEVER 1 SHIPPED (S.278, 2026-05-23 ~19:00 AEST)** · Lever 2 + Lever 3 deferred pending 3-day post-deploy metric review.
> Author: agent (2026-05-23 ~18:25 AEST initial draft; updated post-Lever-1 ship).
> Trigger: HANDOFF_NEXT_AGENT.md row 0.7 (S.272), backlogged via the May 2026 audric production logs.
> Owner: founder triage on Lever 2 + 3 after post-deploy metrics observed.

---

## Ship log (top of doc — fastest read for the next agent)

| Lever | Status | Shipped in | Notes |
|---|---|---|---|
| 1 — Cron user-batching (N=10, M=500ms) | ✅ SHIPPED | S.278 (audric) | `apps/web-v2/lib/jobs/{batch-runner,financial-context-snapshot,portfolio-snapshot}.ts`. No engine bump. Test gates 17/17 green. |
| 2 — `Retry-After` → cache TTL propagation | ⏸ DEFERRED | — | Pending 3-day metric review post-Lever-1. Lever 1 alone may resolve the failure mode. |
| 3 — AbortController coordination on CB-open | ⏸ DEFERRED | — | Same gate as Lever 2. |

**Decision gate for Lever 2 + 3:** If 3 consecutive cron runs (1 day each, both crons) show `cron.fin_ctx_shard_duration_ms` p95 < 60s AND `degradedSkipped ≤ 1` → close S.272 fully (mark Lever 2 + 3 explicitly deferred). Otherwise, revisit scoping with fresh telemetry.

---

## Problem statement (ground-truthed)

The 02:30 UTC `financial-context-snapshot` cron (`apps/web-v2/app/api/cron/financial-context-snapshot/route.ts`) periodically fails with this pattern:

1. **Circuit-breaker OPEN** events in BV retry layer (`packages/engine/src/blockvision-prices.ts:138`).
2. **9-protocol DeFi adapter HTTP 429 storms** (`fetchAddressDefiPortfolio` fans out 9 protocols at concurrency=3 → 3 batches per user, `blockvision-prices.ts:1055-1065`).
3. **`AbortError` flurries** mid-fetch when the per-protocol 2s timeout fires (`DEFI_PORTFOLIO_TIMEOUT_MS = 2_000`, `blockvision-prices.ts:1019`).
4. **Vercel 300s `maxDuration` timeout** — the route hits the cap before completing the user loop.
5. ~6 user snapshots skipped per cron run (their `getPortfolio()` returns `defiSource === 'degraded'` or `source === 'sui-rpc-degraded'` → S.235 gate at `lib/jobs/financial-context-snapshot.ts:134-142` skips the upsert).

### Why this is NOT (yet) load-bearing for chat

The existing defense-in-depth absorbs the failure:

- **Sticky-positive DeFi cache** (`packages/engine/src/blockvision-prices.ts:1042` — 15s fresh / 30 min sticky `partial-stale`) — chat reads cached positive values during BV bursts rather than serving zeros.
- **Process-local circuit breaker** (`blockvision-prices.ts:124-146` — 10×429s in 5s → OPEN for 30s) — prevents retry amplification during sustained outages.
- **S.235 cron-skip gate** (`financial-context-snapshot.ts:134-142`) — when BV degrades mid-loop, the user's previous-day UFC row stays untouched instead of being overwritten with zeros. 24h-old positive data beats fresh zeros every time.

The bug class S.272 fixes is **operational** (cron-skip messages observable in logs; wasted Vercel function-minutes; one degraded run cuts UFC freshness from 24h to ~48h for the skipped users), not user-facing.

### Why this matters anyway

Three reasons to fix it now (vs. defer further):

1. **The 07:00 UTC `portfolio-snapshot` cron** (`lib/jobs/portfolio-snapshot.ts`) fans out the SAME `getPortfolio()` against the SAME ~165 active users. Same failure mode at a different time. The two crons are independent but share the vendor-pressure pattern.
2. **The audit-tracker shows the pattern is sustained** — multiple runs per week per HANDOFF row 0.7. Not a one-off; structural.
3. **Free function-minutes ceiling** — Vercel's hobby/pro plan caps cron runs at maxDuration (300s). When cron hits the cap, the user-loop tail (~6 users) gets no UFC update that day. Over a week that's 42 user-days of stale UFC for those users.

---

## What this SPEC does NOT touch (deliberately)

Per `coding-discipline.mdc` (surgical changes) and `single-source-of-truth.mdc`:

- ❌ Do **not** refactor `blockvision-prices.ts` (2009 LoC) into smaller files. That's PIPELINE-AUDIT-PHASE-2 / Track S1 (`spec/active/AUDIT_ON_CHAIN_PIPELINE_2026-05-23.md`), a separate ~1d pure refactor. Coordinate so PR-2 doesn't merge mid-refactor, but no scope merge.
- ❌ Do **not** replace BlockVision with native Sui-RPC + per-protocol decoders. That's PIPELINE-AUDIT track S7 (rejected). BV is doing genuinely hard work.
- ❌ Do **not** introduce a new shared cron infrastructure layer. Two crons share a fetcher; that's not enough to justify abstraction (`engineering-principles.mdc` §6 — "factor when LOGIC duplicates, not when SHAPE does").
- ❌ Do **not** ship lever 2 (Retry-After cache TTL propagation) without lever 1 — Retry-After is rare in practice (BV emits it on hard 429s only); the dominant cost is per-user fan-out shape, fixed by lever 1.
- ❌ Do **not** change the 02:30 UTC / 07:00 UTC schedule. Those are downstream-coupled (UFC `recentActivity` reads PortfolioSnapshot from previous day; chat reads UFC at session start).
- ❌ Do **not** change `DEFI_PROTOCOL_CONCURRENCY = 3`. That's already the tuned compromise (S18-F4, `blockvision-prices.ts:1094`).

---

## The 3 levers (founder-prescribed in HANDOFF row 0.7)

Each lever can ship independently. Cumulative effort: ~1d if all three; ~3h for lever 1 alone.

### Lever 1 — Cron user-batching with intra-batch delay (HIGHEST IMPACT)

**Site:** `apps/web-v2/lib/jobs/financial-context-snapshot.ts` (line 113 — the `for (const user of users)` loop) + parallel change in `lib/jobs/portfolio-snapshot.ts:45`.

**Today:** Users processed strictly sequentially. Each user fires a 9-protocol DeFi burst (3 batches × 2s = up to 6s) + 1-2 other parallel calls. At 165 users × ~2s typical = ~330s — **JUST OVER Vercel's 300s `maxDuration` cap**. When BV slows (typical 2-3s per-protocol cold cache), users near the tail get cut off.

**Proposed:** Batch users into groups of N (e.g. 10) and process each batch in parallel via `Promise.allSettled`, with a fixed intra-batch delay of M ms (e.g. 500-1000ms) between batch starts. Rationale:

- **Per-batch BV pressure stays bounded.** 10 users × 9 protocols (with engine-side concurrency=3 inside each user) = 30 in-flight BV requests at peak per batch. Well below the ~30 QPS/key soft cap inferred from CB threshold (10 in 5s = 2 QPS sustained).
- **Total runtime drops dramatically.** 165 / 10 = 17 batches × max(batch-completion, intra-batch-delay) ≈ 17 × ~3s = ~51s. Comfortable inside maxDuration with headroom for slow days.
- **Per-user errors stay isolated.** `Promise.allSettled` per batch — one bad user doesn't abort the batch; the existing `try/catch err++` stays untouched.

**Open Q (founder lock needed):** batch size N + intra-batch delay M. Recommended defaults: **N=10, M=500ms**. Test plan below validates by measuring `cron.fin_ctx_shard_duration_ms` histogram + per-batch BV `bv.requests` counters.

**Tradeoffs:**

- **Pro:** Eliminates the dominant failure mode (Vercel timeout from sequential-loop slowness).
- **Pro:** Smooths BV pressure even when no BV-side issue (good citizen).
- **Pro:** Surgical change — ~30 LoC per job, no new abstractions, no new env vars.
- **Con:** Slightly higher peak concurrent BV load during the batch (10× per-user fan-out instead of 1×) — but well below the per-key cap.
- **Con:** Per-batch slowest-user determines batch completion time. Slow protocols (e.g. cetus cold cache) become more visible. Acceptable: still inside the per-batch ~3s envelope.

**Verifiable goal:**
1. Add a benchmark/smoke that runs `runFinancialContextSnapshotJob` against a fixture of 50 mock users → asserts total runtime < 30s (vs. baseline ~80-100s sequential).
2. Post-deploy: monitor `cron.fin_ctx_shard_duration_ms` for 7 days; target p95 < 60s (vs. current p95 hitting 300s ceiling).

### Lever 2 — `Retry-After` header → cache TTL propagation

**Site:** `packages/engine/src/blockvision-prices.ts:262` (where `Retry-After` is read inside `fetchBlockVisionWithRetry`) + the DeFi fetcher's cache write path (~line 1413-1440 in the same file — sticky-positive write rules).

**Today:** `Retry-After` is honored **inside** the retry sleep (capped at 5s, `BV_RETRY_AFTER_CAP_MS`), but the value is dropped after the retry completes. If BV returns `Retry-After: 30` and our retry sleeps 5s then fails on the next attempt, the upstream cache layer has no idea BV asked us to wait. The next request for the same address fires another fan-out into the same throttled key.

**Proposed:** When `fetchBlockVisionWithRetry` exhausts retries with the last response carrying a `Retry-After` header, propagate that hint upward via the return type:

```typescript
// New shape — extend the existing return (currently just `Response`).
// Use a sidecar Map keyed by request-id or via the response's headers
// (already on the Response object — just need the caller to inspect).

// Caller side (defi.ts cache write):
const retryAfterMs = parseRetryAfter(response); // existing header
if (retryAfterMs && response.status === 429) {
  // Push the rate-limit hint into the cache: a "deny window" entry
  // that suppresses upstream re-fetches for that address until
  // `Date.now() + retryAfterMs` passes.
}
```

The "deny window" is a NEW cache state — distinct from `partial-stale` (which serves stale-but-positive). A deny-window hit returns the most recent sticky-positive entry (if any) OR a degraded shape (if no sticky positive). Either way, **no upstream BV call fires** during the deny window.

**Open Q (founder lock needed):** Should we add a NEW cache state (`deny-window`) or piggyback on `partial-stale` TTL extension? Recommended: extend the EXISTING sticky-positive entry's TTL by the `Retry-After` hint — simpler, no new state.

**Tradeoffs:**

- **Pro:** Honors vendor signal explicitly — when BV says "wait 30s", we wait 30s instead of re-firing fan-outs that will all 429.
- **Pro:** Composable with lever 1 — batching already spaces fan-outs, propagation prevents tail-user fan-outs from cascading.
- **Con:** New cache state semantics (or extended TTL semantics) — risk of cache poisoning if BV mistakenly emits `Retry-After` on a healthy call.
- **Con:** `Retry-After` is rare in practice — most BV throttling shows up as bare 429 with no header. Lever 2's impact is smaller than lever 1.

**Verifiable goal:**
1. Add unit test: feed `fetchBlockVisionWithRetry` a mocked 429 response with `Retry-After: 10` header → assert the next call for the same address within 10s skips the fetch and serves cache.
2. Post-deploy: monitor a new counter `bv.deny_window_skips{kind=defi|wallet}` — target 5-50 skips per cron run on bad days, 0 on good days.

### Lever 3 — AbortController coordination on CB-open

**Site:** `packages/engine/src/blockvision-prices.ts:1294-1336` (the DeFi fan-out's `inflight` Promise + `mapWithConcurrency` worker pool).

**Today:** When the circuit breaker opens MID fan-out (after batch 1 of 3 emits 10×429s), the OPEN signal doesn't propagate to in-flight requests in batches 2 and 3. They keep running until each hits its own 2s per-protocol timeout, producing `AbortError` flurries when the timeout fires. The cron pays the full 2s × 6 remaining protocols × ~3 batches = up to 18s of wasted wall time per affected user.

**Proposed:** Wire an `AbortController` into the fan-out:

```typescript
// Inside the inflight Promise body:
const fanoutAbort = new AbortController();

// Wire the CB-open signal: when cbIsOpen() flips true during this
// fan-out, call fanoutAbort.abort(new BVCircuitOpenError(...)).
// This needs a tiny polling watcher (or, cleaner, a state-change
// event from the CB itself).

const settled = await mapWithConcurrency(
  DEFI_PROTOCOLS,
  (p) => fetchOneDefiProtocol(address, p, apiKey, opts.retryStats, fanoutAbort.signal),
  DEFI_PROTOCOL_CONCURRENCY,
);
```

Add an option to `fetchOneDefiProtocol` to accept an external signal; merge with the per-protocol timeout signal via `AbortSignal.any([protocolTimeoutSignal, fanoutAbort.signal])` (Node 20+, available on Vercel).

**Open Q (founder lock needed):** Do we want a state-change EVENT on the circuit breaker (cleaner, ~10 LoC EventEmitter), or a polling watcher (cheaper, ~5 LoC `setInterval` inside the fan-out)? Recommended: state-change event. The CB currently is a plain object — adding `EventEmitter` semantics is the right surface even if only one consumer uses it today.

**Tradeoffs:**

- **Pro:** Eliminates the AbortError flurry — when CB opens, in-flight protocol calls cancel immediately instead of timing out.
- **Pro:** Wall-time saved per CB-open event: ~2-6s per affected user × N tail protocols.
- **Pro:** Cleaner shutdown semantics → fewer dangling promises in logs.
- **Con:** Coupling between the fan-out and the CB internals. CB needs a state-change surface (mild abstraction cost).
- **Con:** `AbortSignal.any` adds a tiny runtime cost per protocol call — negligible.

**Verifiable goal:**
1. Add unit test: force CB to open by feeding 10×429s, then assert the next 9-protocol fan-out completes in < 100ms (CB-fast-fail) instead of running each call to the 2s timeout.
2. Post-deploy: monitor `bv.cb_open` gauge correlation with `defi.protocol_timeout_count` — when CB opens, timeouts should drop ~9× per affected user.

---

## Test plan (per `goal-driven-execution.mdc`)

| Step | Action | Verify |
|---|---|---|
| 1 | Add a fixture-based benchmark for `runFinancialContextSnapshotJob` (50 mock users with `mockFetch` against in-memory BV stub) | Current sequential baseline: p95 ~80-100s |
| 2 | Implement lever 1 (batching) with N=10, M=500 | Re-run benchmark: p95 < 30s (3× speedup minimum) |
| 3 | Deploy lever 1 to production; observe for 3 cron runs (3 days) | `cron.fin_ctx_shard_duration_ms` p95 < 60s; `degradedSkipped` count drops to ≤1 per run |
| 4 | If founder approves: implement lever 2 (Retry-After propagation) with unit tests + cache state change | Unit test passes; benchmark unchanged (no perf regression) |
| 5 | Deploy lever 2; observe for 3 cron runs | New counter `bv.deny_window_skips` fires when BV emits `Retry-After`; degradedSkipped stays at ≤1 |
| 6 | If founder approves: implement lever 3 (AbortController coordination) with unit tests | CB-fast-fail test passes; benchmark slightly faster on bad days |
| 7 | Deploy lever 3; observe for 7 cron runs | `defi.protocol_timeout_count` drops correlated with `bv.cb_open` openings |

Acceptance: 7 consecutive cron runs (1 week) with `degradedSkipped ≤ 1` and `durationMs < 90_000`.

---

## Scope tiering for partial ship

If founder wants to time-box (e.g. "do lever 1 today, defer the rest"):

| Tier | Levers | Effort | Risk | Impact |
|---|---|---|---|---|
| Minimum | Lever 1 only | ~3h | LOW (surgical, ~30 LoC × 2 files) | HIGH — eliminates Vercel-timeout failure mode |
| Standard | Lever 1 + Lever 2 | ~5-6h | MEDIUM (cache state semantics change) | HIGH + good citizenship on Retry-After |
| Full | All 3 levers | ~8h | MEDIUM (CB EventEmitter coupling) | HIGH + clean shutdowns on CB-open |

**Agent recommendation: ship Tier "Minimum" (lever 1 only) first**, then evaluate metrics for 3 days before deciding on levers 2 + 3. The HANDOFF describes the failure mode as "operational" (no user impact today), so we have time to measure.

---

## Open questions for founder

| # | Question | Default if no answer |
|---|---|---|
| Q1 | Batch size N + intra-batch delay M for lever 1? | N=10, M=500ms |
| Q2 | Cache-state design for lever 2 — new `deny-window` state or extend `partial-stale` TTL? | Extend TTL (simpler) |
| Q3 | CB state-change surface for lever 3 — EventEmitter or polling? | EventEmitter |
| Q4 | Ship as one PR (all 3 levers) or staged (one per PR)? | Staged — lever 1 alone first |
| Q5 | Engine bump on levers 2 + 3 — patch or minor? Lever 1 is audric-only (no engine change). | Patch — lever 2 adds optional cache surface, lever 3 adds optional `AbortSignal` param; both are back-compat |
| Q6 | Should I add the same batching to `portfolio-snapshot` cron (07:00 UTC) at the same time? | YES — same failure mode, same fetcher, no incremental risk |
| Q7 | Telemetry — `cron.fin_ctx_batch_duration_ms` histogram for per-batch tracking? | YES — needed to validate batch-size tuning post-deploy |

---

## Cross-references

- `audric/HANDOFF_NEXT_AGENT.md` row 0.7 — the source backlog row
- `.cursor/rules/blockvision-resilience.mdc` — current resilience model (Retry-After, CB, sticky cache)
- `.cursor/rules/single-source-of-truth.mdc` — `getPortfolio()` is canonical; both crons + every chat tool go through it
- `packages/engine/src/blockvision-prices.ts` — the engine-side fetcher + retry layer (lever 2 + 3 land here)
- `apps/web-v2/lib/jobs/financial-context-snapshot.ts` + `apps/web-v2/lib/jobs/portfolio-snapshot.ts` — the two crons (lever 1 lands here)
- `apps/web-v2/lib/portfolio.ts` — canonical fan-out site (`doGetPortfolio`)
- `spec/active/AUDIT_ON_CHAIN_PIPELINE_2026-05-23.md` — coordinate with track S1 (blockvision-prices.ts split) so lever 2 + 3 changes don't conflict with the planned refactor

---

## Non-goals — explicit guard rails

1. **No change to `DEFI_PROTOCOL_CONCURRENCY`** — already tuned (S18-F4).
2. **No change to CB tunables** — `CB_THRESHOLD=10`, `CB_WINDOW_MS=5000`, `CB_COOLDOWN_MS=30000` stay as-is.
3. **No change to sticky-positive TTLs** — `DEFI_FRESH_TTL_MS_BLOCKVISION=60s`, `DEFI_STICKY_TTL_SEC=30min` stay as-is.
4. **No new env vars** — defaults baked into code; if a knob needs to be runtime-tunable in the future, that's a separate SPEC.
5. **No re-architecture of the cron entry points** — keep `route.ts` thin (auth check + delegate to job helper).
