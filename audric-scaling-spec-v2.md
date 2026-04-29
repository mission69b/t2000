# Audric Scaling Spec v2 — 3,000 → 5,000+ DAU

> Sequenced PR plan to take Audric from the 1,000–3,000 DAU posture shipped in v1 (`audric-scaling-spec.md`, S.27–S.29) to a measured 5,000+ DAU.
> All effort estimates assume a single engineer with full context.
> Scope is deliberately bounded to **5,000+ DAU**. The 10k+ work (multi-region, edge runtime, dedicated infra) is called out at the bottom but **not specced here**.

---

## Where we are today (post-v1, v0.56.2 + audric `f464889`)

What's already in place from v1:

| Layer | Status |
|---|---|
| Wallet + DeFi cache (Upstash, sticky-positive) | ✅ PR 1 |
| Cross-instance fetch lock (Redis `SET NX EX 10`) | ✅ PR 2 |
| Daily cron sharding (8 shards default) | ✅ PR 3 |
| NAVI MCP cache + retry + circuit breaker | ✅ PR 4 |
| Telemetry sink (Vercel Observability + Analytics) | ✅ PR 5 |
| k6 load-test playbook (5 scenarios, all pass) | ✅ PR 6 |
| Sui RPC tx-history cache + retry | ✅ PR 7 |

What still constrains us at 3,000+ DAU:

| # | Constraint | Real root cause | When it bites |
|---|---|---|---|
| 1 | Daily cron at 8 shards completes in 16.7s for 105 users — extrapolates to ~13min for 5,000 users (over 5min `maxDuration`) | Shard count is hardcoded default | At ~1,900 DAU |
| 2 | Per-IP rate limiter is in-memory (`lib/rate-limit.ts`), per Vercel instance | With N instances, effective limit is N × the configured cap — accurate at low traffic, drifts under load | At ~3,000 DAU sustained, single power-user IPs see 3–5× the intended cap |
| 3 | `prisma.sessionUsage.groupBy` runs on every authenticated chat turn — counts distinct sessions in the rolling 24h window | DB query per chat turn; at 5k DAU = ~1,500 concurrent groupBys at peak | At ~3,500 DAU sustained |
| 4 | Single BlockVision API key with single circuit breaker | If BV temp-bans the key, every user sees degraded responses | Already a tail-risk; severity grows with DAU |
| 5 | Single public Sui RPC endpoint (`fullnode.mainnet.sui.io`) | If it 429s sustained, our retry layer absorbs the first burst but eventually returns empty arrays to users | At ~5k DAU during cron + interactive overlap |
| 6 | No automated alerting on the metrics shipped in PR 5 | Telemetry is recorded but nobody is notified when cache_hit < 90% or CB stays open > 5min | Always; matters when something quietly degrades |

---

## Goals

- **Honestly post "ready for 5,000+ DAU"** — measured, not aspirational.
- **Cron completes in < 4 min at 5,000 users** with current per-user processing time.
- **Per-IP rate limiter is accurate to within 5%** across all Vercel instances.
- **No single external dependency** (BV key, Sui RPC endpoint) is a single point of failure for the user-visible read path.
- **Operator gets a Slack/email page** within 5 min of any P5 metric breach.

## Non-goals (deferred to the 10k+ tier)

- Self-hosted Sui RPC (still fine to ~10k DAU with our caching + a second public RPC pool).
- Multi-region / edge runtime migration.
- Postgres read replicas / partitioning (writes are still small at 5k DAU).
- LLM cost engineering beyond what microcompact + prompt-cache already do (separate Anthropic spend conversation).
- Anthropic cache-control audit / shared-prefix optimization.

---

## PR sequence + dependency graph

```
PR 8 (cron shard bump) ──────────┐
                                 │
PR 9 (Redis rate limit + session ├──> PR 13 (load test re-run)
       count, replaces in-memory)│
                                 │
PR 10 (BV API key sharding) ─────┤
                                 │
PR 11 (Telemetry alerting) ──────┤
                                 │
PR 12 (Sui RPC pool) ────────────┘
```

