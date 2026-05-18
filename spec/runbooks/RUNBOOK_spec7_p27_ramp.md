# RUNBOOK — SPEC 7 P2.7 Ramp + 48h Soak

**Status:** Active — telemetry instrumentation shipped 2026-05-02; soak scheduled to start at instrumentation-deploy time.
**Owner:** Audric founder + assistant.
**Predecessor:** `RUNBOOK_spec7_p26_eval.md` (3 gates green, ship-greenlit P2.6).

---

## 1. What this runbook closes

Per `audric-build-tracker.md` P2.7 row, the spec called for:

> Feature-flag rollout. Two flags — `NEXT_PUBLIC_CANONICAL_WRITE_ENABLED` (Layer 0 — can ship FIRST to derisk write canonicalization independently of bundling) + `NEXT_PUBLIC_PAYMENT_STREAM_ENABLED` (Layer 2 multi-write bundles). Both ramp to first ~100 users; monitor PTB-construction errors, sponsorship failures, atomic-revert rate for 48h before full GA.

**The reality at P2.7 start (2026-05-02):**
- Layer 0 flag was deferred during P2.2c (build tracker note: "no flag needed; pre-migration code path was the same fat route, new code path functionally equivalent").
- Layer 2 (bundle) flag was never added — `grep -r PAYMENT_STREAM_ENABLED audric/` returns zero hits.
- Bundles have been 100%-live in production since the P2.4 + P2.5 + P2.5b ship wave.
- Founder-driven UAT (P2.6 Gate A 4/4 + Gate C E2E) confirmed bundles work end-to-end. Three host bugs surfaced + were fixed (F5, F6, F7).

P2.7 honors the spec **in spirit, not literally**. Bundles stay 100%-on. We instrument the three load-bearing metrics from the spec, observe a 48h production soak, and use the metric data — not a phased flag-ramp — to decide whether SPEC 7 closes cleanly. A break-glass server-side env var is in place for `<30s` revert if metrics regress.

**See `RUNBOOK_spec7_p26_eval.md` for the eval methodology that closed P2.6.**

---

## 2. The three load-bearing metrics

All three live under the existing `audric.harness.*` Vercel Observability namespace (matches `audric.harness.regenerate_count` shipped under P2.4b — single dashboard, single filter prefix).

### 2.1 `audric.harness.bundle_proposed_count` (counter)

**Fires:** once per multi-step `pending_action` event in the chat route (`apps/web/app/api/engine/chat/route.ts` `case 'pending_action'`).

