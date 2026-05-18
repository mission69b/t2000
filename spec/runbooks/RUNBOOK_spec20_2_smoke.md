# RUNBOOK — SPEC 20.2 acceptance smoke (founder)

> **Goal:** verify that the Cetus route captured at `swap_quote` time threads cleanly through `pending_action.cetusRoute` → `TurnMetrics.cetusRoute` → `/api/transactions/prepare` fast-path AND grounds the LLM narration via the `<canonical_route>` block. 5 acceptance gates (G20.2.1–G20.2.5). Total time budget: ~25 minutes on production.
>
> **Status before smoke:** engine + sdk v1.25.0 published, audric web bumped + deployed (commit `7154e18`), Prisma migration `20260509110000_spec20_2_add_cetus_route` applied to NeonDB.
>
> **Status after smoke:** records founder G20.2 sign-off in `audric-build-tracker.md` follow-up entry; if any gate fails, file a P0/P1 finding with run details and we triage same-day.

---

## What changed in 20.2 (one-paragraph context)

The engine now stamps a serialized Cetus route on every `swap_execute` `pending_action` (single-write top-level + bundle per-step). Audric persists it to `TurnMetrics.cetusRoute`, threads it through the entire client → `/api/transactions/prepare` chain, and the prepare route's new `lib/cetus-route-validator.ts` either uses it as the fast-path (`composeTx` skips `findSwapRoute()` — saves ~400-500ms per swap) or silently falls back to legacy discovery if the route is stale / coin-mismatched / malformed (D-5 dual-path). The post-write resume turn injects a `<canonical_route>` system-prompt block so the LLM narrates the on-chain path verbatim, not whichever stale `swap_quote` happened to be in turn history (closes S19-F2).

---

## Gates

| Gate | What it proves | How to verify |
|---|---|---|
| **G20.2.1** | Route persists to TurnMetrics | NeonDB `TurnMetrics` row for the swap turn has `cetusRoute IS NOT NULL` with `routerData.paths[]` populated |
| **G20.2.2** | Fast path executes | Vercel logs for the `/api/transactions/prepare` call show NO "[cetus] findSwapRoute" timing line for that swap (legacy path logs one) |
| **G20.2.3** | LLM narrates the canonical path | Resume narration cites the EXACT path string the on-chain tx took (`Cetus Aggregator + FLOWX` etc.). No "I quoted X but executed Y" contradictions. |
| **G20.2.4** | Legacy fallback works (correct, just slower) | Force a stale route (wait 90s after swap_quote before tapping confirm). Vercel logs show `[prepare] cetusRoute stale — falling back to fresh discovery`. Trade still settles correctly. |
| **G20.2.5** | Bundles honor per-step routes | If a multi-write bundle that includes a swap leg fires, the swap leg's `step.cetusRoute` populates `step.input.precomputedRoute` and the same fast-path applies |

---

## Smoke test recipe (5 swaps + 1 stale-fallback test, ~25 min)

### Pre-flight (1 min)

1. Open prod `audric.ai`, sign in.
2. Have a NeonDB query tool ready (or use `psql $NEON_DATABASE_URL`).
3. Have Vercel logs ready (`vercel logs <prod-deployment-id> --since 10m`).
4. Confirm wallet balance: ≥ 5 USDC + ≥ 3 SUI (~$1.50–$3 in expected spend across the 5 swaps + dust).

### Swap 1 — small USDC → SUI (auto-tier; B.4 USD-aware should auto-execute under conservative)

> **Why first:** auto-execute path stamps `cetusRoute` on the auto-emitted `pending_action` (no user tap), so this verifies G20.2.1 + G20.2.2 + G20.2.3 in one shot, end-to-end with zero human latency in the loop.

1. Type: **`swap 0.5 USDC to SUI`**
2. Wait for the tx receipt to render in chat. **Don't refresh** — keep the session live.
3. **G20.2.1:** in NeonDB run:
   ```sql
   SELECT "turnIndex", "toolsCalled", "cetusRoute"::text
   FROM "TurnMetrics"
   WHERE "sessionId" = '<your_session_id>'
   ORDER BY "createdAt" DESC LIMIT 3;
   ```
   The most-recent row's `cetusRoute` MUST be JSON with `routerData.paths` (not `null`).
4. **G20.2.2:** in Vercel logs, find the `/api/transactions/prepare` call for this swap. Should NOT contain a "[cetus] findSwapRoute" timing log (or should be substantially faster — sub-100ms compose time vs. typical 400-500ms).
5. **G20.2.3:** in chat, the assistant's swap-completed message should cite the path provider chain (e.g. "Cetus Aggregator + FLOWX") that matches the on-chain tx's actual route. Cross-check by clicking through to the tx on `suiscan.xyz` and reading the `cetus::pool::swap` events vs the chat narration.