PR 8 is a config-only ship — minutes of work, no risk. PRs 9–12 are independent and can ship in any order. PR 13 is the validation re-run of the v1 k6 playbook plus two new scenarios (S6 = 5k synthetic-user cron, S7 = simulated BV key ban).

| Order | PR | Priority | Effort | Why this order |
|---|---|---|---|---|
| 8  | Cron shard count bump (8 → 24) | **P0** | 30 min | One env var. No code. Bumps cron capacity from ~1,900 user budget to ~5,700 user budget. |
| 9  | Redis-backed rate limiter + session counting | **P0** | 1 day | Closes the in-memory drift bug and removes the per-turn `groupBy` from the hot path. Two birds, one Upstash sorted-set. |
| 10 | BlockVision API key sharding (multi-key round-robin + per-key CB) | **P1** | 0.5 day | Eliminates BV-key as single point of failure. Requires a second BV Pro key (~$99/mo). |
| 11 | Telemetry alerting (Vercel + email/Slack on P5 thresholds) | **P1** | 0.5 day | Without this, PRs 8–10 ship and we still wouldn't know if they regressed. |
| 12 | Sui RPC pool (round-robin + per-endpoint health) | **P2** | 0.5 day | Defensive — current single RPC is not a measured failure, but cron + interactive overlap at 5k DAU pushes it close. |
| 13 | Load test re-run + S6/S7 (5k synthetic cron, BV key ban) | **P2** | 0.5 day | Validates the stack. |

**Total: ~3 days of focused work for a measured 5,000+ DAU posture.**

---

## PR 8 — Cron shard count bump (8 → 24)

### What changes

| Where | Change |
|---|---|
| Vercel env (audric prod) | Add `T2000_FIN_CTX_SHARD_COUNT=24` |
| t2000 ECS cron env | Mirror the same value (the cron daemon reads it to know how many parallel POSTs to fire) |

### Why this works

Each shard processes `users.filter((_, i) => i % 24 === shardIndex)`. With 5,000 users that's ~210 users/shard at ~1.3s/user = ~4.5 min/shard — under the 5min `maxDuration`. With current 8 shards: ~12.7 min, would time out.

Vercel Pro concurrent-invocation cap is 1,000. 24 shards firing simultaneously is well under.

### Effort + risk

30 min. Risk: low. The shard count is a pure parallelism dial — every shard is idempotent, no shared state, no DB contention concern at this scale.

### Validation

- Trigger cron manually with synthetic 5k users in staging
- Slowest shard < 5min, all 24 return 200, total user count matches input

---

## PR 9 — Redis-backed rate limiter + session counting

### What changes

**Replace `audric/apps/web/lib/rate-limit.ts`:** swap the in-memory `Map<string, number[]>` for an Upstash sorted-set sliding window. Same `rateLimit(key, max, windowMs)` signature so callers don't change.

```typescript
// New impl (sketch)
export async function rateLimit(key: string, maxRequests: number, windowMs: number) {
  const now = Date.now();
  const cutoff = now - windowMs;
  const redisKey = `rl:${key}`;

  // Pipeline: ZREMRANGEBYSCORE + ZADD + ZCARD + EXPIRE
  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(redisKey, 0, cutoff);
  pipeline.zadd(redisKey, { score: now, member: `${now}:${Math.random()}` });
  pipeline.zcard(redisKey);
  pipeline.expire(redisKey, Math.ceil(windowMs / 1000) + 60);
  const [, , count] = await pipeline.exec<[number, number, number, number]>();

  if (count > maxRequests) {
    return { success: false, remaining: 0, retryAfterMs: windowMs };
  }
  return { success: true, remaining: maxRequests - count };
}
```

**Move session counting to the same store:**

`audric/apps/web/app/api/engine/chat/route.ts` currently does `prisma.sessionUsage.groupBy({ by: ['sessionId'], where: { address, createdAt: { gte: 24h } } })` on every turn. At 5k DAU peak this is ~1,500 concurrent groupBys.

