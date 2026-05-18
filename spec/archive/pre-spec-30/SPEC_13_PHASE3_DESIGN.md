# SPEC 13 Phase 3 — Design

**Date:** 2026-05-03 (evening)
**Status:** v0.2 — all decisions locked, design-ready for implementation. Implementation deferred to next session per user.
**Local-only — gitignored** (per `audric-roadmap.md` policy).

---

## TL;DR

Phase 3 ships the **headline DeFi flow** ("Swap 10% to SUI, save 50% as USDsui, send $100 to Mom" — Demo 1) by doing **two independent unlocks**:

1. **Phase 3a — DAG-aware validator (the actual Demo 1 unlock).** Relax `validateStepGraph` from "every adjacent pair must be whitelisted" to "every step that declares `inputCoinFromStep` must reference a whitelisted producer." Steps without a chain run wallet-mode independently, even when sandwiched between chained steps. Raise `MAX_BUNDLE_OPS` from 3 → 4.
2. **Phase 3b — `swap_execute → swap_execute` whitelist add.** Allow a swap's output coin to thread directly into another swap's input coin (multi-hop routing inside one PTB).

**These are independent.** Demo 1 needs only Phase 3a. Phase 3b is an additional small unlock for true multi-hop swap chains (e.g. `USDC → USDsui → vSUI` within one signature). The existing SPEC 13 doc conflates them — this design separates them.

**Ship sequence:** Phase 3a first (engine `1.15.0`, the headline unlock). Phase 3b as `1.15.x` patch after 3a soaks if/when product wants multi-hop swaps.

---

## Why this doc exists

When tracing Demo 1's actual step graph against the existing SPEC 13 v0.3 Phase 3 deliverables list, the swap→swap whitelist add is **not load-bearing** for the headline use case. The existing spec said:

> Adjacent pairs: `swap→swap` (NEW, needs whitelist), `swap→save` ✓, `save→send` ❌

But that's only true under **strict adjacency** (today's Phase 2 rule: every `(i, i+1)` pair must be whitelisted). Under **DAG-aware** validation (only chain references need whitelisting), Demo 1's actual graph becomes:

```
step 0: swap_execute(USDC → SUI, 200)         ← standalone, wallet-mode
step 1: swap_execute(USDC → USDsui, 900)      ← standalone, wallet-mode  (NOT chained from step 0)
step 2: save_deposit(USDsui, fromStep=1)      ← chained: pair = swap_execute → save_deposit ✓ already whitelisted
step 3: send_transfer(USDC, 100, "Mom")       ← standalone, wallet-mode (NOT chained from step 2)
```

Only **one chain** exists in this bundle (step 1 → step 2), and that pair is **already whitelisted**. The `swap → swap` whitelist isn't relevant — steps 0 and 1 don't share a coin handle, they each pull their own input from the wallet.

So the actual Phase 3a unlock for Demo 1 is purely:
- **DAG validator relaxation** (allow non-chained adjacent steps in the same bundle)
- **Cap raise** (3 → 4)

That's a meaningfully smaller surface than what the existing spec implied.

---

## Phase 3a — DAG validator + cap=4 (the Demo 1 unlock)

### What changes

**Engine (`packages/engine/src/compose-bundle.ts`):**

1. `MAX_BUNDLE_OPS`: `3` → `4`.
2. Strict-adjacency loop replaced with **chain-only validation**:

   ```ts
   // BEFORE (Phase 2 strict-adjacency):
   for (let i = 0; i < steps.length - 1; i++) {
     const pair = checkValidPair(steps[i].name, steps[i + 1].name);
     if (!pair.ok) return { _gate: 'pair_not_whitelisted', pair: pair.pair };
   }

   // AFTER (Phase 3a DAG-aware):
   for (let i = 1; i < steps.length; i++) {
     const consumer = steps[i];
     const fromIdx = consumer.input?.inputCoinFromStep;
     if (typeof fromIdx !== 'number') continue;       // standalone consumer, wallet-mode, no validation needed

     // Backward reference must be in [0, i)
     if (fromIdx < 0 || fromIdx >= i) {
       return { _gate: 'chain_invalid', reason: 'inputCoinFromStep out of range', step: i };
     }
     const producer = steps[fromIdx];
     const pair = checkValidPair(producer.name, consumer.name);
     if (!pair.ok) {
       return { _gate: 'pair_not_whitelisted', pair: pair.pair };
     }
     // Asset alignment check (existing, unchanged)
     if (!shouldChainCoin(producer, consumer)) {
       return { _gate: 'chain_invalid', reason: 'asset misalignment', step: i };
     }
   }
   ```

