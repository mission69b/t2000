# Harness Metrics Baseline

*Spec 1 (Audric Intelligence — Harness Correctness, v1.4) shipped at `@t2000/engine 0.41.0`. Spec 2 (Audric Intelligence — Harness Intelligence, v1.4.1) shipped at `@t2000/engine 0.47.0`. This file holds the production TurnMetrics readout used to inform Spec 2 + Spec 3 scoping.*

## 16-item harness master roster (canonical reference, captured 2026-05-05)

The harness program splits 16 numbered items across three specs. Captured here as the canonical reference because the original roster lived only in scratchpad until 2026-05-05.

| Spec | Items | Days | Status | Doc |
|---|---|---|---|---|
| **Spec 1 — Harness Correctness** | **1–7:** pending_action audit (1), session spend accumulator (2), ACI tool constraints (3), HarnessMetrics (4), spec consistency (5), pending_action modification protocol (6), [item 7 folded into Spec 1 during v1.3 audit] | ~6d | ✅ Shipped engine `0.41.0` | `AUDRIC_HARNESS_CORRECTNESS_SPEC_v1.3.md` |
| **Spec 2 — Harness Intelligence** | **8–12:** tool result quality (8), orientation injection (9), session warm-up (10), advice guard (11), tool group routing (12) | ~6d | ✅ Shipped engine `0.47.0` | `AUDRIC_HARNESS_INTELLIGENCE_SPEC_v1.4.1.md` |
| **Spec 3 — Harness Depth** | **13–16:** scratchpad (13), error retry (14), on-chain verification (15), thickness audit (16) | ~8d | ❌ v0.1 placeholder only — gated on 30d post-SPEC-8 telemetry + SPEC 9 v0.1.1 + SPEC 10 ship | `AUDRIC_HARNESS_DEPTH_SPEC_v0.1.md` |

The Spec 3 v0.1 placeholder doc lives at the t2000 repo root alongside Spec 1 + Spec 2 (gitignored). When the gating criteria are met, this file gets refreshed as a v2 baseline (`harness-metrics-baseline-v2.md`) using the same playbook that produced the 696-turn Run 3 baseline below — that data informs Spec 3 v1.0 priority ordering between items 13/14/15/16.

**Item 16 fast-track rejected (2026-05-05):** Originally floated as a 0.5d Phase 0 ship-ahead. Rejected on token-budget tightness (54-token runway pre-SPEC-9/10), self-grading signal noise, and the availability of better behavior signals from SPEC 9/10 ship data. Item 16 stays a v1.0 item with no special priority. See `AUDRIC_HARNESS_DEPTH_SPEC_v0.1.md` § Item 16 for full rationale.

---

## Snapshot


| Window                                   | Date range                                          | Turns   | Sessions | Users  | Cost (USD) |
| ---------------------------------------- | --------------------------------------------------- | ------- | -------- | ------ | ---------- |
| Run 1 (Apr 23 evening, ~10h post-deploy) | 2026-04-23 to 2026-04-24                            | 28      | —        | —      | —          |
| Run 2 (Apr 24 morning)                   | 2026-04-23 to 2026-04-24                            | 49      | —        | —      | —          |
| **Run 3 (this baseline, Apr 25)**        | **2026-04-23 06:42 → 2026-04-25 03:15 UTC (44.6h)** | **696** | **66**   | **17** | **$13.48** |


`per_user = $0.79`, `per_session = $0.204`.

## Baseline queries — full results (run 2026-04-25)

### Q1 — Effort routing (is the classifier picking sensibly?)


| Effort | Model                     | Turns | Avg wall (ms) | Avg cost (USD) |
| ------ | ------------------------- | ----- | ------------- | -------------- |
| low    | claude-haiku-4-5-20251001 | 526   | 4,614         | $0.00888       |
| medium | claude-sonnet-4-6         | 116   | 7,792         | $0.04790       |
| high   | claude-sonnet-4-6         | 54    | 9,111         | $0.06017       |


- **75.6% / 16.7% / 7.8%** split. Haiku is doing the bulk of the load at 1/5th the cost of Sonnet medium and 1/7th of high.
- Wall time scales sensibly (4.6s → 7.8s → 9.1s).
- **Verdict:** classifier is healthy. No re-tuning needed in Spec 2.