Replace with a Redis sorted-set per address (`session-count:<address>`), score = `Date.now()`, member = `sessionId`. Same sliding-window pattern as rate limit. `ZCARD` returns active distinct session count in O(log n). DB still records the SessionUsage row (audit trail), but the hot-path read goes to Redis.

### Why this works

| Problem | Before | After |
|---|---|---|
| In-memory rate limit drifts across N Vercel instances | Effective cap = N × configured | Single Redis source of truth, accurate ±5% |
| `groupBy` query on every chat turn | ~50ms/query × 1,500 concurrent = DB pressure | Redis pipeline ~5ms, no DB load |
| `sessionUsage` table grows unbounded | Same | Same — keep DB writes for audit, but reads off it |

### Effort + risk

1 day (4h impl + 2h tests + 2h migration plan). Risk: medium-low. The new `rateLimit` is a drop-in. The session-count migration needs a one-time hydration: on cold start, populate `session-count:<address>` for all active addresses from the last 24h of `SessionUsage`. Idempotent — if Redis loses the key, the next chat turn re-populates.

### Validation

- Unit test: 30 concurrent calls in same window count correctly across 3 simulated "instances"
- Integration test: hit `/api/engine/chat` 25× in < 1 min with same JWT → expect 5 × 200 + 20 × 429 (currently this passes only because tests run on a single Vercel instance — re-test with multi-instance)
- Load test: S1 at 100 VUs from k6 Cloud (multi-IP, no per-IP cap) — check that DB session-count groupBy disappears from p95 query latency

---

## PR 10 — BlockVision API key sharding

### What changes

**Engine:** `packages/engine/src/blockvision-prices.ts` already takes a single `blockvisionApiKey` from `ToolContext`. Extend `ToolContext` to accept `blockvisionApiKeys: string[]` (or comma-separated string). Round-robin per request via a `useNextBvKey()` helper. Per-key circuit-breaker state (`Map<key, CBState>`) — if one key trips, the next request rolls to the next key.

**Audric:** `lib/env.ts` accepts `BLOCKVISION_API_KEY` (existing) **and** `BLOCKVISION_API_KEY_2` (new optional). Engine factory threads the array through.

