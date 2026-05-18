# SPEC 19 Phase E — BlockVision Outage Drill (Staging)

> **Owner:** Founder (manual). **Cadence:** quarterly (per D-6 in `SPEC_19_PERFORMANCE_RELIABILITY_SWEEP.md`). **Time-box:** 30 min. **Output:** observation log appended to this runbook + closeout ✅/❌ on each gate.

---

## Why this drill exists

Production telemetry is reactive — it tells us about a degradation AFTER users hit it. This drill is proactive: simulate the worst external dependency failure (BlockVision goes down or starts 429-throttling) and confirm Audric degrades gracefully.

The drill is **not a theoretical test** — every gate maps to a real degradation path that fired in production at least once (the April 2026 silent-degradation incident was the precipitating event; see `env-validation-gate.mdc` for the postmortem).

## Setup (~5 min)

1. **Pick a staging deploy** with the latest engine version (currently `v1.24.14+`). Verify in Vercel Observability that the app is healthy at baseline (resume_stream p95 < 3s, defi.cache_hit{freshness:fresh} > 70%).
2. **Have ready:**
   - The staging app URL (e.g. `audric-staging.vercel.app`).
   - A wallet with at least 1 USDC + 1 SUI + ≥ $5 NAVI savings position so DeFi reads have non-empty payloads.
   - Vercel Observability open in a side tab, filtered to the staging deploy.
   - This runbook open to log observations as you go.

3. **Choose a simulation method** (pick ONE, document which):
   - **Method A — bad API key (recommended, fastest):** in Vercel staging env vars, temporarily set `BLOCKVISION_API_KEY=invalid_drill_key`. Redeploy. All BV calls now 401. Wait ~60s for the deploy.
   - **Method B — outbound block (more realistic):** add a Vercel `Edge Config` rule blocking `*.blockvision.org`. Redeploy. All BV calls now `network_err` / DNS-fail.
   - **Method C — slow network (most realistic):** route BV calls through a throttled proxy (e.g. `mitmproxy --set stream_large_bodies=1k --set throttle=...`). Hardest to set up; skip unless investigating a specific tail-latency regression.

   For the quarterly drill, **Method A** is sufficient — it exercises the same retry / circuit breaker / sticky-cache paths as a real outage.

## The 4 observations (ALL must pass)

### Observation 1 — Retry telemetry fires correctly

**Action:** Open the staging app, send any chat message that triggers a `balance_check` (e.g. "what's my balance?"). Watch Vercel Observability live.

**Expected:**
- `bv.requests{status:401, attempt:0}` increments (one per attempt under Method A) — OR `bv.requests{status:network_err, attempt:0}` under Method B.
- `external.retry_count{vendor:bv, outcome:exhausted, attempts:3}` increments after the loop exhausts.
- The retry layer does NOT keep hammering — exactly 3 attempts, then exits.

**Gate G-E1:** ✅ if both counters fire as described, ❌ if either is missing or `external.retry_count` shows wrong outcome / attempts count.

**Common failures:**
- `external.retry_count` shows `outcome:first_try` → the retry helper bypassed the loop. Check `fetchBlockVisionWithRetry` was actually called.
- More than 3 `bv.requests` per call → retry budget regression. Check `BV_RETRY_MAX_ATTEMPTS` const in `blockvision-prices.ts`.

### Observation 2 — Circuit breaker opens after sustained failures

**Action:** Continue sending messages that trigger BV reads. Aim for ~10 BV calls in < 5 seconds (e.g. quickly fire 4-5 chat messages — each triggers a balance_check + portfolio refresh on the post-write path).

**Expected:**
- After ~10 cumulative 429s/401s in 5s, `bv.cb_open` gauge ticks to 1.
- Vercel error log shows `[blockvision] circuit breaker OPEN — 10 429s in 5000ms, retries disabled for 30s` (Method B will say `network_err` instead of `429`).
- Subsequent BV calls within the 30s window do NOT increment `bv.requests` further — the breaker short-circuits without the network call.
- `external.retry_count{vendor:bv, outcome:exhausted, attempts:1}` increments (CB-open exit path) instead of `attempts:3`.

**Gate G-E2:** ✅ if breaker opens at the threshold + traffic stops + correct telemetry. ❌ if breaker doesn't open after >10 failures, or if `bv.requests` keeps incrementing during open window.