3. The `engine.bundle_chain_mode_set` counter (added in 1.13.1) keeps the same shape — fires once per actual chain, NOT once per adjacent pair. So a Demo 1 bundle (1 chain) fires the counter once. A withdraw→swap→send bundle (2 chains) fires it twice. This matches today's Phase 2 behavior for fully-chained bundles, and adds the new "fewer fires than `n-1`" case for partially-chained bundles.

**Audric (`audric/apps/web/lib/engine/prepare-bundle-tool.ts`):**

1. Same adjacency-loop relaxation — the host-side validator must mirror the engine's. The tool currently runs the whitelist check on every adjacent pair; that loop becomes chain-only too.
2. Bundle-cap constant `MAX_BUNDLE_OPS` raised from 3 → 4.
3. Auto-population of `inputCoinFromStep`: today the tool auto-populates `inputCoinFromStep: i-1` for **every** consumer if its pair with `step[i-1]` is whitelisted AND assets align. Phase 3a keeps this behavior — it's "auto-chain when possible, leave wallet-mode otherwise." A standalone consumer (e.g. `send_transfer` after `save_deposit`) gets no `inputCoinFromStep` (asset misalignment or non-whitelisted pair), and runs in wallet-mode. **No change to auto-population logic; the validator change just stops rejecting standalone-after-chained-after-standalone shapes.**

**Audric (`audric/apps/web/lib/engine/engine-context.ts`):**

