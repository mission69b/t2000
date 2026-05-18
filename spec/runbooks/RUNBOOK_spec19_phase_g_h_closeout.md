# SPEC 19 Phase G+H — Telemetry Verification + Closeout Smoke

> **Owner:** Founder (~30 min total). **Run after** v1.24.14 (Phase F) is deployed to audric production. **Output:** ✅/❌ on each gate + raw log appended for the SPEC 19 closeout (S.135).

---

## Phase G — Verify Phase F telemetry is emitting in production (~10 min)

The goal is **not** to validate retry behavior under stress — that's Phase E. The goal is to confirm the new `external.retry_count` counter is wired correctly and showing up in Vercel Observability. Without this, all the SLO targets in `audric/.cursor/rules/metrics-and-monitoring.mdc` are unobservable.

### Setup

1. Confirm production is on `@t2000/engine@1.24.14` AND audric web has redeployed:
   ```bash
   cd /Users/funkii/dev/audric
   git log --oneline -3 | grep "v1.24.14"   # should match the audric bump commit
   ```
2. Open Vercel Observability for the audric production project. Switch to last-1-hour window.

### Gate G-G1 — `external.retry_count` exists in the metric catalog

Action: in the Vercel Observability search box, type `external.retry_count`. The metric should auto-complete.

✅ if the metric shows up. ❌ if it doesn't (means no production traffic has hit a retry path yet OR the counter isn't wired).

### Gate G-G2 — `external.retry_count{vendor:bv}` is emitting

Action: send 5-10 chat messages in production that trigger BV reads (any chat triggers `balance_check`). Wait ~60s. Filter Vercel Observability by `name:external.retry_count vendor:bv` and check for non-zero counts.

Expected breakdown (steady-state production):
- `outcome:first_try` ≈ 95-100% of total
- `outcome:retried_success` < 5%
- `outcome:exhausted` ≈ 0% (only fires during BV degradation)

✅ if `first_try` count > 0 AND outcome distribution looks healthy. ❌ if `first_try` is 0 (counter not firing) OR `exhausted` > 5% (vendor degradation — investigate before continuing).

### Gate G-G3 — `external.retry_count{vendor:anthropic}` is emitting

Action: same test (any chat turn fires Anthropic). Filter `name:external.retry_count vendor:anthropic`.

Expected: `first_try` count > 0 (every successful chat turn). Anthropic 5xx is rare in steady-state, so `retried_success` is usually 0%.

✅ if `first_try` > 0. ❌ if 0.

### Gate G-G4 — `external.retry_count{vendor:sui}` is emitting

Action: this only fires on Audric routes that use `withSuiRetry` — currently `/api/identity/reserve` (username claim) and any indexer-side Sui RPC reads. To test, sign out + sign back in with a NEW Google account (forces a username claim). OR: skip this gate if no recent claims have happened — check the metric catalog instead.

Expected: `first_try` count > 0 if any claim has run in the last hour.

✅ if `first_try` > 0 OR you can confirm the metric exists in catalog (sufficient for closeout — the wiring is verified by the test suite, this just confirms it would emit if traffic existed).

### Gate G-G5 — Existing telemetry not regressed

