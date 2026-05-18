# SPEC 13 Phase 1 — Day 1 Spike Report

**Date:** 2026-05-03
**Branch:** `feat/spec13-phase1-chaining`
**Spike question:** Can `@cetusprotocol/aggregator-sdk` accept a `TransactionObjectArgument` (chained `Coin<T>`) as input and return a `Coin<U>` output without an internal wallet pre-fetch? And do the other 5 SPEC 13 builders share the same shape?

**Decision: GREEN.** Proceed with Phase 1 implementation. Effort revised down from ~8–10d to ~2–3d — the SDK is structurally ready; Phase 1 is purely orchestration-layer + type-additions, not a builder migration.

---

## Findings

### Cetus aggregator SDK — chain mode already shipped

`packages/sdk/src/protocols/cetus-swap.ts` lines 156–175 (`buildSwapTx`) call `client.routerSwap({ inputCoin, txb, ... })` directly. The SDK's `AggregatorClient.routerSwap` accepts a `TransactionObjectArgument` for `inputCoin` and returns `Promise<TransactionObjectArgument>` for the output coin. No internal wallet read.

Lines 220–317 (`addSwapToTx`) already expose both modes via the optional `input.inputCoin?: TransactionObjectArgument` parameter:

- **`inputCoin` provided** → chain mode: skip `selectAndSplitCoin`, consume the passed handle, return the output handle.
- **`inputCoin` omitted** → wallet mode: pre-fetch from wallet via `selectAndSplitCoin`, run the swap, return output handle.

Existing test coverage (`cetus-swap.test.ts` line 355): `it('chain mode (inputCoin provided): does NOT fetch coins, consumes the ref', ...)`.

### All 6 target builders are structurally chain-ready

| Builder | Role | `inputCoin` accepted? | Returns coin handle? | Source |
|---|---|---|---|---|
| `addSaveToTx` | consumer | YES — `coin: TransactionObjectArgument` arg | NO (terminal — passes coin to NAVI deposit) | `protocols/navi.ts:400` |
| `addRepayToTx` | consumer | YES — `coin: TransactionObjectArgument` arg | NO (terminal — passes coin to NAVI repay) | `protocols/navi.ts:420` |
| `addSendToTx` | consumer | YES — `coin: TransactionObjectArgument` arg | NO (terminal — `tx.transferObjects([coin], recipient)`) | `wallet/send.ts:72` |
| `addWithdrawToTx` | producer | N/A | YES — `Promise<{ coin, effectiveAmount }>` | `protocols/navi.ts:359` |
| `addBorrowToTx` | producer | N/A | YES — `Promise<TransactionObjectArgument>` | `protocols/navi.ts:495` |
| `addSwapToTx` | both | YES (`input.inputCoin?`) | YES (`{ coin, ... }`) | `protocols/cetus-swap.ts:220` |
| `addStakeVSuiToTx` | both | YES (`input.inputCoin?`) | YES (`{ coin, ... }`) | `protocols/volo.ts:151` |
| `addUnstakeVSuiToTx` | both | YES (`input.inputCoin?`) | YES (`{ coin, ... }`) | `protocols/volo.ts:223` |

Every consumer accepts a `TransactionObjectArgument` arg directly. Every producer returns the coin handle. **No SDK builder migration is needed.**

### `composeTx` orchestration layer is the only gap

The SDK's `composeTx` (`packages/sdk/src/composeTx.ts`) currently iterates `opts.steps` independently — each appender invocation is isolated, no cross-step state, no coin handoff. The registry entry for `swap_execute` (line 473) calls `addSwapToTx` WITHOUT `inputCoin`, so it always runs in wallet mode. Same for `save_deposit`, `repay_debt`, `send_transfer` — they all unconditionally call `selectAndSplitCoin` before the appender.

The producer registry entries (`withdraw`, `borrow`, `swap_execute`, `volo_stake`, `volo_unstake`) all do `tx.transferObjects([coin], ctx.sender)` AT THE END of the appender — materializing the producer's output to the wallet. **For chained consumption to work, this terminal transfer must be conditionally skipped when the producer's output is consumed by a downstream step.**

This is the entire Phase 1 implementation surface.

### Engine `composeBundleFromToolResults` is also nearly ready