### Q2 — Tool latency p50/p95 + ACI refinement %


| Tool                    | Calls | p50 (ms) | p95 (ms)  | Refinement % |
| ----------------------- | ----- | -------- | --------- | ------------ |
| balance_check           | 75    | 886      | **8,368** | 0            |
| activity_summary        | 16    | 2,893    | 4,972     | 0            |
| portfolio_analysis      | 19    | 2,713    | 4,762     | 0            |
| yield_summary           | 16    | 2,608    | 4,691     | 0            |
| health_check            | 33    | 1,038    | 3,113     | 0            |
| savings_info            | 33    | 939      | 2,957     | 0            |
| mpp_services            | 30    | 106      | 2,931     | **36.7**     |
| navi_navi_search_tokens | 5     | 1,914    | 2,423     | 0            |
| volo_stats              | 3     | 1,119    | 2,130     | 0            |
| rates_info              | 15    | 1,191    | 1,931     | 0            |
| defillama_yield_pools   | 9     | 702      | 1,870     | **0**        |
| transaction_history     | 38    | 496      | 1,760     | **13.2**     |
| web_search              | 16    | 616      | 739       | 0            |
| explain_tx              | 3     | 256      | 666       | 0            |
| swap_quote              | 10    | 497      | 526       | 0            |
| render_canvas           | 17    | 20       | 99        | 0            |
| save_contact            | 3     | 16       | 22        | 0            |
| record_advice           | 2     | 17       | 22        | 0            |
| **swap_execute**        | **6** | **0**    | **0**     | —            |


- **balance_check p95 = 8.4s** is the dominant tail latency contributor — Sui RPC slowness, especially when fetching all owned coins.
- `swap_execute` shows `0/0` latency because writes execute client-side via `pending_action` and the metric only captures server-dispatched tool time. **Instrumentation gap — fix in Spec 2.**
- `mpp_services` ACI refinement firing **36.7%** of calls (good — model is hitting the cap and learning to refine).
- `defillama_yield_pools` ACI refinement at **0%** — either queries aren't broad enough to trip the cap, or the cap is set high enough to never bite. Worth a constraint tighten in Spec 2.

### Q3 — Prompt cache hit % by day


| Day        | Turns | Cache hit % | Cache token % vs input |
| ---------- | ----- | ----------- | ---------------------- |
| 2026-04-23 | 62    | 21.0        | 235                    |
| 2026-04-24 | 608   | **89.6**    | 10,928                 |
| 2026-04-25 | 26    | 84.6        | 1,940                  |