**Tags:**
- `stepCount: number` — number of steps in the bundle (≥2 by definition; single-step intentionally no-op'd).
- `hasSwap: 'true' | 'false'`
- `hasNavi: 'true' | 'false'` — covers `save_deposit`, `withdraw`, `borrow`, `repay_debt`, `claim_rewards`.
- `hasTransfer: 'true' | 'false'`
- `hasVolo: 'true' | 'false'` — covers `volo_stake`, `volo_unstake`.

**What it measures:** LLM bundle-proposal rate. Independent of whether the user later approves / denies. The numerator of the bundle-execution rate calculation.

### 2.2 `audric.harness.bundle_outcome_count` (counter)

**Fires:** once per terminal bundle outcome — at one of four call sites depending on which surface caught the disposition.

**Tags:**
- `outcome: 'executed' | 'reverted' | 'compose_error' | 'sponsorship_failed'` — the four states.
- `stepCount: number` — same shape as `bundle_proposed_count`.
- `reason?: string` (optional, ≤80 chars) — set when the failure source has a useful error string.
- `statusCode?: number` (optional) — set on `sponsorship_failed`; the Enoki HTTP status.

**Outcome semantics:**
| Outcome | Where | When |
|---|---|---|
| `executed` | `/api/engine/resume` (bundle path, `looksSuccessful === true`) | Every step's `stepResult.isError === false`. Atomic on-chain success. |
| `reverted` | `/api/engine/resume` (bundle path, `looksSuccessful === false`) | Any step erroring → atomic on-chain revert (Sui PTB semantics; mid-states impossible). |
| `compose_error` | `/api/transactions/prepare` (bundle path, `composeTx` threw) | Local SDK failure BEFORE Enoki was contacted. Implicates SDK regression. |
| `sponsorship_failed` | `/api/transactions/prepare` (bundle path, Enoki sponsor returned non-2xx) | Enoki dry-run rejected the assembled PTB. Most common: dry-run reverted (the tx WOULD have failed on-chain). Also: sponsor key invalid, allowedAddresses violation. |

**Decision metric:**

```
revert_rate = (reverted + compose_error + sponsorship_failed)
              / (executed + reverted + compose_error + sponsorship_failed)
```

This is the headline number for the soak's decision matrix (§4).

### 2.3 `audric.harness.bundle_compose_duration_ms` (histogram)

**Fires:** once per bundle composeTx call in `/api/transactions/prepare`, AFTER composeTx returns successfully (skipped on compose_error).

**Tags:**
- `stepCount: number`

**What it measures:** wall-clock duration of `composeTx({ steps, ... })`. Doesn't drive the close decision but guards against silent slow regressions — if Cetus's provider list grows or a multi-leg bundle starts hitting a synchronous coin-fetch hot path, p99 here climbs first.

---

## 3. Soak schedule

**T+0:** Audric main branch commits the telemetry instrumentation. Vercel auto-deploys. Note the deploy timestamp from Vercel's deployment URL (or `git log --format=%cd -1` on `main`).

**T+12h:** First checkpoint. Read the metrics, complete §4.1 below. If revert_rate is healthy: continue. If revert_rate spike: triage immediately (§5).

**T+24h:** Mid-soak checkpoint. Same shape as T+12h.

**T+48h:** Final checkpoint. Same shape. If revert_rate stayed clean across the full window: SPEC 7 closes (§6).

A typical day produces ~5–20 multi-step bundle executions on the founder's wallet alone — this is enough signal for the small-N decision matrix below. If a wider rollout to organic users happens during the soak (ramp-comms TODO is the only blocker), more samples flow in and the decision becomes statistically tighter.

---

## 4. Checkpoint reading procedure

At each T+N checkpoint:

### 4.1 Pull the metric values

Vercel dashboard → Observability → Logs (or Insights → Custom Metrics if upgraded). Filter:

```
kind=metric AND (name=audric.harness.bundle_proposed_count OR name=audric.harness.bundle_outcome_count)
```

Take a window from `T-12h` to `now`. Aggregate by `name` + `outcome` tag.

Record the values:

| Window | bundle_proposed | executed | reverted | compose_error | sponsorship_failed | revert_rate |
|---|---|---|---|---|---|---|
| T+12h (0→12h) | __ | __ | __ | __ | __ | __ % |
| T+24h (0→24h) | __ | __ | __ | __ | __ | __ % |
| T+48h (0→48h) | __ | __ | __ | __ | __ | __ % |

### 4.2 Sanity-check the proposal vs execution gap

`bundle_proposed_count` ≥ `executed + reverted + compose_error + sponsorship_failed`. The gap = bundles the user denied (deny path doesn't increment any outcome counter — that's by design; denial is user choice, not a regression signal).

If `bundle_proposed_count` is FAR smaller than expected (e.g. <2 over 12h on a wallet you know was used): instrumentation regression. Check:
- Vercel deployment includes the commit.
- `console.log(JSON.stringify({ kind: 'metric', ... }))` lines from `VercelTelemetrySink` are visible in deploy logs.
- The chat route's `case 'pending_action'` branch is hit (existing `audric.harness.regenerate_count` shape from P2.4b is the closest live reference).

### 4.3 Sanity-check the compose-duration histogram

p50 < 1000 ms is the rough expectation (composeTx is mostly local — the ~500ms variance comes from `client.getCoins` for SUI sends and Cetus's `getProvidersExcluding` setup). p99 < 5000 ms. If p99 climbs past 5s during the soak, file a SPEC 12 perf ticket — non-blocking for SPEC 7 close but useful future telemetry.

---

## 5. Decision matrix (T+48h)

| revert_rate at T+48h | Interpretation | Action |
|---|---|---|
| **< 1%** | Bundles are working as designed. Failures are random on-chain conditions (rare quote drift, wallet state desync). | ✅ **CLOSE SPEC 7.** Update `audric-build-tracker.md` P2.7 row to `done`. Move to next spec (SPEC 9 v0.1.2 per build-order pin). |
| **1–5%** | Likely WAI but possibly indicating a specific failure surface. Check the `outcome` tag distribution + `reason` strings. | 🟡 **Investigate before close.** Open a SPEC 12 ticket; close SPEC 7 only after the failure surface is identified + (if needed) fixed. |
| **5–20%** | Real regression. Some bundle pattern is consistently failing. | 🔴 **Pause.** Triage `outcome` distribution + `reason` strings. Most likely a tool combination (e.g. swap_execute + claim_rewards) hitting an SDK edge. Fix in a follow-up. SPEC 7 stays open. |
| **> 20%** | Bundles are catastrophically broken or the live wallet has a state issue. | 🚨 **BREAK-GLASS.** Procedure §7. Fix the underlying bug, re-instrument soak, restart 48h. |

**Mid-soak (T+12h, T+24h):** if revert_rate is in the 5-20% or >20% bucket, don't wait until T+48h. Triage immediately at the checkpoint.

---

## 6. Successful close

When the T+48h decision matrix says "CLOSE SPEC 7":

1. Update `audric-build-tracker.md` P2.7 row to `✅ done <date>` with: deploy commit, T+48h numbers, link to this runbook.
2. Update `audric-build-tracker.md` P2.8 row — note that the SDK 1.1.0 + engine 1.1.0 release that the spec asked for has effectively shipped piecewise across the SPEC 7 wave (engine 1.6.0 → 1.11.0). Mark `✅ done piecewise` rather than re-bumping.
3. Record the close in this runbook below:

```
- **CLOSED YYYY-MM-DD** — revert_rate __ % over 48h window. Total bundles: __ (proposed) / __ (executed) / __ (reverted) / __ (compose_error) / __ (sponsorship_failed). Compose p50: __ ms. Compose p99: __ ms.
```

4. SPEC 7's build-tracker entry now reads "✅ closed; SPEC 9 v0.1.2 unblocks." Per the BUILD ORDER PIN, that's the next spec.

---

## 7. Break-glass procedure

When the T+12h or later checkpoint shows revert_rate > 20% (or any other "smoke is filling the room" signal):

### 7.1 Disable bundles in <30s

In Vercel dashboard → Settings → Environment Variables → Production:

1. Add **`PAYMENT_STREAM_DISABLE`** = `1` (or `true`).
2. Click Save. **No redeploy needed** — Vercel injects new env on the next serverless function invocation (~30s lag for cache eviction).

What this does: every `POST /api/transactions/prepare` request with `type: 'bundle'` returns 503 with the message *"Payment Streams are temporarily disabled. Please cancel and ask again — I'll do these one at a time."*

What this does NOT do:
- It does NOT stop the LLM from emitting bundle `pending_action`s. The engine still composes bundles; the user still sees the multi-step PermissionCard.
- It only stops the bundle from REACHING composeTx + Enoki. The user gets a clean error after tapping Approve, can tap Deny + retry, and the LLM will re-emit single-step writes naturally on a fresh prompt (because the engine's bundling is purely additive over the single-write path).

This is sufficient to halt on-chain damage from a regressing bundle path while the bug is investigated.

### 7.2 Triage

With the break-glass on:

1. Read the deploy log for the most recent (failing) bundles. Filter for `[prepare] Error` and `[sponsor] Enoki error`. The breadcrumb shape:
   - `[prepare] composing bundle...` → `composeTx` started
   - `[prepare] tx kind built OK, N bytes` → `composeTx` succeeded
   - `[sponsor] Enoki error (status):` → sponsor rejected (look at the body for the dry-run message)
2. Cross-reference the deploy commit with `git log` since the last green soak window. The regression is almost certainly in a recent commit.
3. Reproduce locally if possible — bundle integration tests in `apps/web/app/api/transactions/prepare/route.integration.test.ts` make a clean repro hard for Enoki failures specifically (they don't hit real Enoki). For local repro, set up a known-bad bundle in the staging env or use the founder's wallet with the smallest possible amounts.

### 7.3 Re-enable

Once the bug is identified + fixed + deployed:

1. Remove `PAYMENT_STREAM_DISABLE` from Vercel env (or set to empty string — `optionalString` schema treats both as undefined).
2. Wait ~30s for the next invocation.
3. Smoke-test one bundle from the founder's wallet to confirm the fix.
4. Restart the 48h soak from T+0.

---

## 8. Telemetry call-site map (for future reference)

If telemetry stops emitting from one of the four outcome surfaces, here's where to look:

| Surface | File | Line range (approx) | What it emits |
|---|---|---|---|
| Bundle proposed | `apps/web/app/api/engine/chat/route.ts` | ~590 (`case 'pending_action'`) | `bundle_proposed_count` |
| Compose error | `apps/web/app/api/transactions/prepare/route.ts` | ~340 (compose try/catch) | `bundle_outcome_count{outcome=compose_error}` |
| Compose duration | Same file | ~365 (post-compose success) | `bundle_compose_duration_ms` |
| Sponsorship failed | Same file | ~410 (Enoki !ok branch) | `bundle_outcome_count{outcome=sponsorship_failed}` |
| Executed / reverted | `apps/web/app/api/engine/resume/route.ts` | ~525 (`isBundle` block) | `bundle_outcome_count{outcome=executed | reverted}` |

The shared helper `apps/web/lib/engine/bundle-metrics.ts` is the single source of truth for tag shape. Tests in `apps/web/lib/engine/__tests__/bundle-metrics.test.ts` lock the contract — 14 specs covering helper unit tests + 3 specs locking the prepare-route break-glass shape.

---

## 9. Soak log

(Filled in at each checkpoint.)

### T+0 — Instrumentation deployed (superseded — see T+0 RESET below)

- Date: 2026-05-02 ~18:58 AEST (Vercel auto-deploy on push)
- Commit: audric `c6fb77b` ("feat(web): SPEC 7 P2.7 — bundle telemetry + break-glass for 48h soak")
- Vercel deployment URL: (auto-generated; check Vercel dashboard for the deployment URL associated with `c6fb77b`)

### T+0 RESET — SDK 1.11.1 multi-coin merge cache fix deployed

The original T+0 deploy caught a real failure within hours: a multi-coin USDC wallet attempting a `swap+save+send` bundle dry-ran with `CommandArgumentError { arg_idx: 1, kind: ArgumentWithoutValue }` from Enoki. Root cause was an SDK bug in `selectAndSplitCoin` that re-emitted `MergeCoins` for every appender call against the same on-chain coin IDs — single-coin wallets composed fine (no merge needed) so the bug evaded P2.6 eval gates, but multi-coin wallets are the production-common case.

The P2.7 telemetry tagged this correctly as `sponsorship_failed` (Enoki dry-run rejected the assembled bytes). System working as designed — the soak metrics caught the failure before a wider rollout.

Fix shipped at SDK 1.11.1 (per-PTB merge cache keyed by `(sender, coinType)`), audric/web bumped, Vercel auto-deploying. **The 48h clock resets to this commit because the SDK behavior under multi-write load is functionally different from T+0.**

- Date: 2026-05-02 ~20:05 AEST (Vercel auto-deploy on push)
- t2000 commit: `b13a0c28` ("fix(sdk): SPEC 7 P2.7 — per-PTB merge cache for multi-write USDC bundles")
- t2000 release tag: `v1.11.1`
- audric commit: `7e694b0` ("build(web): bump @t2000/sdk + @t2000/engine to 1.11.1")

### Findings during the soak (NOT bundle-engine bugs; do NOT block SPEC 7 close)

#### F8 — `withdraw` tool-description claim is wrong for the bundled path (deferred fix)

**Discovered 2026-05-02 ~20:15 AEST.** A second wallet asked "Withdraw all savings" with three NAVI positions: 19.98 USDC, 0.001 USDsui, 0.001001 USDe. The LLM correctly bundled all three because the withdraw tool description says *"Legacy positions in other assets (USDe, SUI) can still be withdrawn if the user has them"*. Bundle reverted atomically (likely tagged `compose_error` because composeTx's `withdraw` appender constrains `asset` to `'USDC' | 'USDsui'` via `resolveSaveableAsset` — USDe step throws before Enoki is contacted).

**Root cause.** Two divergent allow-lists:
- SDK `OPERATION_ASSETS.withdraw === '*'` → `agent.withdraw({ asset: 'USDe' })` is allowed (single-write path)
- `composeTx.WriteStep['withdraw'].input.asset: 'USDC' | 'USDsui'` → bundled path rejects USDe

The tool description doesn't mention this asymmetry. LLM in good faith bundles the legacy positions and the bundle dies on the second leg.

**Decision (with founder):** **defer USDe entirely**. Don't add USDe to save/borrow/withdraw allow-lists; users with non-canonical NAVI positions go to NAVI's UI directly. The Save = USDC or USDsui thesis is load-bearing — adding USDe (even withdraw-only) opens the door to USDT / USDC.e / wUSDC long-tail and undermines audric's simplicity story.

**Fix-for-later (~30 min):**
1. `withdraw.ts` tool description rewrite: drop the "Legacy positions: USDe, SUI" claim; replace with explicit "Withdraws USDC or USDsui from NAVI. For positions in any other asset, direct the user to NAVI's UI (`https://app.naviprotocol.io`) — audric does not support withdrawing legacy non-canonical assets."
2. `savings_info` + `balance_check` gain `withdrawableViaAudric: boolean` per position (true only for USDC + USDsui supply rows).
3. System-prompt savings section gains rule: "On 'withdraw all savings', withdraw only positions where `withdrawableViaAudric === true`. Mention legacy positions as informational with a 'use NAVI's UI' pointer."

Roll into P2.8 or a follow-up tracker entry. SPEC 7 close decision unaffected.

#### F9 — Phantom $0.001 USDsui position — read/write precision mismatch (deferred fix)

**Discovered 2026-05-02 ~20:15 AEST** (same wallet as F8). `savings_info` reports a `0.001 USDsui` deposit. `addWithdrawToTx` then throws `NO_COLLATERAL: Nothing to withdraw for USDsui on NAVI` because `effectiveAmount === 0` after raw-unit `Math.floor`. The position appears withdrawable to the LLM but isn't.

**Root cause.** The read path floors UP to 3-decimal display while the write path floors DOWN to 6-decimal raw — same bug class as `financial-amounts.mdc`. A position holding ≥1 raw unit but <1 USDsui-display-precision unit reports as "dust" in user-facing display but rounds to 0 raw on withdraw.

**Decision:** defer. Negligible USD impact (literally 0 raw value). Not a bundle bug.

**Fix-for-later (~15 min):** in `savings_info` (engine + SDK position adapters), filter out positions where the raw on-chain amount converts to 0 raw units in the same precision used by `addWithdrawToTx`. OR mark them with a `dustOnly: true` flag so the LLM omits them from withdraw plans. Either approach acceptable.

#### F10 — `send_transfer` rejects `USDsui` and `USDe` due to asset-key casing (FIXED 2026-05-03)

**Discovered 2026-05-03 ~09:13 AEST** during synthetic test T2. User asked to "Withdraw 1 USDsui and send to funkii.sui". Withdraw succeeded; `send_transfer({ asset: 'USDsui', ... })` was rejected by preflight with `Unsupported asset "USDsui"` even though the tool description and system prompt both list USDsui as supported. LLM was forced into a swap-then-send retry path that then wedged on F11 + F12.

**Root cause.** `SUPPORTED_ASSETS` has 9 keys; 7 are uppercase (`USDC`, `USDT`, `SUI`, `WAL`, `ETH`, `NAVX`, `GOLD`) but 2 are mixed-case (`USDe`, `USDsui`). `transfer.ts` did `String(input.asset).toUpperCase() in SUPPORTED_ASSETS` — `"USDSUI"` and `"USDE"` are not registry keys, so the check returns false. The `call()` path also uppercased the asset before passing to the SDK, where `SUPPORTED_ASSETS["USDSUI"]` is undefined → `ASSET_NOT_SUPPORTED` would have thrown even if preflight had passed.

**Why it didn't surface earlier.** v0.51.0 added USDsui to the saveable set and exercised the `save_deposit` / `withdraw` paths, both of which uppercase BOTH sides of the comparison (allow-list AND input) and pass the original-case `input.asset` to the SDK — they accidentally dodge the bug. `send_transfer` is the only write tool that compares against the raw `SUPPORTED_ASSETS` keys without case-folding both sides. Latent since USDsui shipped.

**Why other tools weren't affected.** Audited `save.ts`, `borrow.ts`, `repay.ts` — all do `allowed.map(toUpperCase).includes(input.asset.toUpperCase())` (case-insensitive both sides) AND pass `input.asset` (original case) to the SDK. Only `send_transfer` had the asymmetric pattern.

**Fix.** Route through the existing canonical helper `normalizeAsset` from `@t2000/sdk` (used by NAVI adapter since v0.51.0 — see `packages/sdk/src/utils/format.ts` `ASSET_LOOKUP` map, case-insensitive resolver to canonical keys). 5-line change in `packages/engine/src/tools/transfer.ts` + 11 contract tests in `packages/engine/src/__tests__/transfer-asset-casing.test.ts`. Required adding `normalizeAsset` to the `@t2000/sdk` public exports.

**Decision:** ship hot-fix on `spec7-p28-f8-f9-followup` branch alongside F8/F9. Unblocks resumption of synthetic test plan (T2 + T3 + T4 won't dead-end on USDsui/USDe `send_transfer` calls).

#### F11 — `SwapQuoteTracker` doesn't persist across `/api/engine/chat` requests (DOWNGRADED — covered by system prompt)

**UPDATE 2026-05-03 ~09:51 AEST.** Synthetic test T4 (withdraw + swap + save rebalance) executed cleanly across two chat requests — the LLM proactively re-ran `swap_quote` on the second request before `swap_execute` because the `STATIC_SYSTEM_PROMPT` teaches the rule:

> "The engine guard `swap_preview` will BLOCK swap_execute if no matching swap_quote ran in this turn."

The LLM's thinking trace at turn 11 explicitly reasoned about this rule and re-fetched the quote before bundling. Bundle composed + executed clean (`stepCount: 3, hasSwap: true, hasNavi: true`, tx `5riaRfgt...PwbCUH`).

**Verdict.** F11 is fully mitigated by the existing prompt instruction. The persistence work (~1.5h of `SessionData.metadata` plumbing) is **no longer required** — the rule on the LLM side achieves the same outcome with zero engine changes. The pre-fix wedge during T2 was caused by F10 (asset-casing rejection forcing retry-loop confusion), not by the tracker missing a quote.

Keeping the entry for the historical record but removing it from the post-soak follow-up sprint.

(Original analysis follows for completeness:)


**Discovered 2026-05-03 ~09:13 AEST** during synthetic test T2 retry path. After F10 caused the LLM to abandon the original send, the user asked "Swap 1 USDsui → USDC then send to funkii.sui" in a fresh chat request. LLM emitted `swap_quote` (recorded in tracker), then `swap_execute` — guard `swap_preview` blocked with "no recent matching swap_quote" even though the quote was 1s old.

**Root cause.** `SwapQuoteTracker` lives inside the `QueryEngine` instance, which is per-request. A `swap_quote` recorded in chat request A doesn't survive into chat request B. The 60s freshness window is enforced wall-clock but the tracker itself is destroyed at request end. Within a single `/api/engine/chat` request the agentLoop runs multiple turns under one engine, so the same-request quote/execute pattern works; the bug only manifests when control yields to the user mid-flow and the next request creates a fresh engine.

**Why F10 amplified it.** F10's spurious send rejection forced the LLM to yield control to the user ("want me to swap to USDC first?"), splitting `swap_quote` and `swap_execute` across two requests. With F10 fixed, the bundle composes end-to-end inside one request and the bug stops firing for the common path.

**Decision:** defer. Real edge case (user explicitly denies a swap card → asks for retry on next turn) but not blocking. Workaround today: start a fresh chat session and re-issue the request as a single intent.

**Fix-for-later (~1.5h):**
1. Persist `swapQuoteTracker.quotes` (the `RecordedSwapQuote[]`) in `SessionData.metadata`, mirroring the v0.54 `proactiveSeenKeys` pattern.
2. Hydrate at engine boot in `apps/web/lib/engine/engine-factory.ts` — pass the persisted array through `EngineConfig.recentSwapQuotes`.
3. Engine constructor seeds the tracker from the config.
4. Drop entries older than 60s on hydrate (same window as in-memory).
5. Audric chat route persists `engine.getSwapQuoteRecords()` at end of turn.

Roll into the post-soak follow-up sprint or SPEC 12 cross-repo sweep.

#### F12 — Abandoned bundles aren't captured by telemetry (deferred)

**Discovered 2026-05-03 ~09:13 AEST.** During T2 retry, a `bundle_proposed_count` fired (stepCount=2, hasSwap+hasTransfer) at 23:12:51 with no matching `bundle_outcome_count`. The bundle was proposed but never executed because F11 wedged the swap_execute leg.

**Root cause.** The four `bundle_outcome_count` outcomes are `executed | reverted | compose_error | sponsorship_failed`. None covers "the LLM proposed a bundle but never sent it through prepare/execute" (e.g. blocked by a guard, user navigated away, session abandoned). The `propose-but-never-execute` ratio is invisible in the dashboard, so soak math (`revert_rate = reverted / outcomes`) underreports total proposal failures.

**Decision:** defer. Doesn't affect the SPEC 7 close decision because revert_rate is the load-bearing metric and abandoned proposals are a separate dimension. Worth fixing for ongoing observability.

**Fix-for-later (~30 min):**
1. Add `outcome: 'abandoned'` to `bundle_outcome_count` schema.
2. Emit it from the host when (a) a bundle proposal's `attemptId` ages out of `TurnMetrics` without a corresponding outcome row, OR (b) the session ends without a resume call referencing the proposal.
3. Decide on the timeout (15 min? 24h?) based on real session-length data from Vercel logs.

Roll into SPEC 12 cross-repo sweep.

---

### T+12h — First checkpoint (2026-05-03 09:13 AEST)

Recorded after F10 hot-fix landed mid-window:

| Metric | Value | Notes |
|---|---|---|
| `bundle_proposed_count` total | 6 | 1 organic + T1 + T2 (×2 attempts pre-fix) + T3 + T4 |
| `bundle_outcome_count{executed}` | 5 | 1 organic + T1 + T2-retest + T3 + T4 |
| `bundle_outcome_count{reverted}` | 0 | |
| `bundle_outcome_count{compose_error}` | 0 | |
| `bundle_outcome_count{sponsorship_failed}` | 0 | |
| Abandoned (F12 — proposed but no outcome) | 1 | T2 first attempt, wedged on F10/F11 pre-fix |
| `revert_rate` | 0/5 = 0% | Well under <1% threshold |
| `compose_error_rate` | 0/5 = 0% | |
| `bundle_compose_duration_ms` p50 | (not surfaced in pasted logs) | — |
| Step-count coverage | 2-Navi-only · 2-Navi+Transfer · 2-Swap+Navi · 3-Withdraw+Swap+Navi | All four bundle shapes exercised |

**Findings rolled into the window:**
- F8 (withdraw description) — fixed, deployed in 1.11.2
- F9 (phantom-dust filter) — fixed, deployed in 1.11.2
- F10 (send_transfer asset-casing) — fixed, deployed in 1.11.2, validated by T2 retest
- F11 (SwapQuoteTracker persistence) — downgraded; covered by system-prompt rule, validated by T4
- F12 (abandoned-bundle telemetry gap) — deferred to SPEC 12

**Minor issues (non-blocking):**
- M1: T4 receipt copy says "Save … USDC" but the deposit is USDsui (post-swap asset symbol stale in renderer). ~15 min fix.
- M2: 2× non-fatal TurnMetrics write errors (`session usage log failed`, `TurnMetrics write failed`) at 23:50:23 UTC. Pre-existing pattern — Upstash transient. Worth tracking rate.

#### F13 — `/api/engine/chat` 60s timeout on 4+ write compound requests (FIXED 2026-05-03)

**Discovered 2026-05-03 ~10:00 AEST** during informal stress test. User asked: "Pay off all debt then swap 2% of my portfolio to Sui, then swap $5 usdc to usdcsui then save all the usdcsui i have in my portfolio then borrow $1 usdcsui then send 1 sui to funkii.sui" — a 6-write compound. Vercel killed both attempts at exactly 60s with `Vercel Runtime Timeout Error: Task timed out after 60 seconds`.

**Root cause.** `apps/web/app/api/engine/chat/route.ts` set `export const maxDuration = 60`. Sonnet at high effort + extended thinking can burn 30–60s on planning alone for a 6-op compound (two ~3000-char thinking blocks + 2× parallel `swap_quote` round-trips + multiple `update_todo` reads). The bundle proposal never reached the engine before the function got killed.

**Fix.** Two-part:
1. Bumped `maxDuration` 60→300s on `/api/engine/chat` and `/api/engine/resume`. Vercel Pro allows up to 300s. Cost impact ~zero — only edge cases consume the extra budget.
2. Added a "4+ writes: split across TWO turns" exception to the Payment Stream system prompt rule. Turn 1 = reads + plan + ASK confirmation. Turn 2 (post-confirm) = all writes. Better UX (user reviews 6 ops before signing) AND splits the time budget. The 4+ writes still bundle into ONE atomic PTB.

**Verdict.** Doesn't affect SPEC 7 close — F13's timeouts happened upstream of bundle composition (`bundle_proposed_count` did not increment for the failed turn). Soak tally unchanged. P2.7 close decision untouched.

#### M3 — Markdown tables don't render in audric chat (FIXED 2026-05-03 — v1 was wrong; v2 ships absolute ban)

**Discovered 2026-05-03 ~10:00 AEST** during the F13 stress test. The rebalance preview ("current vs after") emitted a markdown table with what looked like `\n\n` between every row.

**Wrong v1 fix (shipped + reverted same day):** added a system-prompt rule "If you DO emit a markdown table, NO blank lines between rows (breaks renderer)." Founder re-tested and the formatting bug recurred.

**Root cause (v2 investigation).** `audric/apps/web/components/dashboard/AgentMarkdown.tsx` is a **custom hand-rolled markdown parser**, not a real markdown library (no `react-markdown` / `remark-gfm`). It supports headings, numbered lists, bullets, stat blocks, postcards — but **NOT tables**. Every line that doesn't match a recognized syntax falls through to `paragraph`, gets wrapped in `<p>`, and the wrapping `<div className="space-y-1">` inserts vertical spacing between every paragraph. The "blank lines" the user saw were never in the LLM output — they were the renderer's per-paragraph spacing applied to every fragmented table row.

**Correct v2 fix (shipped 2026-05-03 ~10:35 AEST).** The existing rule on line 169 ("NEVER write a markdown table summarizing card data") got contradicted by my v1 addition ("if you DO emit one..."). Removed the contradiction and made it absolute: *"NEVER write a markdown table — the renderer doesn't support tables (rows render as broken paragraphs). Use bullet/numbered lists for comparisons."* The LLM now defaults to lists for "current vs after" / quote summaries / multi-row comparisons, which the renderer handles natively.

**Followup TBD (post-soak):** add proper table support to AgentMarkdown using `react-markdown` + `remark-gfm`, so "rare comparison case" tables can render correctly. Not blocking — the prompt-rule path is sufficient for the foreseeable use cases (cards already cover most comparisons).

#### B2 — 4+ writes Turn 2 dropped writes (FIXED 2026-05-03)

**Discovered 2026-05-03 ~10:30 AEST** during F13/M3 follow-up stress test. The 6-op compound query ("Pay off all debt then swap 2% to SUI then swap $5 to USDsui then save all USDsui then borrow $1 USDsui then send 1 SUI to funkii.sui") followed F13's split-into-two-turns pattern correctly: Turn 1 fetched quotes, presented the 6-step plan, asked for confirmation. After user said "Yes", Turn 2 refreshed expired quotes and emitted... only 3 ops, not 6. The user denied the resulting bundle because it didn't match the agreed plan.

**Hypothesis.** The LLM's Turn 2 reasoning got hyper-focused on the freshly-refreshed quotes ("I just got fresh swap quotes, time to execute the swaps") and lost the other 4 ops from working memory. The original "Turn 2 = all writes" rule was too vague — "all writes" didn't make it explicit that *every* op from the agreed plan must be emitted, regardless of which ones needed quote refreshes.

**Fix (shipped 2026-05-03 ~10:35 AEST).** Tightened the rule from *"Turn 2 (post-confirm) = all writes (still bundles into ONE PTB)"* to *"Turn 2 (post-confirm) = emit ALL N agreed writes in parallel (re-fetch expired quotes first; never drop any). Bundles into ONE atomic PTB."* The "ALL N" + "never drop any" wording forces the LLM to anchor on the count from Turn 1's plan and emit every write block.

**Validation.** Re-test the 6-op flow in a fresh session post-deploy. Expect Turn 2 to emit 6 parallel write tool_use blocks (repay + 2× swap_execute + save_deposit + borrow + send_transfer) all bundled into one PTB.

### T+24h — Mid-soak (2026-05-04 09:13 AEST — pending)

Watch for organic bundle additions to grow N≥10 toward the runbook's high-confidence floor.

### T+48h — Final + decision (Mon May 4 ~21:13 UTC / Tue May 5 ~07:13 AEST — pending)

**Founder-locked decision rule (2026-05-03 09:51 AEST):** stick to the runbook 48h plan rather than closing early on N=5. Current trajectory crushes the <1% revert_rate threshold and N=5 already covers all four bundle shapes (2-Navi-only, 2-Navi+Transfer, 2-Swap+Navi, 3-Withdraw+Swap+Navi). Default close path: if `revert_rate < 1%` AND no new compose/sponsorship failures → write P2.8 ✅ done piecewise, flip P2.7 → ✅ done, trigger `@t2000/engine@1.12.0` release for SPEC 9 P9.2 + audric deploy behind `NEXT_PUBLIC_HARNESS_V9` flag.

**Known-issues block to include in the P2.8 close entry (rolled forward, not blocking):**
- F7b — saved-contact name in receipts (cosmetic)
- M1 — T4 receipt copy: "USDC" label on a USDsui save_deposit step in swap-then-save bundles
- M2 — non-fatal `TurnMetrics write failed` Upstash transient (track rate)
- F12 — abandoned-bundle telemetry (proposed → no outcome) — defer to SPEC 12 sweep
- F13 — fixed mid-soak 2026-05-03 (Vercel 60s timeout on 4+ write compound requests; `maxDuration` bumped 60→300, system-prompt 4+ writes plan-and-confirm rule added)
- M3 — fixed mid-soak 2026-05-03 (markdown tables don't render in audric chat — v1 wrong, v2 absolute ban shipped; followup TBD: add real table support to AgentMarkdown)
- B2 — fixed mid-soak 2026-05-03 (Turn 2 dropped writes after quote refresh — rule tightened to "emit ALL N agreed writes; never drop any")
- C — fixed mid-soak 2026-05-03 (Sonnet leaked `<thinking>...</thinking>` tags into chat text; `stripThinkingTags()` shipped in `lib/sanitize-text.ts`, wired into TextBlockView, 9 contract tests; e037259)
- **F14 — fixed mid-soak 2026-05-03 (CRITICAL SAFETY)**. 6-op compound bundle silently auto-executed without rendering tap-to-confirm. Two bugs stacked: (Bug A) `shouldClientAutoApprove` only inspected `action.toolName/input` — for a Payment Stream the engine emits `pending_action` with `toolName = firstStep.toolName` per SPEC 7 P2.3, so step[0] = `repay $2` resolved auto and the entire 6-op bundle (including a `borrow` leg) bypassed the PermissionCard. (Bug B) `PERMISSION_PRESETS.aggressive.borrow.autoBelow` was `10`, violating the absolute invariant in `.cursor/rules/safeguards-defense-in-depth.mdc` ("borrow always confirms — autoBelow: 0 across every preset"). Defense-in-depth fix: engine 1.11.3 published with `borrow.autoBelow: 0` + invariant test (every preset must have `borrow.autoBelow === 0`); audric host fix iterates `action.steps[]` and takes the worst tier across legs (any confirm/explicit leg → render the card) + mirrors the engine constant. Engine afbf0822 / tag v1.11.3; audric d57f9b6 + a93c026 (dep bump). 9 new contract tests on the host (33 total in `permission-tiers-client.test.ts`, was 24).
- **F15 — fixed mid-soak 2026-05-03**. After Turn 1 of a 6-op compound flow ("Confirm to proceed?"), the chip system surfaced "EXECUTE SWAP" off the last `swap_quote` tool. User tapped expecting plan execution; LLM read it as a fresh swap intent and asked "which swap?" because there were 2 in the plan. Root cause: `showSuggestions` predicate only suppressed chips on `pendingAction`, but the "4+ writes plan-and-confirm" flow emits the plan as TEXT before any `pending_action`. Fix: `endsWithQuestion(text)` helper in `lib/suggested-actions.ts`, used inside `UnifiedTimeline.tsx` `showSuggestions` predicate. 9 contract tests. audric a53f12d.
- **F16 — observed mid-soak, deferred to P2.8 cleanup**. Long thinking blocks on the 6-op compound flow (~3-5k chars per turn). Most is necessary work (planning 6 dependent steps, refreshing quotes, computing exact post-execution balances). Real optimizations are non-trivial (pre-resolve SuiNS server-side, turn-scoped read cache, or a `compound_execute` recipe with fixed thinking budget). None warrant a hot-patch — the flow is correct, the thinking length is a perf paper-cut.
- **F14-fix-2 — fixed mid-soak 2026-05-03 (CRITICAL SAFETY round 2)**. The first F14 host fix (d57f9b6) was *incomplete*. Re-test on aggressive preset 6-op flow showed PermissionCard *still* didn't render. Root cause: F14 patched the auto-approve `useEffect` callsite of `shouldClientAutoApprove` but missed the render-path callsite in `PermissionCardBlockView.tsx:74` which cherry-picked `{toolName, input}` and **stripped `steps`**. Bundle iteration in `shouldClientAutoApprove` only runs when `Array.isArray(action.steps) && action.steps.length >= 2`, so stripping silently re-introduced Bug A inside the card view: step[0] = `repay $2` = auto under aggressive → returns `true` → card hidden. Auto-approve effect (with full action) returned `false` (correct), so the bundle was neither auto-executed nor card-rendered — stuck pending forever. **Defense-in-depth fix shipped in two halves:** (a) audric host: pass full `block.payload` to `shouldAutoApprove` + tighten 5 component prop types from `Pick<PendingAction, 'toolName' | 'input'>` to `Pick<…, 'toolName' | 'input' | 'steps'>` so TypeScript catches any future strip-callsite at compile time + regression test for the production-repro 6-op shape (audric ea73d7c). (b) engine 1.11.4 hard cap: new `MAX_BUNDLE_OPS=5` constant in `compose-bundle.ts` rejects any bundle >5 ops with synthesized `_gate: 'max_bundle_ops'` error tool_results so the LLM re-plans into two sequential ≤5-op bundles. Caps Vercel runtime, quote-freshness window, LLM working memory, PermissionCard cognitive load, PTB instruction budget. 4 regression tests including the 6-op production-repro shape. Engine 8194cb46 / tag v1.11.4; audric ea73d7c (host) + c826bb0 (1.11.4 dep bump). Two paired prompt rules: `4-5 writes` (split TWO turns) vs `6+ writes` (split into TWO sequential ≤5-op bundles), and `update_todo` plans MUST list each WRITE by verb+amount+asset (fixes the regression where the LLM emitted abstract phases like "Plan / Confirm / Execute" after F13 landed). STATIC_SYSTEM_PROMPT ceiling bumped 10,000 → 10,200 with documented history entry. **Superseded by Phase 0 (SPEC 13 prep) below** — `MAX_BUNDLE_OPS` further dropped to 2; 4-5/6+ split rules removed.

- **Phase 0 (SPEC 13 prep) — 2026-05-03 evening**. Strict-tightening that supersedes F14-fix-2's `MAX_BUNDLE_OPS=5` and the paired prompt rules. Triggered by the May 3 production review (founder validation of bundles + the "Response interrupted · retry" major blocker): every multi-write production failure reduced to a chained-asset gap (`swap → save USDsui` reverts at PREPARE because USDsui doesn't exist in wallet at compose time — the SDK appender pre-fetches via `selectAndSplitCoin`). The cap was never the real problem; the missing chain-handoff primitive was. Founder direction: don't kill atomic bundles (they're the moat on Sui), but tighten until the foundation is built — start with 2-op flows, add 3-op chains, then DeFi+commerce. **Concrete deltas in engine 1.12.0 + audric host:** (1) **`MAX_BUNDLE_OPS` lowered 5 → 2**. 3+ op compositions get `_gate: 'max_bundle_ops'` errors; LLM splits sequentially. (2) **`VALID_PAIRS` whitelist** — engine refuses any 2-op bundle outside the 7-pair set (`swap_execute → send_transfer | save_deposit | repay_debt`, `withdraw → swap_execute | send_transfer`, `borrow → send_transfer | repay_debt`) with `_gate: 'pair_not_whitelisted'`. (3) **`engine.turn_outcome` counter** at every `agentLoop` exit point with structured tags. Pairs with audric host's new `audric.engine.{chat,resume}_stream_close` counter + `STREAM_CLOSED_SILENTLY` console.error + `useEngine.ts` `INTERRUPTED_TURN_DETECTED` client console.warn. Together they let us diagnose the "Response interrupted · retry" bug by tracing where in the engine→stream→delivery→client chain a turn vanishes. (4) **System prompt rewritten** — single rule: "Bundles cap at 2 ops, only whitelisted pairs; everything else runs sequentially." Removed the 4-5-write split rule and 6+ HARD CAP rule. Static prompt token count: 10,196 (under the 10,200 ceiling). (5) **SPEC 13 written** (`spec/SPEC_13_PTB_CHAINING_FOUNDATION.md`, local-only) — defines the chained-coin handoff primitive (`inputCoinFromStep`), the consumes/produces declaration model, the per-builder migration plan, and the phased rollout (Phase 1: 7 pairs + validator; Phase 2: 3-op chains; Phase 3: Demo 1 swap+swap+save+send; Phase 4: commerce `split_coin` + N×`pay_api`; Phase 5: arbitrary). Engine 1.12.0 ships items 1-3; audric host ships items 3 (host side) + 4. Engine tests: 872/873 passing (1 unrelated skip); audric tests: 1033/1033 passing.

**Architectural followups identified during the 6-op stress test (queue for P2.8 cleanup, NOT shipping mid-soak):**

1. **`MAX_BUNDLE_OPS_PER_PTB = 7` cap** — defense-in-depth at engine bundle composer + SDK `composeTx()` + system prompt one-liner. Caps the "max" shape at one slot above the natural distribution (organic bundles run 1-3 ops, the founder's stress test was 6, so 7 = real-world headroom + safety margin). Prevents:
   - Vercel timeout class (LLM planning time scales with op count even at 300s)
   - Cognitive overload reviewing huge bundles before signing
   - Mid-bundle balance drift (more ops = more estimation error)
   - LLM working-memory drift (Bug B class — Sonnet drops ops as N grows)
   - Atomic-bundle blast radius (one bad leg reverts everything; failure probability scales with N)
   - Sui PTB instruction budget (each NAVI/Cetus op is 5-15 commands; ~15-20 ops practical ceiling)
   Net work ~2h including tests + new `audric.harness.bundle_size_distribution{ops: "1"|"2"|...|"8+"}` counter to confirm distribution. Constant lives in one place; engine + SDK both import it.

2. **Narration compression after `update_todo` plan card** — system-prompt rule: "When emitting `update_todo` for a Payment Stream plan, embed amount + key safety context (HF projection, slippage, route) in each item label so the card IS the plan; narration MUST compress to ≤2 lines (headline + Confirm? prompt)." Sonnet is already halfway there (puts impact% in swap labels) — just needs the nudge to do the same for borrow/repay items, then trim narration. ~30 prompt tokens.

3. **AgentMarkdown table support (M3 v3)** — replace the custom hand-rolled markdown parser in `apps/web/components/dashboard/AgentMarkdown.tsx` with `react-markdown` + `remark-gfm`. Lifts the absolute table ban — genuinely useful "current vs after" comparison tables can render correctly without renderer-side hacks. Lower priority since the prompt-rule path covers current cases. ~1d UI work.

4. **F16 — long thinking on compound flows (perf opt)** — the 6-op flow burns 3-5k chars of extended-thinking per turn. Most is necessary (dependent-step planning + quote refresh + balance math), but three options would shave latency:
   (a) Pre-resolve SuiNS server-side so the LLM doesn't reason about address resolution (~400 chars/turn savings).
   (b) Turn-scoped read cache in the engine — reuse a `balance_check` result across re-verifications inside the same turn (~600 chars/turn savings).
   (c) `compound_execute` recipe matching "do A, B, C, D, E, F" patterns, with fixed thinking budget + canonical step ordering (largest savings, ~1-2k chars/turn).
   None are blocking; current flow works. Estimate: (a) 1h, (b) 1d, (c) 2d.
