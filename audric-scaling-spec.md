# Audric Scaling Spec — 500–1k DAU

> Sequenced PR plan to take Audric from "single-user testing" to a healthy 500–1k DAU production load.
> All effort estimates assume a single engineer with full context.
> Scope is deliberately bounded to **500–1k DAU**. The 5k+ work (own Sui RPC, BV enterprise, Postgres partitioning, multi-region) is called out at the bottom but **not specced here**.

---

## Where we are today (v0.54.2)

What's already in place:

| Layer | Status |
|---|---|
| DeFi cache | ✅ Upstash Redis, sticky-positive write rules, source-aware freshness (`@t2000/engine` `defi-cache.ts` + `audric/lib/engine/upstash-defi-cache.ts`) |
| BlockVision retry | ✅ 3-attempt exponential backoff with jitter, `Retry-After` honored, capped at 5s (`blockvision-prices.ts` `fetchBlockVisionWithRetry`) |
| BV circuit breaker | ✅ Process-local — opens after 10 × 429 in 5s, suppresses retries for 30s |
| Engine factory store injection | ✅ `apps/web/instrumentation.ts` injects Upstash store at boot, plus belt-and-suspenders side-effect imports in `lib/portfolio.ts` and `lib/engine/engine-factory.ts` |
| Anthropic streaming + microcompact | ✅ Already shipping |
| Vercel autoscale | ✅ Implicit |
| Daily snapshot cron | ⚠️ Single ECS task fans out to a single audric serverless endpoint (`/api/internal/financial-context-snapshot`) which iterates users sequentially. `maxDuration = 300` (5 min). |

What's still broken or fragile:

| # | Symptom | Real root cause | When it bites |
|---|---|---|---|
| 1 | `/api/portfolio` and `balance_check` can disagree on wallet value during BV bursts | `fetchAddressPortfolio` still uses a per-process `Map` (`portfolioCache`) — same SSOT bug we fixed for DeFi, just on the wallet half | Already (intermittently) — gets worse linearly with concurrent users |
| 2 | When 4 Vercel instances simultaneously miss the cache for the same address, all 4 fan out to BV with 9 DeFi calls each (= 36 calls / address / second) | Inflight dedup is process-local (`defiInflight` Map). No cross-instance coalescing. | At ~200 concurrent users, 1 viral/whale address can DoS BV for everyone |
| 3 | `financial-context-snapshot` cron processes all active users in a single 5-min serverless invocation | Single fan-out, sequential `for (const user of users)` inside one route handler | At ~250 active users (1.5s/user × 250 = 6.25 min) |
| 4 | NAVI MCP can rate-limit; we have no visibility, no caching, no breaker | `navi-reads.ts` calls the MCP on every `savings_info` / `health_check` / `rates_info` invocation, no cache | At ~500 DAU sustained |
| 5 | We can't see BV/Anthropic/Upstash spend, request rate, or cache hit ratio in real time | No telemetry — only Vercel function logs | Always; matters when something breaks |
| 6 | A whole class of "is this load test passing or are we just lucky" questions | No load test harness | Pre-launch confidence |

---

## Goals

- **Hold P95 chat-turn latency under 4s** at 1k DAU with bursty BV behavior.
- **Zero "$0 in savings" or "DeFi —" regressions** caused by per-instance cache drift. (Already fixed for DeFi; PR 1 closes the wallet half.)
- **Daily snapshot cron survives 1k active users** inside Vercel's `maxDuration` budget.
- **One dashboard** that shows BV / Anthropic / Upstash / Postgres health + spend at a glance.

## Non-goals (deferred to the 5k+ tier)

- Self-hosted Sui RPC (today: free public RPC; fine to ~5k DAU with our caching).
- BlockVision Enterprise contract (Pro tier + retry + CB + cross-instance dedup is enough headroom).
- Postgres read replicas / partitioning (write volume is small at 1k DAU; see PR 5 for monitoring).
- Anthropic prompt-cache audit beyond what microcompact already does.
- Multi-region / edge runtime migration.

---

## PR sequence + dependency graph

```
PR 1+2 (SSOT + cross-instance coalescing — ship together) ──> PR 6 (Load test)
                                                                    ▲
PR 3 (Cron sharding) ───────────────────────────────────────────────┤
PR 4 (NAVI MCP cache) ──────────────────────────────────────────────┤
PR 5 (Telemetry) ───────────────────────────────────────────────────┘
```

PRs 1+2 ship as a single merge (the wallet store and the cross-instance lock are tightly coupled — splitting them would mean shipping a half-fixed SSOT for 24h). PRs 3, 4, 5 are independent and can ship in parallel. PR 6 is the integration test that proves the rest works.