**Common failures:**
- Breaker doesn't open → `cbRecord429` may not be wired in the network-err path (Method B-specific bug). File as P1.
- Breaker opens but BV calls still fire → `cbIsOpen` check missing at top of retry loop. File as P0.

### Observation 3 — Read tools degrade gracefully

**Action:** While BV is down, open the wallet panel (force a `balance_check` + `savings_info` + `portfolio_analysis` call). Check the rendered output.

**Expected:**
- Wallet panel shows **last-known cached values**, not zeros — the sticky-positive cache (15s fresh + 30min sticky window) serves the last good response.
- `defi.cache_hit{freshness:stale-served}` increments — proves the sticky-positive fallback is firing.
- `wallet.cache_hit{freshness:stale-served}` increments for the same reason.
- The numbers shown are *labeled as stale* in the UI — there should be a visual indicator (currently a small "stale" tag on the wallet/savings cards; if missing, file as P1 UX bug).

**Gate G-E3:** ✅ if values shown are non-zero AND cached AND visually labeled. ❌ if values go to $0 (silent degradation — the April 2026 incident in regression form).

**Common failures:**
- Values go to $0 → sticky-positive cache write rule isn't matching `partial+0` correctly. Check `defi-cache-sticky.test.ts` regression suite — should never have shipped if green.
- Values shown but NOT labeled stale → frontend missing the freshness tag. File as P1 UX.

### Observation 4 — Narration acknowledges degradation (no silent zeros)

**Action:** Send a chat message asking "how much do I have in DeFi?" or "what's my net worth?".

**Expected:**
- The agent narration acknowledges the degradation — language like "I'm having trouble pulling fresh DeFi data right now, here's what I last saw a few minutes ago: ...".
- The numbers cited match the cached values from Observation 3 (NOT zeros).
- The agent does NOT silently say "you have $0 in DeFi" — that's the April 2026 incident pattern.

**Gate G-E4:** ✅ if narration is honest about staleness + cites cached values. ❌ if narration cites zeros or doesn't mention degradation at all.

**Common failures:**
- Narration says "$0 in DeFi" → the engine tool returned a degraded payload but the LLM didn't see the `defiSource: 'partial-stale'` field. Check `portfolio_analysis` tool description includes the staleness handling guidance.
- Narration is generic/evasive ("I'm having trouble") with no numbers → the LLM didn't fall back to cached values. File as P1 — the cached values are the SAFE answer; suppressing them is worse than showing them.

## Cleanup (~5 min)

1. **Restore the env var / un-block / stop the proxy** depending on which Method was used.
2. **Verify recovery:**
   - Within ~30s, `bv.cb_open` returns to 0 (or auto-recovers after the 30s breaker window).
   - `bv.requests{status:2xx}` resumes incrementing.
   - `wallet.cache_hit{freshness:fresh}` returns to > 70%.
3. **Log the drill outcome below** (date, method, all 4 gates, any P0/P1 bugs filed).

## Drill log

| Date | Method | G-E1 | G-E2 | G-E3 | G-E4 | Notes / bugs filed |
|---|---|---|---|---|---|---|
| _TBD — first quarterly run_ | _TBD_ | ⏳ | ⏳ | ⏳ | ⏳ | _Founder runs after SPEC 19 closeout to seed baseline._ |

## When this drill catches a real bug

If any gate fails, file the bug at the appropriate severity:
- **P0** = silent degradation (zeros instead of staleness, breaker bypass) — block until fixed
- **P1** = degradation works but observability is broken (telemetry missing, tags wrong) — fix in the next release
- **P2** = UX gap (no staleness label, generic narration) — file in backlog, fix opportunistically

After fix, **re-run this drill** to confirm the fix held. Add a regression test to `defi-cache-sticky.test.ts` or `blockvision-retry.test.ts` so the bug can't reappear silently.

## Cross-references

- The phase that mandates this drill → `SPEC_19_PERFORMANCE_RELIABILITY_SWEEP.md` Phase E
- The metric vocabulary referenced above → `audric/.cursor/rules/metrics-and-monitoring.mdc` SLOs section
- Retry policy + outcome semantics → `audric/.cursor/rules/external-call-retries.mdc`
- Sticky-positive cache implementation → `t2000/.cursor/rules/blockvision-resilience.mdc`
- April 2026 silent-degradation postmortem → `env-validation-gate.mdc` + S.20/S.25 in `audric-build-tracker.md`