1. System prompt section "Payment Stream" updates:
   - "Atomic bundles are capped at 3 ops" → "Atomic bundles are capped at **4 ops**"
   - Add a 4-op example: *"4-op example: `swap 200 USDC to SUI, swap 900 USDC to USDsui, save 900 USDsui (chained from prev swap), send 100 USDC to Mom` — pass all four to prepare_bundle. Only step 3 chains (swap→save); the rest run wallet-mode independently inside the same atomic PTB."*
   - Whitelist comment unchanged (pairs themselves don't change).

**SDK (`packages/sdk/src/composeTx.ts`):** **No changes.**

This is the key finding from a code read of `composeTx.ts:154–280`: the orchestrator already iterates `opts.steps` per-step and only consumes `priorOutputs[fromIdx]` when `step.inputCoinFromStep` is defined. Standalone steps already run wallet-mode independently. The only thing that's gating cap=4 today is the engine-side `MAX_BUNDLE_OPS = 3` constant + the audric-side mirror; the SDK accepts arbitrary N and only a per-step preflight + the validator runs.

### What stays out of Phase 3a

- **Multi-hop swap chains** (Phase 3b — separate ship).
- **`split_coin` + parallel fan-out** (Phase 4).
- **Cap > 4** (Phase 5+, gated on production telemetry).
- **`save_deposit → withdraw` or other "round-trip" pairs** — would require a flow we don't actually need yet.

### Migration notes (engine 1.14.x → 1.15.0)

- The validator change is **strict relaxation** — every bundle that was valid under Phase 2 strict-adjacency stays valid. New bundle shapes become valid. No bundle that was valid before becomes invalid.
- The cap raise is also a strict relaxation — every previously valid bundle stays valid; previously rejected 4-op bundles now compose.
- **Telemetry shape:** `engine.bundle_chain_mode_set` semantics change subtly — it fires once per actual chain, not once per adjacent pair. Phase 2 always had `n_chains == n_steps - 1` (every adjacent pair was chained). Phase 3a allows `n_chains <= n_steps - 1`. The dashboard query for "average chain density" should now be `bundle_chain_mode_set / (n_steps - 1)`.
- **Test corpus:** `SPEC_8_CORPUS.md` P0-3 row's expected outcome changes. Today P0-3 (`swap 10% USDC to SUI, save 50% remaining USDC, then send $1 to mom.audric.sui`) is **expected to refuse** because `save_deposit → send_transfer` is not whitelisted. Under Phase 3a it composes as a 3-op bundle: `swap (wallet) → save (chained from swap) → send (wallet)`. **Worth re-reading P0-3 to confirm the LLM still passes the right `inputCoinFromStep` values** — chain only on (1, 2), not on (2, 3).

---

## Phase 3b — `swap → swap` whitelist (multi-hop)

### When you'd want this

Only relevant for actual multi-hop swap chains where one swap's output coin feeds the next swap's input coin within one PTB. Example: *"Convert my SUI to USDC, then convert USDC to USDsui"* — but that's a corner case (Cetus aggregator already finds best routes across DEXs; user-specified intermediate hops are rarely useful).

The more useful Phase 3b case: **explicit hub-and-spoke routing** where the user says "swap A → B → C" and the LLM emits two swap_execute steps with the second chained from the first. Cetus does support `inputCoin: TransactionObjectArgument` for both, so the SDK shape is already there.

### What changes

**Engine (`packages/engine/src/compose-bundle.ts`):**

1. Add `'swap_execute->swap_execute'` to `VALID_PAIRS`.
2. Update `inferProducerOutputAsset('swap_execute', input)` and `inferConsumerInputAsset('swap_execute', input)` to handle the chained case. The producer's output is `input.to`; the consumer's input is `input.from`. `shouldChainCoin` resolves to `producer.input.to === consumer.input.from`.

**Audric:** same one-line whitelist add in `prepare-bundle-tool.ts` (the local copy of `VALID_PAIRS`), plus inference helper update.

**SDK:** **No changes.** `addSwapToTx` already accepts `inputCoin: TransactionObjectArgument`.

### Why ship 3b separately from 3a

Two reasons:

1. **Risk profile.** Phase 3a is a pure-relaxation change to validation logic. Phase 3b adds a new chain shape (swap→swap) that's not been exercised in production. Different soak window justified.
2. **Slippage compounding UX.** Two chained swaps mean compound price impact. The system prompt should warn the LLM to surface compound slippage in the plan card. That's a UX consideration that doesn't apply to 3a.

---

## Locked decisions (author recommendations per "ill go with your recommendations")

| # | Question | Decision | Why |
|---|---|---|---|
| 1 | Cap at 4 or 5? | **4** for Phase 3a. | Covers Demo 1 (the headline). Each cap step needs its own validation surface; raising more conservatively = less to soak. Phase 5 later considers cap=5+ once Phase 3 telemetry confirms zero edge-case revert rate at cap=4. |
| 2 | Ship 3a + 3b together or separately? | **Separately.** 3a first as `1.15.0` (the Demo 1 unlock). 3b as `1.15.x` patch after 3a soaks ≥2 days OR when product specifically asks for multi-hop. | 3b adds a new chain shape; different risk profile. No reason to couple two unlocks. Demo 1 doesn't need 3b. |
| 3 | Should Phase 3a require the LLM to populate `inputCoinFromStep` differently than today? | **No change.** The auto-population logic in `prepare-bundle-tool.ts` already handles "chain when possible, wallet-mode otherwise" correctly. The validator change just stops rejecting the bundle envelope. | Surgical change. Less risk of LLM misbehavior. The LLM doesn't need to know about the DAG relaxation — it keeps emitting plans the same way; the validator stops complaining. |
| 4 | Phase 3a soak before flag-flip? | **No flag.** Strict-tightening style (like Phase 0 + Phase 2). | The change is pure relaxation — every previously valid bundle stays valid. There's no "old behavior" to flip against. Telemetry (`audric.bundle.fast_path_dispatched step_count=4`) is the soak signal. |
| 5 | Phase 3b feature flag? | **`NEXT_PUBLIC_PTB_SWAP_CHAIN_V1`** (env-gated boolean, default false). | 3b adds new chain semantics; safer to gate behind a flag for the first 24-48h, then flip after telemetry validates. |
| 6 | Slippage compound warning for 3b? | **System prompt only.** When emitting a swap→swap chain, the LLM is instructed to add a one-line warning to the plan card: *"Heads up — chained swaps compound price impact (~2× a single swap)."* | Cheaper than building a separate UI affordance. Skill-recipe-style nudge. |
| 7 | What's the Phase 3a verification metric? | **`audric.bundle.fast_path_dispatched step_count=4`** ≥10 events with **zero `audric.bundle.fast_path_skipped reason=...` from validator-side bugs.** | Mirrors SPEC 14's metric-gated retirement. 10 events is a lower bar than 100 because the change surface is smaller (validator relaxation, not new code paths). |
| 8 | P0-10: permit bundles with zero chains? | **YES — permit** (no `_gate: 'no_chains_declared'` guard added). | Atomicity + one-tap-confirm are independently valuable. The LLM emits what the user asks for; if the user says "send X to alex AND send Y to bob," all-or-nothing on both is the right behavior. The bundle envelope's value extends beyond chained-flow use cases — it's also the path to atomic compound writes. Phase 3a `prepare_bundle` accepts a bundle even when `steps.every(s => s.input?.inputCoinFromStep === undefined)`. |

---

## Test corpus (additions to `SPEC_8_CORPUS.md`)

Following the existing P0-* convention. Phase 3a deliverables = P0-8 through P0-10. Phase 3b = P0-11.

| ID | Prompt | Phase | Expected | Acceptance |
|---|---|---|---|---|
| **P0-8** | `swap 10% of my USDC to SUI, swap 50% remaining USDC to USDsui then save it, send 1 USDC to funkii.sui` | 3a | **4-op DAG bundle.** Steps: swap (wallet) + swap (wallet) + save (chained from prev swap) + send (wallet). Only one chain (steps 2→3). One PermissionCard with 4 step rows, one signature, one PTB. | `engine.turn_outcome` = `pending_action_bundle` (n=4). `engine.bundle_chain_mode_set` fires **once** with `{producer: swap_execute, consumer: save_deposit}`. Resume yields ONE `tx_executed`. **Demo 1 acceptance.** |
| **P0-9** | `withdraw 5 USDC, swap to SUI, send 1 SUI to funkii.sui, send 0.5 USDC to alex.sui` | 3a | **4-op partial-chain bundle.** Steps: withdraw + swap (chained from withdraw) + send SUI (chained from swap) + send USDC (wallet). Two chains (0→1, 1→2); step 3 is standalone. | `engine.turn_outcome` = `pending_action_bundle` (n=4). `engine.bundle_chain_mode_set` fires **twice**. Resume yields ONE `tx_executed`. |
| **P0-10** | `withdraw 10 USDC, send 5 USDC to alex.sui, send 5 USDC to bob.sui` | 3a | **3-op bundle, all standalone (LOCKED: PERMITTED).** Today (Phase 2 strict-adjacency) this rejects: `send_transfer → send_transfer` is not whitelisted. Under Phase 3a, since neither send chains, no whitelist check runs and the bundle composes. The `withdraw` is also wallet-mode (no chain produced), but its output is consumed by `send` via wallet pre-fetch (existing wallet-mode path). One PermissionCard, one signature, one PTB containing 3 independent writes that all-or-nothing settle atomically. | `engine.turn_outcome` = `pending_action_bundle` (n=3). `engine.bundle_chain_mode_set` fires **zero times** (no chains). Resume yields ONE `tx_executed`. **All-or-nothing atomicity is the value prop here, not chained handoff.** |
| **P0-11** | `swap 5 USDC to SUI then swap 4 SUI to USDsui` | 3b | **2-op multi-hop swap chain.** Both steps are swaps; step 1 chains from step 0. Pair = `swap_execute → swap_execute` (3b whitelisted). Asset alignment: producer.to=SUI ↔ consumer.from=SUI ✓. One PermissionCard, one signature, one PTB. | `engine.turn_outcome` = `pending_action_bundle` (n=2). `engine.bundle_chain_mode_set` fires once with `{producer: swap_execute, consumer: swap_execute}`. Plan card includes compound-slippage warning. |

**Telemetry shape note:** P0-8 fires `bundle_chain_mode_set` only **once** (the save chain) even though it's a 4-op bundle. This is the new "DAG mode" signature. The SPEC 8 corpus' "Acceptance for SPEC 13 corpus" footnote needs an update: the rule "fires `n-1` times for an n-op bundle" was Phase 2 strict-adjacency; Phase 3a allows fewer fires.

---

## Risks

### R1 — DAG validator misclassifies a chain-required step as wallet-mode

If `prepare_bundle`'s auto-population fails to set `inputCoinFromStep` on a step where chaining IS required for correctness (e.g. the consumer's asset isn't in the wallet), the bundle composes but reverts at PREPARE time inside `selectAndSplitCoin`. Mitigation: existing wallet-mode preflight checks in each appender — they throw `T2000Error('NO_COINS_FOUND')` BEFORE the PTB is built, surfacing the problem clearly. No new code needed; we rely on existing layer-3 guards. Add an integration test that confirms: a 4-op bundle with a missing `inputCoinFromStep` on a chain-required step returns the correct error at prepare time, not a silent on-chain revert.

### R2 — `prepare_bundle` Redis stash holds stale plans for 60s

Phase 3a doesn't change this — stash TTL stays at 60s per SPEC 14 v0.2 lock. But a 4-op flow takes longer to think about than a 2-op flow. If users routinely take >60s to confirm a 4-op plan, we'll see `audric.bundle.fast_path_skipped reason=expired` rates climb. **Soak signal.** If `expired` rate >5% of `dispatched` for 4-op bundles, raise TTL to 90s. Don't pre-emptively raise — over-eager TTL widens price-drift exposure for the swap leg.

### R3 — Cap=4 prepare-bundle plan card UX

The PermissionCard currently renders bundle steps in a vertical list. At 4 steps the visual weight is fine; at 5+ it'd start to feel heavy on mobile. Cap=4 is a deliberate UX-driven ceiling for now. Phase 5 considers compact rendering before cap raises further.

### R4 — Phase 3b multi-hop swap PTB instruction budget

Cetus router can emit 5–15 instructions per swap depending on routing complexity. Two chained swaps could hit 30 instructions. PTB cap is ~1024, so we're fine. But add `instructionCount` to the SDK's `composeTx` preview return as Phase 3b work — gives us early warning if a future cap raise compounds with new tools.

### R5 — Telemetry breaks dashboard queries that assumed `n-1` chains

Any internal query that's hardcoded "expected_chain_count = step_count - 1" will misreport on Phase 3a bundles. Audit before ship: grep the audric repo for `step_count - 1` or similar arithmetic on bundle metrics. Likely zero hits (we just shipped 1.13.1's chain telemetry, no aggregation built yet), but worth checking.