| Order | PR | Priority | Effort | Why this order |
|---|---|---|---|---|
| 1+2 | Wallet portfolio → Redis **+** cross-instance coalescing (one merge) | **P0** | 1.5 days | Same SSOT bug class as DeFi; cross-instance lock cuts BV burst load by ~5×. Tightly coupled — ship as one. |
| 3 | Daily cron sharding (chunk fan-out) | **P1** | 1 day | Hits at ~250 DAU; needs to be in place before we onboard meaningfully |
| 4 | NAVI MCP read cache + outage telemetry | **P1** | 0.5 day | Defensive — same retry+CB pattern as BV, plus a 30s cache |
| 5 | Telemetry dashboard (Vercel Observability + custom events) | **P2** | 1 day | Without it, we can't tell if the other PRs worked under real load |
| 6 | Pre-launch load test playbook (k6 Cloud) | **P3** | 1 day | Validates the full stack before we open the gates |

**Total: ~5 days of focused work for a 500–1k DAU-ready posture.**

---

## PR 1+2 — Wallet portfolio → Redis + cross-instance coalescing

> **Ships as a single merge.** PR 1 closes the wallet-half of the SSOT loop; PR 2 stops the BV fan-out from amplifying under concurrent load. Splitting them means a 24h window where wallet reads are SSOT-correct but the BV traffic to populate them is unbounded — net worse than the current state. Two named sub-PRs in this doc for review clarity, but the audric/engine version bump is one event.

### Versioning

PR 1+2 ships as `@t2000/engine` **v0.55.0** + `@t2000/sdk` **v0.55.0** + `@t2000/cli` **v0.55.0** + `@t2000/mcp` **v0.55.0** (all locked to the same number per the monorepo release process — `gh workflow run release.yml --field bump=minor`). Audric `web` bumps both `@t2000/engine` and `@t2000/sdk` to `^0.55.0` and deploys after the npm publish completes. Rollback = pin both back to `^0.54.x` in `audric/apps/web/package.json` and redeploy.

`minor` is correct because PR 1+2 adds new public exports (`WalletCacheStore`, `InMemoryWalletCacheStore`, `setWalletCacheStore`, `getWalletCacheStore`, `resetWalletCacheStore`, `FetchLock`, `InMemoryFetchLock`, `setFetchLock`, `awaitOrFetch`) without breaking any existing API. Default behavior with no injection mirrors today's process-local maps.

### CLI / MCP impact

CLI (`@t2000/cli`) and MCP (`@t2000/mcp`) behavior is unchanged. They keep `InMemoryWalletCacheStore` and `InMemoryFetchLock` (no Upstash injection in those packages — they have no Redis dependency). Only `audric/apps/web` injects the Redis-backed implementations via `init-engine-stores.ts`. CLI tests continue to use the in-memory defaults.

---

### PR 1 — Wallet portfolio → Upstash Redis cache

### Problem

`fetchAddressPortfolio` in `packages/engine/src/blockvision-prices.ts` (lines 290–389) still uses two process-local maps:

```336:389:packages/engine/src/blockvision-prices.ts
export async function fetchAddressPortfolio(
  address: string,
  apiKey: string | undefined,
  fallbackRpcUrl?: string,
): Promise<AddressPortfolio> {
  const now = Date.now();
  const cached = portfolioCache.get(address);
  if (cached && now - cached.ts < CACHE_TTL_MS) {
    return cached.data;
  }

  let inflight = portfolioInflight.get(address);
  if (inflight) return inflight;
  // ...
}
```