Spot-check that the v1.24.13 baseline counters are still live (they should be — Phase F didn't touch them):
- `bv.requests` (per-status, per-attempt)
- `bv.cb_open` gauge
- `wallet.cache_hit` + `defi.cache_hit`
- `audric.engine.resume_stream_duration_ms`
- `engine.pwr.skipped_sleep_count`
- `audric.harness.bundle_outcome_count`

✅ if all 6 still emit. ❌ if any have gone silent (means a regression in v1.24.14).

---

## Phase H — Closeout regression smoke (~20 min)

Same prompts as the v1.24.13 round-2 smoke so we have a direct before/after comparison. Goal: confirm no regression vs. v1.24.13 baselines, AND confirm the new retry counter doesn't add noticeable latency.

### Smoke prompt list (run in this exact order)

In a fresh chat session against the **production** audric app (NOT staging — production is what users see):

1. `Swap 0.05 USDC to SUI`
2. `Swap 0.04 SUI to USDC`
3. `Swap 0.05 USDC to SUI`
4. `Swap 0.04 SUI to USDC`
5. `Swap 0.05 USDC to SUI`
6. `Save 0.3 USDC then swap 0.04 SUI to USDC` *(bundle)*
7. `swap 80% of sui for usdc`
8. `Save 0.5 USDC then swap 0.05 USDC to SUI` *(bundle)*
9. `Save 0.5 USDC then swap 0.05 USDC to SUI` *(bundle)*
10. `Save 0.3 USDC then swap 0.04 SUI to USDC` *(bundle)*
11. `Save 0.5 USDC then swap 0.05 USDC to SUI` *(bundle)*

Confirm each pending action. The wallet must have ≥ $20 USDC + ≥ 22 SUI to complete all 11 turns.

### Acceptance gates (compare against v1.24.13 baselines)

| Gate | Target | v1.24.13 baseline | v1.24.14 actual |
|---|---|---|---|
| G-H1 | `audric.engine.resume_stream_duration_ms` p50 ≤ 2.5s | 2.16s | _TBD_ |
| G-H2 | `audric.engine.resume_stream_duration_ms` p95 ≤ 3.5s | 2.81s | _TBD_ |
| G-H3 | `audric.engine.resume_stream_duration_ms` p99 ≤ 5.0s (single-outlier-tolerant on sample=11) | 4.95s | _TBD_ |
| G-H4 | `engine.pwr.skipped_sleep_count` fires every write (11/11) | 11/11 | _TBD_ |
| G-H5 | `engine.pwr.observed_stale_balance_check` does NOT fire | not emitted | _TBD_ |
| G-H6 | output tokens ≤ 100 per turn (no `<thinking>` leak) | max 95 | _TBD_ |
| G-H7 | bundle outcomes = `executed` (5/5) | 5/5 | _TBD_ |
| G-H8 | system prompt cache stable at 24,504 tokens | 24,504 | _TBD_ |
| G-H9 | `external.retry_count` emits at least once per turn (Anthropic always emits) | n/a (new) | _TBD_ |
| G-H10 | NO new `exhausted` outcomes in steady-state production | n/a (new) | 0 expected |

### Pass criteria

- **All 8 v1.24.13 gates** (G-H1 through G-H8) pass = no regression.
- **Both new gates** (G-H9, G-H10) pass = Phase F is observable AND production is healthy.
- If any v1.24.13 gate regresses by more than 10% → file a P1 bug, hold SPEC 19 closeout until resolved.
- If a single Anthropic upstream outlier breaks G-H3 (4-6s tail) → acceptable on sample=11; document as known tail variance, do NOT block closeout.

### What to capture for the closeout entry

For the S.135 tracker entry I'll write, paste these from the Vercel logs after the smoke completes:

1. The 11 `audric.engine.resume_stream_duration_ms` values (one per turn).
2. The min/max/median `external.retry_count{vendor:anthropic}` count per turn.
3. Any `exhausted` outcome that fired (vendor + count).
4. Confirmation that `engine.pwr.skipped_sleep_count` fired 11 times.
5. Confirmation that `engine.pwr.observed_stale_balance_check` is absent.

---

## After Phase G+H pass

Reply in chat with the smoke output (paste Vercel logs as before). I'll:
1. Score every gate against the table above.
2. Write the S.135 tracker entry consolidating all phases (A/B/D/E/F/G/H ✅, C → SPEC 20.2).
3. Mark SPEC 19 closed in `audric-build-tracker.md`.
4. Open SPEC 20 with item #1 = pending_action route threading (which fixes S19-F2 as a side effect).

If any gate fails, surface it and I'll triage before closeout.

## Cross-references

- The phases this closes out → `SPEC_19_PERFORMANCE_RELIABILITY_SWEEP.md`
- The retry counter being verified → `audric/.cursor/rules/external-call-retries.mdc`
- The SLOs being baselined → `audric/.cursor/rules/metrics-and-monitoring.mdc` SLOs section
- The drill that exercises retry under stress → `RUNBOOK_spec19_phase_e_bv_outage_drill.md`