**Telemetry:** `bv.requests` already tagged. Add `key=<index>` tag (don't log the raw key) so per-key health is visible.

### Why this works

| Failure mode | Before | After |
|---|---|---|
| Single key hits BV's per-key burst cap | All users degraded (sticky-positive cache holds for 30 min, then real failures) | Round-robin to key 2; user-visible impact: zero |
| Single key gets temp-banned by BV | Same as above | Same as above |
| BV-side outage (both keys affected) | We were going to fail here regardless | Same — but the key-shard isn't the SPoF |

### Effort + risk

0.5 day. Risk: low. Drop-in extension to existing per-request key parameter. **Requires:** purchase a second BlockVision Pro key (~$99/mo). Worth it — eliminates the largest single point of failure in the read path.

### Validation

- Unit test: round-robin distributes evenly across 100 calls
- Integration test: simulate one key returning 429 — verify next call uses the other key
- Production: spot-check `/admin/scaling` after deploy — `bv.requests` counter should split ~50/50 across `key=0` and `key=1` tags

---

## PR 11 — Telemetry alerting

### What changes

**Vercel Observability alerts** on the metrics shipped in PR 5. Email + Slack webhook destinations.

| Alert | Threshold | Severity |
|---|---|---|
| `bv.cb_open` gauge stays at 1 for > 5 min | 5min | P5 — page on-call |
| `navi.cb_open` gauge stays at 1 for > 5 min | 5min | P5 — page on-call |
| `bv.cache_hit / bv.requests` ratio drops below 0.85 over 15 min window | 15min | P3 — Slack only |
| `cron.fin_ctx_shard_duration_ms` p99 > 240,000ms (4 min — warning at 80% of budget) | per-run | P3 — Slack only |
| `anthropic.tokens` daily counter exceeds budget | daily 09:00 UTC | P3 — email |
| `upstash.requests` rate exceeds plan (e.g. 80% of monthly cap) | daily | P3 — email |
| `sui_rpc.requests` 429-tagged rate > 5% over 10 min | 10min | P3 — Slack only |

### Why this works

PR 5 shipped the metrics; PR 11 closes the loop by making them actionable. Without alerting, a 90% → 60% cache hit drop (i.e. something broke the cache layer silently) goes unnoticed until a user complains.

### Effort + risk

0.5 day. Risk: zero — Vercel Observability alerts are configured via dashboard, not code. The only "code" change is pinning a runbook (`audric/RUNBOOK_scaling_alerts.md`) describing what each alert means and the first-line response.

### Validation

- Trigger each alert manually via test condition (e.g. revoke BV key for 5 min in staging) → confirm Slack message arrives
- Runbook handoff to founder + on-call rotation

---

## PR 12 — Sui RPC pool

### What changes

**Engine:** `packages/sdk/src/clients.ts` (or wherever the `SuiJsonRpcClient` is instantiated) accepts `urls: string[]`. Per-request round-robin with per-endpoint health (mark dead for 30s after 3 consecutive 429/5xx).

**Audric:** `env.ts` accepts `SUI_RPC_URLS` (comma-separated). Defaults to a list of 2–3 free public endpoints (Mysten + Triton One + Suiscan) so we have automatic failover even without a paid plan.

**Telemetry:** add `endpoint=<index>` tag to `sui_rpc.requests`.

### Why this works

At 5k DAU during cron + interactive overlap, public Sui RPC sees ~10–15 calls/sec from us. The Mysten public endpoint handles this fine in the median case but tail-spikes around scheduled ecosystem events (NFT mints, etc.) push us into 429 land. Pool of 3 distributes the spike.

### Effort + risk

0.5 day. Risk: low. Adds a small per-request overhead (round-robin selection + health check) that's negligible at scale.

### Validation

- Unit test: round-robin + dead-endpoint behavior
- Integration test: take one endpoint down (mock 503) → verify traffic shifts to remaining endpoints
- Production: `/admin/scaling` shows `sui_rpc.requests` split across endpoint tags

---

## PR 13 — Load test re-run + 2 new scenarios

### What changes

Re-run the v1 k6 playbook (`loadtest/`) against the post-PR 8–12 production. Add two new scenarios:

**S6 — 5k synthetic-user cron**
Bash script that POSTs to `/api/internal/financial-context-snapshot?shard=i&total=24` with a synthetic 5,000-user dataset (seeded in staging). Asserts: every shard 200, slowest < 4 min, total user count matches input.

**S7 — Simulated BV key ban**
Run S2 (viral wallet, 100 VUs) but pre-flight rotate the primary BV key to an invalid value via env override. Assert: `bv.cb_open` flips for `key=0` within 30s, all subsequent requests served by `key=1`, user-visible response stays positive throughout.

### Why this works

S6 validates PRs 8 + 9. S7 validates PR 10. Combined with S1–S5 from v1, the 7-scenario suite covers every change in this spec.

### Effort + risk

0.5 day (mostly writing S6/S7 + running the suite once). Risk: zero — pure validation.

### Validation

All 7 scenarios green.

---

## What we explicitly don't need to do for 5k DAU

These came up during scoping and got cut. Documenting them so we don't re-litigate:

- **Move chat-route to Edge runtime.** Current Node runtime handles the load fine; Edge would force us to rewrite around streaming-response constraints. Defer to 10k+.
- **Anthropic cache-control prefix audit.** The prompt is already structured for prefix caching; tweaking it is high-effort/low-yield until we see a measurable cache_read_tokens / input_tokens drop.
- **Postgres read replica / Neon scale-to-zero tuning.** Connection pool is fine via Neon serverless adapter at 5k DAU. PR 9 removes the dominant per-turn query.
- **Multi-region.** Single region (iad1) is fine until ~10k DAU or until we have enough non-US users to justify the per-instance Redis sync complexity.
- **MCP gateway scaling.** Audric uses MPP services through a single internal API call; the gateway handles its own scaling (different repo, different team).

---

## Estimated incremental cost at 5k DAU

| Provider | v1 spend (1k DAU) | v2 incremental (5k DAU) | Notes |
|---|---|---|---|
| Vercel Pro | ~$70 | +$50–100 (function-time scales with DAU) | Same plan, more compute |
| AWS ECS cron | ~$15 | +$0 | Same Fargate task |
| Upstash Redis | ~$10 | +$30–60 | More commands; PR 9 adds rate-limit + session-count writes per chat turn |
| BlockVision Pro | $99 | **+$99** | PR 10 needs a second key |
| Anthropic | $300–800 | **+$2,000–4,000** | Linear with chat volume; biggest variable |
| Postgres (Neon) | $20–50 | +$30 | Same writes, slightly more storage |
| k6 Cloud | $89 | +$0 | Same plan |
| Total | ~$543–1,133 | **~$2,750–5,400** at 5k DAU | Anthropic dominates; PR 11 budget alerts surface this in time to act |

Anthropic is the cost wall, not infra. PRs 8–13 cost ~$130/mo extra; the rest is LLM spend that scales with usage and is the right kind of cost to incur (revenue-coupled).

---

## Acceptance criteria for "ready for 5,000+ DAU"

- [ ] PR 8 deployed (env var bump) + manual cron run with 5k synthetic users completes < 4 min
- [ ] PR 9 merged + integration test confirms in-memory rate limit drift gone
- [ ] PR 10 merged + second BV key purchased + `bv.requests` shows balanced traffic
- [ ] PR 11 alerts firing on staging-simulated breaches; runbook handed off
- [ ] PR 12 deployed + Sui RPC traffic shows split across pool
- [ ] PR 13 — all 7 k6 scenarios green
- [ ] No P5 alerts fired in production for 7 days post-merge
- [ ] X post can honestly say "Ready for 5,000+ DAU"

---

## Resolved decisions

| Question | Decision | Rationale |
|---|---|---|
| Move chat to Edge runtime? | **No** | Streaming + tool dispatch fits the Node runtime today. Edge would force rewrites for ~no measurable win at 5k DAU. |
| Self-hosted Sui RPC? | **No** | Free public RPCs + pool (PR 12) cover 5k DAU comfortably. Defer to 10k+. |
| Pay BlockVision Enterprise? | **No** | Two Pro keys ($198/mo) gives us higher effective throughput AND key-level resilience for the same dollar. |
| Add a second observability vendor (Datadog/Axiom)? | **No** | Vercel Observability + alerts (PR 11) is sufficient. Graduate when we have a paying ops team. |
| Move sessionUsage off Postgres entirely? | **No, keep audit row** | Redis is the read source (PR 9); Postgres remains the source of truth for billing/audit. |
| Cron shard count after PR 8? | **24** | At 5k DAU = ~210 users/shard × 1.3s = ~4.5min, well under 5min budget. Tunable upward via env if user count climbs. |
| When to re-spec? | **At 8,000+ DAU** | PR 8–13 give ~5–6k DAU headroom. Past 8k we hit Anthropic tier ceilings and Vercel Pro concurrency limits. |

---

## Cross-references

- v1 spec → `audric-scaling-spec.md`
- v1 implementation → S.27 / S.28 / S.29 in `audric-build-tracker.md`
- Load-test playbook → `loadtest/` (k6 scenarios + reports)
- Telemetry surfaces → `audric/apps/web/app/(internal)/admin/scaling/page.tsx`
- Per-IP rate limiter → `audric/apps/web/lib/rate-limit.ts`
- Session counting → `audric/apps/web/app/api/engine/chat/route.ts`
- Engine BlockVision integration → `packages/engine/src/blockvision-prices.ts`
- Engine Sui RPC clients → `packages/sdk/src/clients.ts`

*Last updated: April 29 2026.*