Three Vercel functions calling `fetchAddressPortfolio` for the same address get three different cache states. During a BV 429 burst, one instance might serve a healthy value from cache while another freshly degrades to `sui-rpc-degraded` (which can't price non-stables). Result: the same chat turn shows different totals on different cards.

This is exactly the same bug class the v0.54 DeFi work fixed. We just didn't migrate the wallet half yet.

### Solution

Mirror the DeFi cache pattern verbatim:

1. Define `WalletCacheStore` interface in a new `packages/engine/src/wallet-cache.ts` (clone of `defi-cache.ts`).
2. Default `InMemoryWalletCacheStore` for CLI/tests/dev.
3. `setWalletCacheStore` / `getWalletCacheStore` / `resetWalletCacheStore` injection slots.
4. New `apps/web/lib/engine/upstash-wallet-cache.ts` (clone of `upstash-defi-cache.ts`, prefix `wallet:`).
5. `apps/web/lib/engine/init-engine-stores.ts` — inject the wallet store alongside the DeFi store.
6. Refactor `fetchAddressPortfolio` to read/write via the store, keeping `portfolioInflight` as the in-process coalescer (PR 2 adds the cross-instance one).
7. Make `clearPortfolioCacheFor` async and `await` it from `engine.ts` `runPostWriteRefresh` — see file-by-file row for `engine.ts` below.

Cache freshness:
- `blockvision` source → 60s TTL (same as today's `CACHE_TTL_MS`)
- `sui-rpc-degraded` source → 15s TTL — replaces the `ts: Date.now() - (CACHE_TTL_MS - DEGRADED_CACHE_TTL_MS)` aging trick at lines 377-380 (see file-by-file row for `blockvision-prices.ts` below)
- Sticky window: 30 min (matches DeFi `DEFI_STICKY_TTL_SEC`)
- Same write rules as DeFi: positive `blockvision` always wins; `sui-rpc-degraded` never overwrites a known-good positive within the sticky window.

### Scope clarifications

- **`EngineConfig.portfolioCache?: Map<string, AddressPortfolio>` is kept as-is.** That's the per-request, turn-level memoisation Map shared across `balance_check` + `portfolio_analysis` inside the same chat turn. It's intentionally process-local and request-scoped — not the cross-process SSOT cache being moved to Redis. Only the module-level `portfolioCache` Map (in `blockvision-prices.ts`) moves.
- **`portfolioInflight` Map (in-process coalescer) is kept.** Dedups parallel calls inside one Vercel function process. Cross-process coalescing is PR 2's job (`FetchLock`).
- **Cache entry shape decision: clone the `DefiCacheEntry` envelope.** Use `WalletCacheEntry { data: AddressPortfolio; pricedAt: number }` even though `AddressPortfolio` already has its own `pricedAt`. The `pricedAt` on the envelope is the **cache-write time** (used for sticky freshness math); the inner `AddressPortfolio.pricedAt` is the **upstream-data time** (already present, semantically distinct). This matches the DeFi pattern exactly — minimal cognitive load for reviewers.
- **Address normalization:** the new wallet store lowercases addresses to match `UpstashDefiCacheStore`'s key normalization (line 60 of `upstash-defi-cache.ts`). Sui addresses are case-insensitive after `0x` so `0xABC...` and `0xabc...` must hit the same key. Implement on both `InMemoryWalletCacheStore` and `UpstashWalletCacheStore` in their `key()` / `get()` / `set()` paths.
- **`priceMapCache` (the global multi-token price-list cache at line 297) is out of scope for this PR.** It's a single shared entry per process (one row = "all prices we've ever fetched") so the SSOT blast radius is small. Revisit only if we see price-drift bugs in production. Documenting so we don't accidentally widen this PR.

### File-by-file changes

| File | Change |
|---|---|
| `packages/engine/src/wallet-cache.ts` | **New** — clone `defi-cache.ts` shape; `WalletCacheStore`, `WalletCacheEntry { data: AddressPortfolio; pricedAt: number }`, `InMemoryWalletCacheStore` (lowercases address keys), `setWalletCacheStore`, `getWalletCacheStore`, `resetWalletCacheStore` |
| `packages/engine/src/blockvision-prices.ts` | (a) Refactor `fetchAddressPortfolio` to read/write via `getWalletCacheStore()`; delete the module-level `portfolioCache` Map. (b) Keep `portfolioInflight` Map (in-process coalescer). (c) Add sticky-positive write rules mirroring DeFi (lines 1019–1053): positive `blockvision` always wins, `sui-rpc-degraded` never overwrites a known-good positive within the 30-min sticky window. (d) **Replace the `ts: Date.now() - (CACHE_TTL_MS - DEGRADED_CACHE_TTL_MS)` aging trick at lines 377-380 with explicit per-source TTL** passed to `store.set(address, entry, ttlSec)` — `ttlSec = source === 'sui-rpc-degraded' ? 15 : 60` (sticky-positive negotiation gets a separate, longer TTL). The aging trick was load-bearing under the in-process Map (TTL was client-checked); under Redis (`EX` server-enforced) it silently breaks. (e) Make `clearPortfolioCache()` and `clearPortfolioCacheFor(address)` `async` — they now `await store.clear()` / `await store.delete(address)`. |
| `packages/engine/src/engine.ts` | **`runPostWriteRefresh` must `await clearPortfolioCacheFor(this.walletAddress)`** (currently fire-and-forget at line 352). Without the await, the post-write `balance_check` races the Redis delete and can fetch the stale pre-write balance — exactly the symptom v0.54 sticky cache shipped to fix. Update the surrounding `if (this.walletAddress) { ... }` block to be inside an `await` chain. |
| `packages/engine/src/index.ts` | Export `WalletCacheStore`, `WalletCacheEntry`, `InMemoryWalletCacheStore`, `setWalletCacheStore`, `getWalletCacheStore`, `resetWalletCacheStore` |
| `apps/web/lib/engine/upstash-wallet-cache.ts` | **New** — clone `upstash-defi-cache.ts`, prefix `wallet:`, same SCAN-based `clear()`, same address-lowercase `key()` |
| `apps/web/lib/engine/init-engine-stores.ts` | Add `setWalletCacheStore(new UpstashWalletCacheStore())` next to the DeFi setter; same `VITEST` env bypass; same idempotency guard |
| `apps/web/instrumentation.ts` | No change — already imports `init-engine-stores` |

### Tests

Clone the DeFi test suites:

- `packages/engine/src/__tests__/wallet-cache.test.ts` — `InMemoryWalletCacheStore` get/set/delete/clear/TTL
- `packages/engine/src/__tests__/wallet-cache-sticky.test.ts` — sticky-positive write rules, mirroring `defi-cache-sticky.test.ts`
- Update `packages/engine/src/__tests__/blockvision-prices.test.ts` to assert store is consulted

### Rollback plan

Revert is a clean engine version bump-back. The Upstash store falls back to `InMemoryWalletCacheStore` if injection fails (same as DeFi today), so the worst case after revert is per-instance caching — i.e. the state we're in pre-PR.

### Effort

**0.5 day.** Pattern is already proven; this is mechanical translation.

---

## PR 2 — Cross-instance request coalescing (Upstash `SET NX` lock)

### Problem

Even with PR 1 in place, when N concurrent Vercel instances all miss the cache for the same address at the same instant, all N independently fire the BV portfolio call **and** the 9-protocol DeFi fan-out. At 200 concurrent users with a popular shared address (e.g. a treasury we're all watching), a single cache-miss instant can produce 200 × 10 = 2000 BV calls in <1 second.

The `defiInflight` and `portfolioInflight` Maps coalesce **within a process**, but every Vercel instance is its own process.

### Solution

Add a per-address Upstash lock around BV fan-outs. Concretely:

1. Caller computes a stable lock key (`bv-lock:wallet:<address>` or `bv-lock:defi:<address>`).
2. `SET NX EX 15` to acquire — **15-second lease** sized for the worst-case `fetchBlockVisionWithRetry` budget (see lease math below).
3. **Lock acquired** → run the fetcher (which itself includes retry + circuit-breaker logic), write to cache, then `DEL` the lock. Cache write is the signal — no separate pub/sub channel.
4. **Lock not acquired** → poll the cache every 100ms (jittered) for up to **4.5s**. If cache fills, return. If timeout, fall through to direct BV fetch (defensive — never block forever on a phantom lock).

Why polling instead of pub/sub: Upstash REST API is stateless; pub/sub requires the SDK's WebSocket mode which doesn't work cleanly in Vercel's serverless runtime. A 100ms poll is cheap (<45 Upstash GETs / coalesced caller / 4.5s wait) and bounded.

#### Lease math (why 15s, not 5s)

The lease must cover the **worst-case retry budget** of the wrapped fetcher. From `blockvision-prices.ts` constants (lines 62-66):

```
BV_RETRY_MAX_ATTEMPTS = 3
BV_RETRY_BASE_DELAY_MS = 250
BV_RETRY_BACKOFF_FACTOR = 3
BV_RETRY_AFTER_CAP_MS = 5_000
PORTFOLIO_TIMEOUT_MS = 4_000  // per HTTP attempt
```

Worst case (CB closed, all 3 attempts time out, no `Retry-After`):
- HTTP attempts: `3 × 4s = 12s`
- Backoff sleeps: `250ms + 750ms = 1s`
- **Total: ~13s**

Worst case with `Retry-After: 5` from BV:
- HTTP attempts: `3 × 4s = 12s`
- Backoff sleeps: `5s + 5s = 10s` (capped)
- **Total: ~22s**

A 5s lease (the original spec) expires mid-fetch in either scenario. The lease times out → a follower acquires the lock → now 2 instances are fetching the same address — exactly the amplification this PR exists to prevent.

**15s is the right lease size** for the no-`Retry-After` case (the dominant production case). Under sustained `Retry-After: 5` storms (rare; means BV is in deep trouble), the CB will open within 10 × 429 / 5s and short-circuit subsequent calls, dropping the worst case to a single attempt (~4s) — well inside the 15s lease.

Followers poll for **4.5s** (was 4s in the original spec). 4.5s = `15s lease - 10s safety margin > leader_finish_time` for the dominant case. Keep poll budget < the per-tool engine timeout (typically 5s for `balance_check` / `portfolio_analysis`) so a dead leader doesn't cascade into a tool timeout.

Worst case under contention:
- 1 leader fetches; N-1 followers each do up to 45 cheap Redis GETs over 4.5s while waiting.
- Net BV traffic for N concurrent callers: **1 fan-out** (was N fan-outs).

### File-by-file changes

| File | Change |
|---|---|
| `packages/engine/src/cross-instance-lock.ts` | **New** — generic helper: `acquireFetchLock(key, leaseSec)`, `awaitOrFetch<T>(key, fetcher, opts)`. Pluggable backend (default: process-local `InMemoryFetchLock`; Audric injects `UpstashFetchLock`). Includes 4.5s default follower-poll budget (see Concurrency notes below). |
| `packages/engine/src/blockvision-prices.ts` | Wrap **two public entry points** in `awaitOrFetch`: (a) `fetchAddressPortfolio` with key `bv-lock:wallet:<address>` — protects the single BV `/account/coins` call. (b) `fetchAddressDefiPortfolio` with key `bv-lock:defi:<address>` — protects the **whole 9-protocol fan-out** as a single unit. **Do NOT wrap `fetchOneDefiProtocol` per-protocol** — all 9 siblings would compete for the same `bv-lock:defi:<address>`, one would win and 8 would poll-then-refetch. The lock must sit at the fan-out level, not below it. |
| `apps/web/lib/engine/upstash-fetch-lock.ts` | **New** — Upstash-backed `FetchLock` impl using `SET NX EX`. |
| `apps/web/lib/engine/init-engine-stores.ts` | Inject the Upstash lock backend. |
| `packages/engine/src/index.ts` | Export `FetchLock`, `InMemoryFetchLock`, `setFetchLock`, `awaitOrFetch`. |

### Concurrency notes

- The lock is **per-address-and-purpose**. `wallet:<addr>` and `defi:<addr>` lock independently — wallet fetch shouldn't wait for DeFi.
- Lock leases are **15s** — sized for the worst-case `fetchBlockVisionWithRetry` budget (`3 attempts × 4s timeout + 1s backoff ≈ 13s`, see lease math above). We never extend; if a process dies, the lease expires and the next caller takes over.
- The follower-poll budget is **4.5s** — must be < the engine's per-tool timeout (typically 5s) so a dead leader doesn't cascade into a tool timeout for every follower. Polls every 100ms (jittered ±20%) for ≤45 GETs total.
- **Lock keys share the same Upstash instance as cache keys** (intentional). Upstash bills per command, not per keyspace; sharing one instance is cheap and correct. Key prefixes (`wallet:`, `defi:`, `bv-lock:wallet:`, `bv-lock:defi:`) keep the four key families cleanly separable for `SCAN`-based debugging.
- Followers fall through to a direct BV fetch on poll timeout (4.5s) — this is the **defensive degraded path**. Under healthy load this branch should never fire; if it fires regularly under load test S2, the lease is misconfigured.

### Tests

`packages/engine/src/__tests__/cross-instance-lock.test.ts`:
- Single caller acquires + fetches + releases.
- 5 concurrent callers, 1 wins lock, 4 await cache, all return same value, **1 fetcher invocation**.
- Lock holder dies (simulated by manual `redis.del` mid-flight) → next caller acquires + fetches.
- Cache write but no notification → poller times out, falls through to direct fetch (degraded path tolerated).

Add a probe in `blockvision-retry.test.ts`: 10 concurrent `fetchAddressDefiPortfolio` for the same address with the in-memory lock backend → assert exactly 9 BV calls fired (one fan-out, not 90).

### Rollback plan

Same as PR 1 — defaults to in-memory `FetchLock` (i.e. no cross-instance coordination, current behavior) if injection fails.

### Effort

**1 day.** The hard part is the test harness for cross-process semantics in vitest; the production code is ~150 lines.

---

## PR 3 — Daily cron sharding

### Problem

`apps/server/src/cron/jobs/financialContextSnapshot.ts` POSTs to a single audric endpoint:

```33:62:apps/server/src/cron/jobs/financialContextSnapshot.ts
export async function runFinancialContextSnapshot(): Promise<JobResult> {
  const job = 'financial-context-snapshot';
  const url = `${getInternalUrl()}/api/internal/financial-context-snapshot`;

  try {
    const res = await fetch(url, { /* ... */ });
```

That endpoint (`apps/web/app/api/internal/financial-context-snapshot/route.ts`) iterates users sequentially with a 5-minute `maxDuration` cap. At ~1.5s per user (BV portfolio + DeFi + Postgres upsert), the route handles ~200 users before timing out. We have headroom today, but it disappears at ~250 active users.

### Solution

Two changes:

1. **Server-side shard fan-out.** Update `runFinancialContextSnapshot` to POST N shards in parallel (e.g. `?shard=0&total=8`), each handling `users.filter((_, i) => i % total === shard)`. Wait for all to settle, aggregate counts.

2. **Audric route accepts shard params.** `/api/internal/financial-context-snapshot?shard=0&total=8` only processes its slice. Each shard finishes in ~30s for 1k DAU / 8 shards = 125 users × 1.5s. Comfortably under `maxDuration`.

Why shard count of 8: matches the typical concurrent invocation cap for a single Vercel project (free/Pro). Tunable via `T2000_FIN_CTX_SHARD_COUNT` env var.

### File-by-file changes

| File | Change |
|---|---|
| `apps/server/src/cron/jobs/financialContextSnapshot.ts` | Read `process.env.T2000_FIN_CTX_SHARD_COUNT` (default 8); fire N parallel POSTs with `?shard=i&total=N`; aggregate `created/skipped/errors/total` |
| `apps/web/app/api/internal/financial-context-snapshot/route.ts` | Parse `shard` + `total` from `request.url`; filter `addresses` by index modulo before the user-fetch loop |
| `apps/server/src/cron/jobs/financialContextSnapshot.test.ts` | Update mock to assert N calls fired with correct shard indices; aggregation matches sum |

### Why a queue is not needed here (yet)

A proper queue (BullMQ on Upstash, or AWS SQS) is the right answer at 5k+ DAU, where individual user processing time becomes variable and we want retry semantics. At 500–1k DAU, fan-out + per-shard `Promise.allSettled` is simpler and good enough. Documenting this so we don't accidentally over-engineer it.

### Rollback plan

Default `T2000_FIN_CTX_SHARD_COUNT=1` reverts to current single-fan-out behavior.

### Effort

**1 day.** Bulk of the work is the audric-side route handler refactor + the regression test for "every user is processed exactly once across shards."

---

## PR 4 — NAVI MCP read cache + telemetry

### Problem

`navi-reads.ts` calls the NAVI MCP on every `savings_info` / `health_check` / `rates_info` invocation. We have:
- No cache → repeated calls for the same address inside a chat session re-hit MCP.
- No retry → a single 5xx propagates as `degraded` to the LLM.
- No breaker → a NAVI outage hammers their endpoint with our retry traffic.
- No telemetry → we don't know NAVI is rate-limiting us until users complain.

### Solution

Apply the BV pattern to NAVI MCP. Specifically:

1. **30s cache** in Upstash for `savings_info(address)` and `health_check(address)` reads. Key `navi:<endpoint>:<address>`. (Rates info caches longer — 5 min — keyed by `navi:rates`.)
2. **Retry wrapper** around the MCP transport (mirror `fetchBlockVisionWithRetry`).
3. **Per-NAVI circuit breaker** — open after 10 5xx in 5s, cooldown 30s.
4. **Counter-only telemetry** (PR 5 visualizes it): `navi.requests`, `navi.5xx`, `navi.cache_hit`, `navi.cb_open`.

### File-by-file changes

| File | Change |
|---|---|
| `packages/engine/src/navi-reads.ts` | Wrap MCP calls in retry helper + cache lookup. Cache backend pluggable (default in-memory; Audric injects Upstash). |
| `packages/engine/src/navi-cache.ts` | **New** — `NaviCacheStore` interface + `InMemoryNaviCacheStore` (clone of `defi-cache.ts` shape). |
| `apps/web/lib/engine/upstash-navi-cache.ts` | **New** — Upstash-backed impl. |
| `apps/web/lib/engine/init-engine-stores.ts` | Inject. |
| `packages/engine/src/__tests__/navi-reads.test.ts` | Add: cache hit → no MCP call; 5xx → retried then degraded; CB opens after 10 5xx; cache stale beyond 30s → re-fetched. |

### Effort

**0.5 day.** Same pattern as BV; fewer endpoints to wrap.

---

## PR 5 — Telemetry dashboard

### Problem

When something breaks (BV outage, NAVI outage, Anthropic latency spike, Upstash hot key), we find out from a user-reported bug filed an hour later. We can't see request rates, cache hit ratios, error rates, or per-provider spend in real time.

### Solution

Push a small set of counters/gauges to a single dashboard. Two-part build:

**Part A — Instrument the hot paths (engine + audric):**

| Counter | Where | Tag |
|---|---|---|
| `bv.requests` | `fetchBlockVisionWithRetry` | `endpoint=portfolio\|prices\|defi`, `status=2xx\|429\|5xx\|network_err`, `attempt=0..2` |
| `bv.cache_hit` | wallet + defi store reads | `kind=wallet\|defi`, `freshness=fresh\|stale-served\|miss` |
| `bv.cb_open` | circuit breaker `cbRecord429` | gauge — 0 or 1 |
| `navi.requests` | NAVI MCP wrapper (PR 4) | same tags as BV |
| `navi.cache_hit` | NAVI cache (PR 4) | same |
| `anthropic.tokens` | engine `usage` event sink | `kind=input\|output\|cache_read\|cache_write`, `model` |
| `anthropic.latency_ms` | engine turn-complete | histogram |
| `upstash.requests` | Upstash store wrappers | `op=get\|set\|del\|scan`, `prefix=defi:\|wallet:\|navi:` |
| `cron.fin_ctx_shard_duration_ms` | shard handler (PR 3) | `shard`, `result=ok\|partial\|err` |
| `cron.fin_ctx_users_processed` | shard handler | `shard` |

**Part B — Dashboard.** Stay on Vercel — adding another vendor isn't worth the operational overhead at this scale.

**Decision: Vercel Observability + Vercel Analytics custom events.**

Concretely we use three Vercel-native pieces:

| Surface | What it gives us | Cost |
|---|---|---|
| **Vercel Observability** (Pro plan, included) | Function logs + traces + metrics; query by tag (`env`, `route`, custom labels); 7-day retention on Pro | $0 marginal |
| **Vercel Speed Insights** (Pro, included) | p50 / p75 / p95 / p99 web vitals + per-route function latency | $0 marginal |
| **`@vercel/analytics` custom events** | Structured counter/event submission from server code; queryable in Observability + Analytics tabs | $0 marginal |

For the AWS ECS cron (the `apps/server` worker), pipe stdout via the existing CloudWatch Logs setup — surface key counters as **CloudWatch metric filters** so the cron numbers land on the same Vercel-style "ops" page via a small server-side proxy if we want one pane.

**Why we're skipping Axiom (and OTel/Grafana, and Sentry)** — they'd add real value if we were debugging production incidents from logs daily, or if we needed >7 days of trace retention, or if we wanted distributed tracing across t2000-server ↔ audric-web. At 500–1k DAU, the failure modes we care about (BV CB opening, NAVI 5xx rate, cron shard failures) are answerable with: "did we emit a counter in the last 24h, and what does the count look like grouped by tag?" — which Vercel Observability handles natively. The graduation criterion is documented at the bottom of this section.

### When to reconsider (graduate to Axiom or Grafana)

Move off Vercel-native observability when **any** of these is true:

- We need >30 days of historical metrics for QBR / investor reporting.
- We're regularly debugging incidents that span >2 services and need distributed traces.
- We have on-call rotations that need PagerDuty / Opsgenie integration with rich alert context.
- A single tag combination (e.g. `bv.requests` × `endpoint=defi` × `status=429` × `attempt=2`) cardinality explodes past Vercel's per-event limits.

None of these apply at 500–1k DAU. Revisit at 5k DAU.

### File-by-file changes

| File | Change |
|---|---|
| `packages/engine/src/telemetry.ts` | **New** — `TelemetrySink` interface (`counter`, `gauge`, `histogram`); default `NoopSink`; `setTelemetrySink` injection slot. Pluggable backend so the CLI/MCP keep `Noop` and Audric injects the Vercel sink. |
| `packages/engine/src/blockvision-prices.ts` | Add counter calls in `fetchBlockVisionWithRetry`, store reads, CB record |
| `packages/engine/src/navi-reads.ts` | Counter calls (depends on PR 4) |
| `packages/engine/src/agent-loop.ts` | Counter calls on `usage` events |
| `apps/web/lib/engine/vercel-sink.ts` | **New** — `VercelTelemetrySink` impl wrapping `@vercel/analytics/server` `track()` for counters and structured `console.log({ kind: 'metric', ... })` lines for Observability ingestion |
| `apps/web/lib/engine/init-engine-stores.ts` | Inject the Vercel sink |
| `apps/web/app/(internal)/admin/scaling/page.tsx` | **New** — Embedded Vercel Observability + Speed Insights iframes + a small custom panel that renders the last 24h of `bv.cb_open` / `cron.fin_ctx_shard_duration_ms` series. Private route gated by `T2000_INTERNAL_KEY` cookie. |
| `apps/server/src/cron/index.ts` | Emit structured log lines from `runCron` (one per shard completion) so CloudWatch metric filters can chart shard duration / failures alongside the Vercel surfaces. |

### Effort

**1 day.** Vercel-native cuts the dashboard work roughly in half vs Axiom — no separate ingest pipeline, no API tokens to manage, the iframe-able Observability views handle most of the layout for free.

---

## PR 6 — Pre-launch load test playbook

### Problem

We've never run Audric under sustained load. We don't know:
- What our p95 chat-turn latency looks like at 100 concurrent sessions.
- Whether the BV circuit breaker opens under realistic load (or is over/under-tuned).
- Whether the Postgres write rate from `record_advice` + `chain_facts` saturates.
- Whether Upstash hot keys (the most-watched address) become a bottleneck.

### Solution

A reproducible k6 load test that simulates 100 → 500 → 1k concurrent users running realistic chat turns against a staging deployment.

### Test scenarios

| Scenario | Concurrency | Duration | Pass criteria |
|---|---|---|---|
| **S1 — Steady read load** | 100 → 500 ramp over 5 min | 15 min | p95 chat-turn < 4s, BV CB stays closed |
| **S2 — Burst at viral address** | 200 concurrent on the same address | 2 min | Cross-instance lock holds; BV calls < 50/min for that address |
| **S3 — Mixed read+write** | 200 concurrent, 10% writes | 10 min | Write tx mutex serializes correctly; no double-spends in test wallets |
| **S4 — BV degradation** | 200 concurrent, fault-inject 30% of BV calls to 429 | 10 min | Sticky-positive cache serves > 80% of degraded reads with positive value |
| **S5 — Daily cron under load** | Trigger fin_ctx cron during S1 | 5 min | All shards finish < 60s; chat p95 unaffected |

### File-by-file changes

| File | Change |
|---|---|
| `loadtest/k6/scenarios/s1-steady-read.js` | **New** |
| `loadtest/k6/scenarios/s2-viral-address.js` | **New** |
| `loadtest/k6/scenarios/s3-mixed.js` | **New** |
| `loadtest/k6/scenarios/s4-bv-degraded.js` | **New** — uses k6's `mockSession` to fault-inject |
| `loadtest/k6/scenarios/s5-cron-overlap.js` | **New** |
| `loadtest/README.md` | **New** — staging URL, test wallet seed, how to run, pass/fail criteria |

### Where it runs

**k6 Cloud paid tier ($89/mo)** — handles all scenarios including S1's 500 VUs without setup overhead. No self-managed runners, no ECS task to maintain, scenarios run on schedule from the k6 web UI, results live in the same dashboard the rest of the team can read.

The $89/mo cost is dwarfed by the eng-time we'd spend building and maintaining a self-hosted k6 runner. Default to paid Cloud; revisit only if monthly spend ever stops being justified.

### Effort

**1 day** to write the scenarios + wire up scheduled runs in k6 Cloud.

---

## What we're explicitly NOT doing (yet)

| Future PR | Why not now |
|---|---|
| Self-hosted Sui RPC | Public RPC fine to ~5k DAU with our caching; spend ~$300/mo when we cross |
| BlockVision Enterprise contract | Pro tier + retry + CB + cross-instance dedup gives us ~3x headroom over current load |
| Postgres read replicas | Write volume small at 1k DAU (~10 writes/sec sustained, 50 in burst); single primary fine |
| Postgres `ChainFact` partitioning | Table grows ~5k rows/day at 1k DAU; partition at 1M rows (~6 mo) |
| Anthropic prompt-cache audit | Microcompact already gives us 60–80% cache hit ratio; revisit at 5k DAU |
| Multi-region | Single region at us-east-1 fine until users in APAC/EU complain about p95 |
| Move engine to Edge runtime | BV + NAVI + Upstash are all REST; Edge would help, but Node18 functions are well within budget at 1k DAU |
| Sentry / proper APM | PR 5 buys us 80% of what Sentry gives at 5% of the cost; revisit when we want trace-level debugging |

---

## Estimated cost at 1k DAU (post-spec)

| Provider | Spend (monthly) | Notes |
|---|---|---|
| Vercel Pro (web + Observability + Speed Insights) | $20 base + ~$50 function-time | Function-seconds dominated by chat turns; observability included |
| AWS ECS (t2000 cron worker) | ~$15 | Single small Fargate task scheduled by EventBridge |
| Upstash Redis | $0–$10 | Free tier = 10k commands/day; 1k DAU ≈ 200k commands/day; first paid tier $0.20/100k = ~$10/mo |
| BlockVision Pro | $99/mo | Single tier; PR 2 cuts our request rate enough to stay under burst caps |
| Anthropic | $300–800/mo | Highly turn-mix dependent; biggest variable cost. PR 5 dashboard surfaces this. |
| Postgres (Neon/Supabase) | $20–50 | Small writes, manageable at 1k DAU |
| k6 Cloud | $89 | Pre-launch + monthly regression load tests |
| Total | **$543–1,133/mo** | |

For comparison, BlockVision Enterprise alone is $499/mo, so PR 2's cross-instance dedup is the highest-leverage cost-control work in this whole spec. We also explicitly avoid adding a third-party observability vendor (Axiom/Datadog/Sentry) at this stage — Vercel-native + CloudWatch keeps the surface area small.

---

## Acceptance criteria for "ready for 1k DAU"

- [ ] PR 1+2 merged (single deploy) + load-tested at 200 concurrent on same address (S2 passes)
- [ ] PR 3 merged + cron at 1k synthetic users completes < 90s
- [ ] PR 4 merged + simulated NAVI 5xx burst absorbed without user-visible degradation
- [ ] PR 5 dashboard live in Vercel Observability + on-call runbook written
- [ ] PR 6 S1 (500 VU steady) passes once on staging
- [ ] BV CB has not opened in production in the last 7 days (after PRs 1+2)
- [ ] p95 chat-turn latency < 4s in production (after PR 5 dashboard exists to measure it)

---

## Resolved decisions

| Question | Decision | Rationale |
|---|---|---|
| Telemetry vendor | **Vercel Observability + Speed Insights + `@vercel/analytics`** (CloudWatch for the ECS cron) | Already on Vercel + AWS; avoid a third vendor at this scale. Graduate to Axiom/Grafana when criteria in PR 5 are hit. |
| Load test runner | **k6 Cloud paid ($89/mo)** | Cloud-hosted, no ops; cost dwarfed by eng-time of self-hosting |
| PR 1 + PR 2 ordering | **Ship as a single merge** | Splitting leaves 24h with SSOT-correct wallet reads but unbounded BV fan-out — net worse than current state |
| Cron shard count | **Default 8** (env-tunable via `T2000_FIN_CTX_SHARD_COUNT`) | Matches typical Vercel concurrent-invocation cap; gives ~125 users/shard at 1k DAU = ~3min/shard, well under `maxDuration` |