---

## File plan

### Phase 3a (engine `1.15.0`)

| File | Change | LOC | Risk |
|---|---|---|---|
| `packages/engine/src/compose-bundle.ts` | `MAX_BUNDLE_OPS` 3 → 4. Strict-adjacency loop → chain-only loop. Comment block update. | ~30 | Low |
| `packages/engine/src/compose-bundle.test.ts` | New test cases: 4-op DAG (P0-8 shape), 4-op partial-chain (P0-9 shape), all-standalone bundle rejection (P0-10 case). | ~80 | Low |
| `packages/sdk/src/composeTx.ts` | **No change.** | 0 | — |
| `audric/apps/web/lib/engine/prepare-bundle-tool.ts` | Same adjacency-loop relaxation. `MAX_BUNDLE_OPS` 3 → 4. Add no-chains-declared rejection (per P0-10 decision). | ~25 | Low |
| `audric/apps/web/lib/engine/__tests__/prepare-bundle-tool.test.ts` | New test cases mirroring engine: 4-op DAG, 4-op partial-chain, all-standalone rejection. | ~80 | Low |
| `audric/apps/web/lib/engine/engine-context.ts` | System prompt: cap 3 → 4, add 4-op example, update token budget comment. | ~10 | Low (token budget check required, ≤10,200) |
| `spec/SPEC_8_CORPUS.md` | Add P0-8, P0-9, P0-10. Update P0-3 expected outcome (Phase 2 → Phase 3a). | ~30 | — |
| `spec/SPEC_13_PTB_CHAINING_FOUNDATION.md` | v0.4 entry: Phase 3a shipped, Phase 3b deferred. | ~20 | — |