### Swap 2 — slightly larger USDC → SUI (confirm-tier)

> **Why second:** confirm-tier exercises the full `pending_action` → tap-to-confirm → `/api/transactions/execute` round-trip. This is the dominant production path.

1. Type: **`swap 2 USDC to SUI`** (or whatever tier-up amount your account preset uses).
2. **Tap confirm** on the card promptly (within ~30s of the quote).
3. Repeat G20.2.1, G20.2.2, G20.2.3 verification.

### Swap 3 — SUI → USDC (the inverse pair)

> **Why:** verifies coin-type match isn't pair-direction-sensitive (D-2 should pass for SUI→USDC just as cleanly as USDC→SUI).

1. Type: **`swap 0.3 SUI to USDC`**.
2. Confirm.
3. Repeat G20.2.1, G20.2.2, G20.2.3 verification.

### Swap 4 — multi-hop pair (USDC → GOLD or USDC → WAL — anything not directly USDC↔SUI)

> **Why:** Cetus aggregator may return a multi-hop `paths[]` for non-direct pairs. Verifies the serializer captures the full path graph correctly, not just single-hop routes.

1. Pick a pair Audric supports that isn't USDC↔SUI. Type the swap.
2. Confirm.
3. Repeat G20.2.1, G20.2.2, G20.2.3 verification. Pay extra attention to G20.2.3: the narration MUST cite the multi-hop path correctly (not collapse it to the first hop).

### Swap 5 — small USDC → USDsui (saveable stable pair — covers v0.51.0+ saveable expansion)

> **Why:** ensures the saveable-stable pair path doesn't break the route forwarding (USDC → USDsui pre-positions for a save).

1. Type: **`swap 0.5 USDC to USDsui`**.
2. Confirm if presented; auto-execute is fine.
3. Repeat G20.2.1, G20.2.2, G20.2.3 verification.

### Stale fallback drill — G20.2.4 (mandatory)

> **Why:** the dual-path fallback is the safety net for malformed / stale routes. If it doesn't actually catch the stale case, we've shipped a silent perf regression that could hide future engine route-emit bugs.

1. Type: **`swap 0.4 USDC to SUI`** but **DO NOT tap confirm**.
2. Wait at least **90 seconds** (the route's freshness window is 60s; 90s ensures it's stale).
3. Tap confirm.
4. **G20.2.4:** in Vercel logs, the `/api/transactions/prepare` call MUST log `[prepare] cetusRoute stale — falling back to fresh discovery`.
5. The trade MUST still settle correctly (just at legacy speed). Verify on-chain.

### Bundle drill — G20.2.5 (best-effort, only if a bundle naturally fires)

> **Why:** bundles are a smaller production share than single-writes. If your test session doesn't naturally trigger a bundle (engine bundles only when 2+ confirm-tier writes land same turn AND all are bundleable), skip and note "G20.2.5 deferred — no bundle fired during smoke."

If you can trigger a bundle (e.g. "swap 1 USDC to SUI then save 0.5 USDC" depending on your account preset producing same-turn confirm tier on both):
1. Tap confirm on the bundle card.
2. **G20.2.5:** verify in NeonDB that the swap leg's step has `cetusRoute` populated; verify in Vercel logs the same fast-path didn't re-discover.

---

## Sign-off rubric

After running the smoke:

| Outcome | Action |
|---|---|
| 5/5 G20.2 gates PASS | Mark SPEC 20.2 ✅ FULLY CLOSED in `audric-build-tracker.md` follow-up; greenlight Phase 20.1 |
| 4/5 PASS, G20.2.5 deferred (no bundle fired) | Mark SPEC 20.2 ✅ CLOSED with "G20.2.5 deferred — bundle path verified only structurally via tests; await production bundle event"; greenlight Phase 20.1 |
| ≤3/5 PASS | File P0 finding `S20.2-F<N>` per failed gate; do NOT start Phase 20.1; triage same-day |

## Notes for the founder

- **Don't refresh between swap and verification.** TurnMetrics is written fire-and-forget after the chat response — refresh kills the session and could race the write.
- **The fast path saves ~400-500ms per swap on the prepare-route compose phase.** End-to-end perceived improvement is smaller because Enoki sponsor + execute round-trips are unchanged. Use the prepare-route compose timing in Vercel logs as the precise indicator, not chat-perceived speed.
- **D-5 dual-path is by design.** Stale / mismatched / malformed routes silently degrade to legacy. Look for the warn-level log line (`[prepare] cetusRoute <reason> — falling back`) — that's the "this swap didn't get the fast-path, but it still ran correctly" signal.
- **G20.2.3 is the S19-F2 fix verification.** This is the bug class where the LLM said "I'll route through pool A" and the on-chain tx actually went through pool B because the engine re-discovered the route in `addSwapToTx`. The `<canonical_route>` block forces alignment.