- Apr 23 was the rollout day with the cache-metric measurement bug (later fixed in PR #54). Cache **was** working from day 0; the metric was lying. Apr 24 onward shows real numbers.
- **84-90% cache hit rate is excellent.** Don't touch.
- `cache_token_pct` is a noisy ratio (cache reads are not in input tokens), so the "10928%" figure is an artifact of the formula, not a real signal. Drop or rename in Spec 2.

### Q4 — Guards fired


| Guard            | Action    | Fires |
| ---------------- | --------- | ----- |
| balance_required | allow     | 304   |
| slippage_warning | allow     | 11    |
| health_factor    | allow     | 9     |
| irreversibility  | allow     | 9     |
| **swap_preview** | **block** | **6** |
| large_transfer   | allow     | 1     |


- `swap_preview` blocked 6 attempts where the LLM tried to call `swap_execute` without a recent `swap_quote` — exactly the gap that v1.4-PR #70 was meant to close. **Working as designed.**
- All other guards are pass-through allow-mode (informational hints, not blocks).

### Q5 — Real wall-time p50/p95/p99 + first-token latency


| Metric      | p50      | p95           | p99       |
| ----------- | -------- | ------------- | --------- |
| Wall time   | 4,061 ms | **13,834 ms** | 24,675 ms |
| First-token | 3,017 ms | 9,779 ms      | —         |


- p95 wall of **13.8s is high** but plausible for multi-tool turns (Sonnet thinking + 3-4 tool calls + write).
- First-token p50 of 3.0s is the perceived latency floor — driven by Anthropic streaming start, prompt-cache lookup, and tool dispatch.
- **Spec 2 target:** drive p95 first-token below 5s by trimming the static prompt or eagerly dispatching the first read tool.

### Q6 — ACI refinement on the 3 protected tools


| Tool                  | Refinement % | Calls |
| --------------------- | ------------ | ----- |
| mpp_services          | 36.7         | 30    |
| transaction_history   | 13.2         | 38    |
| defillama_yield_pools | 0            | 9     |


(See Q2 commentary.)

### Q7 — `mutableToolDedupes` (post-write stale-data audit, added in v1.5.1)


| Turns | Total dedupes | Avg per turn | Turns with dedupes |
| ----- | ------------- | ------------ | ------------------ |
| 696   | 11            | 0.02         | 11                 |


- 11/696 turns (**1.6%**) hit a case where the post-write `balance_check` was served from cache instead of refreshed. **Acceptable.** The 1.5s settle delay shipped in `t2000#73` is doing its job.
- All 11 dedupes happened in the 6 hours after the fix went live and before the cache state stabilized. Re-run after 7 days to confirm decay to 0.

### Q9 — `pendingActionOutcome` distribution


| Outcome  | Raw turns | Excluding bot session | % of real |
| -------- | --------- | --------------------- | --------- |
| pending  | 279       | **24**                | 39%       |
| approved | 38        | 37                    | 60%       |
| modified | 1         | 1                     | 1%        |
| (denied) | 0         | 0                     | 0%        |


**⚠️ Headline corrected (2026-04-25 follow-up):** the raw "40% leak" number is a measurement artifact, not a system bug. Single session `s_1777047351366_d172f3de05f0` contributed **255 of the 279** pending rows — 251 of them clustered on `turnIndex=8`. That's a smoke-test or bot replaying the same prompt against a write tool, not a real user. Excluding it, the **real abandon rate is 39% (24/62)** — completely normal for a wallet-signing confirmation card.

Code trace confirms the resolution write is **not** racing:

- Chat route `app/api/engine/chat/route.ts:196` and engine `packages/engine/src/engine.ts:1123` both compute `turnIndex = assistant-message-count` at the moment of yield (engine deliberately does not push the assistant message — line 1112). They agree on N.
- Resume route `app/api/engine/resume/route.ts:188` does `prisma.turnMetrics.updateMany({ where: { sessionId, turnIndex: action.turnIndex }, ... })` in the SSE `finally` block — minutes after the chat route closed. No race window.
- 38 resolved rows prove the write path works.

**0 denials** is consistent with the abandon hypothesis — Audric's permission card is approve-or-walk-away, not a hard binary. Real users just close the tab.

**Two real (smaller) bugs surfaced while investigating, folded into Spec 2 Item 3:**

1. **No unique constraint on `(sessionId, turnIndex)`.** Real (non-bot) sessions show 2–3 TurnMetrics rows at the same `turnIndex`. Happens when a user proposes a write, abandons, then re-asks — `turnIndex` doesn't advance because the abandoned assistant message was never pushed (engine line 1112). Subsequent chat-route invocations write another row at the same `turnIndex`. `updateMany` then updates ALL of them.
2. **Resume route emits no TurnMetrics row.** No `TurnMetricsCollector`, no `prisma.turnMetrics.create`. Chained writes, post-approval narrations, and tool calls inside resumed turns are invisible. **This is also why `swap_execute` shows 0ms latency** in Q2 — its execution lives in the resume route. Fixes for Item 3 (pending leak) and Item 4 (`swap_execute` latency) are the same code change.

### Bonus — Tokens by effort


| Effort | Avg input | Avg output | Avg cache read | Avg cache write |
| ------ | --------- | ---------- | -------------- | --------------- |
| low    | 2,038     | 122        | 17,958         | 1,130           |
| medium | 3,889     | 202        | 22,703         | 6,802           |
| high   | 5,303     | 296        | 10,738         | 8,981           |


- Cache **reads** dominate input on every effort tier (10-22k cached vs 2-5k fresh), which is why the cost-per-turn stays so low.
- High-effort writes far more cache (8,981 avg) — expected for longer reasoning chains.

### Bonus — Compaction


| Turns | Compaction triggered |
| ----- | -------------------- |
| 696   | 0                    |


- Microcompact didn't fire once. Max session depth was 73 turns. No compaction pressure yet.

## Headline takeaways


| Area                           | Status                                                  | Action                                                                                                                |
| ------------------------------ | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Effort routing                 | ✅ Healthy 76/17/8 split                                 | none                                                                                                                  |
| Cache hit rate                 | ✅ 85-90% post Apr-23                                    | none                                                                                                                  |
| Cost discipline                | ✅ $0.20/session, $0.79/user/2-day                       | none                                                                                                                  |
| `swap_preview` guard           | ✅ Blocking missing-quote calls                          | none                                                                                                                  |
| `mutableToolDedupes`           | ✅ 1.6%, declining                                       | re-check after 7d                                                                                                     |
| `compactionTriggered`          | ✅ Never fires                                           | none until sessions get longer                                                                                        |
| balance_check tail             | ⚠️ p95 8.4s                                             | **Spec 2: Sui RPC fan-out / parallelism**                                                                             |
| `swap_execute` instrumentation | 🐛 Reports 0ms (writes via pending_action)              | **Spec 2: capture client-side execution time**                                                                        |
| `defillama_yield_pools` ACI    | ⚠️ 0% refinement                                        | **Spec 2: tighten constraint cap**                                                                                    |
| `pendingActionOutcome=pending` | ⚠️ 39% real abandon (raw 40% inflated by 1 bot session) | **Spec 2: timeout job + analytics filter + `(sessionId,turnIndex)` unique index + resume-route TurnMetrics emission** |
| `cache_token_pct` formula      | 🐛 Math artifact (10928%)                               | **Spec 2: drop or rename column**                                                                                     |
| First-token p95                | ⚠️ 9.8s                                                 | **Spec 2: eager-dispatch first read**                                                                                 |


## Spec 2 candidate scope (informed by data)

1. **Wall-time tail kill.** `balance_check` p95 8.4s is the single biggest contributor to p99. Either (a) parallel multi-coin RPC fan-out, (b) cache balance for ~5s within a turn, or (c) move to grpc once Mysten ships GA (Phase G).
2. `**swap_execute` (and other write-tool) latency capture.** Today writes show `0ms` because the engine-side `tool_call` dispatch ends at the `pending_action` boundary AND the resume route emits no TurnMetrics row. Wire a `TurnMetricsCollector` into the resume route and capture client-reported execution time from `executionResult`. **Same code change as Item 3 below.**
3. `**pendingActionOutcome` hygiene (NOT a race condition).** Real abandon rate is 39% — the raw 40% leak figure was inflated by one bot session (`s_1777047351366_d172f3de05f0`, 255 unresolved yields on `turnIndex=8`). Resolution-write code path is healthy. Spec 2 fix is four small things: (a) timeout job marking `pending` rows older than 15min as `'timeout'`; (b) analytics filter or `synthetic: true` flag for internal test traffic; (c) unique index on `(sessionId, turnIndex)` + chat-route `create` → `upsert` (or move `turnIndex` to a monotonic per-session counter so abandoned turns advance the index); (d) resume-route TurnMetrics emission (merges with Item 2).
4. **First-token p95 trim.** Eager-dispatch the first `cacheable: false` read tool while the LLM is still warming up — current 9.8s is mostly "Anthropic streaming start" and "prompt-cache lookup" stacked behind the tool call.
5. **Drop or rename `cache_token_pct`.** The current ratio is meaningless. Replace with `cache_savings_usd` (cached input × Anthropic price delta).

## Spec 3 candidate scope (already drafted in master plan)

The master harness-upgrade plan reserves Spec 3 for:

- On-chain transaction verification (async post-execution `balanceChanges` check) — would also kill the residual `mutableToolDedupes`.
- Trace replay tests against real TurnMetrics fixtures.
- Result-quality scoring (`resultUsed` signal) — informs a future tool-deprecation cycle.

These are independent of Spec 2's latency/instrumentation focus and can run in parallel if you want to split tracks.

---

*Generated 2026-04-25 from prod NeonDB. To re-run: `pnpm exec tsx` against the queries in `AUDRIC_HARNESS_CORRECTNESS_SPEC_v1.3.md` lines 1276-1318.*