**Total Phase 3a:** ~275 LOC + tests, single coordinated engine release + audric bump. Effort: ~1.5d.

### Phase 3b (engine `1.15.x`)

| File | Change | LOC |
|---|---|---|
| `packages/engine/src/compose-bundle.ts` | Add `swap_execute->swap_execute` to VALID_PAIRS. Update inference helpers. | ~10 |
| `packages/engine/src/compose-bundle.test.ts` | swap→swap chain test. | ~40 |
| `audric/apps/web/lib/engine/prepare-bundle-tool.ts` | Mirror whitelist add. Add slippage warning hint (system prompt or tool description). | ~15 |
| `audric/apps/web/lib/engine/engine-context.ts` | Update whitelist list to include swap→swap. Add compound-slippage warning instruction. | ~10 |
| `spec/SPEC_8_CORPUS.md` | Add P0-11. | ~10 |

**Total Phase 3b:** ~85 LOC + tests, single patch release. Effort: ~0.75d.

---

## Day-by-day (Phase 3a)

- **Day 1** — Branch `feat/spec13-phase3a-dag-validator`. Engine changes + engine tests. Local test pass, typecheck clean.
- **Day 2** — Audric mirror changes (prepare-bundle-tool + system prompt). Audric tests + token-budget check (≤10,200). End-to-end smoke: P0-8 in dev console.
- **Ship** — Release workflow `--field bump=minor` → engine `1.15.0`. Audric `pnpm add @t2000/{sdk,engine}@1.15.0` → push. Vercel auto-deploys.
- **Soak** — Watch `audric.bundle.fast_path_dispatched step_count=4`. ≥10 events + zero validator-side skips before declaring stable.
- **Then Phase 3b** if/when product asks.