`packages/engine/src/compose-bundle.ts` produces typed `PendingActionStep[]`. The struct (`PendingActionStep` in `packages/engine/src/types.ts`) needs a single new optional field `inputCoinFromStep?: number` so the engine can express "step 1's output is step 2's input" in the bundle envelope and the host can pass it through to `composeTx`.

The 7-pair `VALID_PAIRS` whitelist (compose-bundle.ts lines 114–122) already enumerates exactly the producer/consumer pairs that Phase 1 will chain. No engine bundle-composer migration needed beyond the type field.

---

## Phase 1 plan (revised)

### What changes

**SDK changes — `packages/sdk/src/composeTx.ts` only:**

1. Add `inputCoinFromStep?: number` to each consumer variant of `WriteStep` (`save_deposit`, `repay_debt`, `send_transfer`, `swap_execute`, `volo_stake`, `volo_unstake`).
2. Track per-step output handles in a `priorOutputs: (TransactionObjectArgument | null)[]` array inside the orchestration loop. Producers register their handle; consumers register `null`.
3. In each consumer registry entry, branch on `step.inputCoinFromStep`:
   - If defined → look up `priorOutputs[N]`, pass it as `inputCoin`, skip `selectAndSplitCoin`.
   - If undefined → wallet mode (current behaviour).
4. **Output-suppression for chained producers**: track a `consumedSteps: Set<number>` from the bundle's `inputCoinFromStep` references. Producer registry entries skip their terminal `tx.transferObjects([coin], ctx.sender)` when their step index is in `consumedSteps`. Otherwise they materialize to wallet as today.
5. New error class `T2000Error('CHAIN_MODE_INVALID_INDEX', ...)` for malformed `inputCoinFromStep` values.

**Engine changes — `packages/engine/src/types.ts` + `compose-bundle.ts`:**

1. Add `inputCoinFromStep?: number` to `PendingActionStep`.
2. In `composeBundleFromToolResults`, populate the field for the consumer step (index 1) of every whitelisted producer→consumer pair. The mapping is mechanical: when the bundle is `swap_execute → save_deposit`, step 1 gets `inputCoinFromStep: 0`. The 7-pair whitelist already encodes which pairs chain.
3. The system prompt **does not change** — the LLM still emits the same tool calls; only the bundle envelope picks up the new field.

**Audric host changes — `audric/apps/web/app/api/transactions/prepare/route.ts`:**

1. When walking `pendingAction.steps`, forward each step's `inputCoinFromStep` into the `composeTx({ steps })` call. (Trivial — `WriteStep` is the same shape.)

### What stays out of Phase 1

- **`swap → swap` chained-asset handoff** — locked Q1: defer to Phase 3.
- **Whitelist expansion** — Phase 2 widens once chain-mode is proven in production.
- **3-op bundles** — Phase 2 lifts cap to 3 once Phase 1 is stable.
- **Graph-aware DAG validation** — Phase 2.
- **`split_coin` + N×consumer fan-out** — Phase 4.

### Effort estimate (revised)

| Slice | Original | Revised | Why |
|---|---|---|---|
| Cetus SDK migration | 2d | 0d | Already shipped chain mode in v0.43.x. |
| NAVI/Volo/send builder migrations | 3d | 0d | Already shipped — every consumer accepts `coin`, every producer returns it. |
| `composeTx` orchestration | 2d | 1d | Pure type + loop changes, no SDK surgery. |
| Engine `compose-bundle.ts` field threading | 1d | 0.5d | One field on `PendingActionStep`, mechanical population. |
| Tests (chain-mode E2E in `composeTx.test.ts`) | 1d | 1d | Unchanged — write the cross-step E2E coverage. |
| Audric host wiring | 1d | 0.25d | Forward one optional field. |
| **Total** | **~10d** | **~2.75d** | SDK was already 80% done. |

### Day-by-day plan

- **Day 1 (today)** — Spike done. ✓
- **Day 2 (Mon)** — Add `inputCoinFromStep` to `WriteStep` + `PendingActionStep`. Rework `composeTx` orchestration loop (priorOutputs tracking, consumer dispatch, output suppression). Land all SDK unit tests for chain mode.
- **Day 3 (Tue)** — Engine `compose-bundle.ts` field population. Engine tests for the 7 whitelisted pairs covering `inputCoinFromStep` values. Audric host wiring. End-to-end smoke test: live `swap+save` and `withdraw+swap` flows execute with one signature, no wallet pre-materialization.
- **Day 4 (Wed)** — Soak in production. Ship engine `1.13.0` + audric bump. Re-run the SPEC 8 corpus P0-1 through P0-5 against the new build; expect P0-1 and P0-2 to remain green AND P0-3's split point to move (3-op now bundles 2 + 1 instead of 2 + 1 sequential). Update SPEC 13 doc + audric-build-tracker S.53.9.
- **Day 5+** — Phase 2 kickoff (cap 3, whitelist widening) once Day 4 telemetry confirms zero regressions over 24h.