---

## Implementation guardrails (locked from May 3 design review)

These are the things that must hold true after Phase 3a ships, in tightening order. Any drift triggers a rollback.

1. **Strict relaxation invariant.** Every bundle that was valid under Phase 2 strict-adjacency MUST stay valid under Phase 3a DAG-aware. Test: run the full P0-1 through P0-7 corpus against the new validator; expect identical pass/fail outcomes.
2. **No silent on-chain reverts.** If the LLM emits a 4-op bundle where a chain-required step has missing `inputCoinFromStep`, the failure must surface at PREPARE time via `T2000Error('NO_COINS_FOUND')`, not as an on-chain revert. Test: synthetic missing-chain test in `composeTx.test.ts`.
3. **Telemetry interpretability.** `engine.bundle_chain_mode_set` fires once per actual chain, NOT once per adjacent pair. The `step_count - 1` baseline is gone. Update any internal aggregation queries before ship.
4. **Token budget.** System prompt update keeps total ≤10,200 tokens (current Phase 2 ceiling).
5. **All-or-nothing semantics for P0-10.** A 3-op bundle of independent writes (no chains) MUST settle atomically — if any one write reverts, all revert. This is the on-chain PTB guarantee, but worth a confirmation test that asserts a 3-op bundle with one intentionally-failing write produces zero state changes.

---

## Cross-references

- Parent spec → `spec/SPEC_13_PTB_CHAINING_FOUNDATION.md` (v0.3 — Phase 2 shipped)
- Phase 1 spike report → `spec/SPEC_13_PHASE1_SPIKE_REPORT.md`
- Bundle dispatch fast path → `spec/SPEC_14_PREPARE_BUNDLE_PLAN_TIME_COMMITMENT.md` (v0.2)
- Eval corpus → `spec/SPEC_8_CORPUS.md` § "PTB CHAINING (SPEC 13 acceptance)"
- Current Phase 2 implementation → `packages/engine/src/compose-bundle.ts` § `validateStepGraph` (strict-adjacency loop, lines ~140–230)
- Audric mirror → `audric/apps/web/lib/engine/prepare-bundle-tool.ts`