---

## Risks / open questions surfaced by the spike

### R1 — Output-suppression invariant must be airtight

The single subtle correctness concern: if a producer's terminal `tx.transferObjects([coin], sender)` is incorrectly NOT suppressed when the coin is consumed downstream, the same `TransactionObjectArgument` gets used twice (once by the consumer, once by the transfer) and the PTB build fails late or the on-chain swap reverts. Mitigation: assert in `composeTx` that every coin handle in `priorOutputs` is either consumed exactly once OR transferred to wallet exactly once — never both, never neither. Vitest unit test enforces both halves of this invariant before any chain-mode change ships.

### R2 — `derivedAllowedAddresses` may need to drop the chained producer

When `withdraw → swap_execute`, the withdraw producer no longer transfers to the user's wallet (it's consumed by swap). The user's address would no longer appear in `transferObjects` from that step. Phase 1 must verify that swap's terminal `transferObjects([result.coin], sender)` (line 495) still fires, putting the user's address in `derivedAllowedAddresses`. Spot-check confirms this — swap is a producer when consumed, but a wallet-terminal when standalone, and the registry entry at line 495 unconditionally transfers. The fix in step 4 above (skip terminal transfer when consumed) must NOT skip the FINAL chained producer in a 2-op bundle (because nothing consumes it). Implementation: `consumedSteps` tracks step INDEXES that are consumed by index `inputCoinFromStep`; the LAST step in any bundle is never in `consumedSteps`. Test: bundle `swap_execute → save_deposit` → swap output goes to NAVI deposit (no transfer); save is terminal (no transfer needed; NAVI consumes the coin). bundle `withdraw → swap_execute` → withdraw output flows into swap (no transfer); swap output goes to wallet (transfer fires, sender address in `derivedAllowedAddresses`). Both cases verified by inspection of the registry entries.

### R3 — Pyth/Enoki flag interactions unchanged

Spike confirms `sponsoredContext` flag (`composeTx.ts:198`) propagates to all NAVI builders via `skipPythUpdate` / `skipOracle` and to Cetus via `getProvidersExcluding(SPONSORED_PYTH_DEPENDENT_PROVIDERS)`. Chain mode does not affect these flags — the producer's appender still sets them, the consumer's appender still sets them. No Phase 1 work needed on Pyth/Enoki.

### R4 — `claim_rewards` stays explicitly OUT of Phase 1

`addClaimRewardsToTx` returns `PendingReward[]` (multiple coins of varied types). Chaining N reward coins into N consumers is a fan-out shape that Phase 4 owns via `split_coin`. Phase 1 keeps `claim_rewards` as a wallet-terminal-only producer.

---

## Conclusion

**GREEN. Proceed to Day 2.**

The structural work for Phase 1 was completed during SPEC 7 v0.4 Layer 0 + Layer 1 ship — the SDK is already canonical-write-only, every appender already speaks the chain-mode shape, every consumer already accepts a coin handle, every producer already returns one. The only remaining work is wiring `inputCoinFromStep` through `composeTx`'s orchestration loop and the engine bundle envelope.

Phase 1 delivery target: **engine 1.13.0 by Wednesday 2026-05-06**, two days ahead of the original SPEC 13 timeline.

---

## Cross-references

- **Phase 0 supersedence** → `compose-bundle.ts` MAX_BUNDLE_OPS=2 + VALID_PAIRS (S.53.8)
- **Canonical write architecture** → `spec/SPEC_7_MULTI_WRITE_PTB.md` § Layer 0
- **SPEC 13 plan** → `spec/SPEC_13_PTB_CHAINING_FOUNDATION.md`
- **SPEC 13 acceptance corpus** → `spec/SPEC_8_CORPUS.md` "PTB CHAINING (SPEC 13 acceptance)" section (P0-1 through P0-5)
- **Existing chain-mode test** → `packages/sdk/src/protocols/cetus-swap.test.ts:355`
