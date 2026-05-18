# Spec 13: PTB Chaining Foundation — atomic write composition with chained coin handoff

*Version 0.4 — Phase 3a shipped · May 4 2026 · Internal · **local-only, gitignored***
*Status: Phase 0 ✓ shipped (1.12.0). Phase 1 ✓ shipped (1.13.0). Phase 1 telemetry ✓ shipped (1.13.1). Phase 2 ✓ shipped (1.14.0). **Phase 3a ✓ shipped (1.15.0, this version).** Phase 3b (`swap_execute → swap_execute` whitelist for multi-hop swap chains) is deferred — flag-gated when shipped, requires slippage warning prompt + soak data from Phase 3a (≥10 4-op DAG dispatches with zero validator-side skips).*
*Author: Drafted during the May 3 architecture review pass. Triggered by the cumulative cost of bundle-related patches across the SPEC 7 P2.7 soak (F8/F9/F10/F13/M3/F14/F14-fix-2/F15/MAX_BUNDLE_OPS) — all symptoms of the same underlying gap.*

**Product impact (locked):** When a user says *"Swap 10% into SUI, save 50% of my remaining USDC, then send $100 to Mom"*, the bundle today fails atomically because the `save_deposit` appender can't find USDsui in the wallet at compose time (it's about to be produced by the `swap_execute` step). SPEC 13 lets the bundle compose — swap output threads directly into deposit input inside the same PTB — and the 3-op atomic Payment Stream lands in one signature. Same story for Demo 2 (4-vendor commerce cart): a `split_coin` step produces N USDC chunks that thread into N `pay_api` legs, all atomic. Both demos are Sui's structural advantage over every other chain; SPEC 13 is what makes them shippable end-to-end.

**Engine version target:** `@t2000/engine 1.13.0` (bumps from `1.12.0` Phase 0).
**SDK version target:** `@t2000/sdk 1.13.0` (matched bump; release workflow ships all 4 packages together).
**Engine baseline:** `1.12.0` (post-Phase-0 ship, target ~end of week 2026-05-09).
**SDK baseline:** `1.12.0` (no SDK functional changes in Phase 0).
**Audric baseline:** Whatever `audric:main` is when Phase 0 + instrumentation ship.
**Backward compat (locked):** Single-write `composeTx({ steps: [{...}] })` shape unchanged. Wallet-mode (each step pre-fetches its own coin) stays the default fallback for non-chained steps. Chained-coin handoff is opt-in via the new `inputCoinFromStep` field.

**Phase 1 spike result (2026-05-03 afternoon):** GREEN. Every SDK appender already supports chain mode at the shape level (consumers accept `coin: TransactionObjectArgument`; producers return the handle; `addSwapToTx` already exposes both modes; existing test coverage at `cetus-swap.test.ts:355`). Phase 1 implementation surface is **`composeTx` orchestration + 1 optional field on `PendingActionStep`** — no SDK builder migration. Effort revised down from ~10d to ~2.75d. Full spike report: `spec/SPEC_13_PHASE1_SPIKE_REPORT.md`.

---

## Revision log

| Version | Date | Changes |
|---|---|---|
| 0.4 | 2026-05-04 | **Phase 3a shipped (1.15.0).** `MAX_BUNDLE_OPS` raised 3 → 4. Engine strict-adjacency rejection block in `engine.ts:1577-1641` removed entirely; `composeBundleFromToolResults`'s opportunistic chain-mode population (whitelisted asset-aligned pairs only) is the sole validator. Audric `prepare-bundle-tool.ts` adjacency rejection removed in lockstep; `pair_not_whitelisted` removed from `PrepareBundleData` reason union. Locked decision: zero-chain bundles permitted (P0-10 — atomicity + one-tap UX is independently valuable; bundle envelope's role extends beyond chained flows). New engine tests: 4-op DAG (P0-8), 4-op partial-chain (P0-9), 4-op zero-chain (P0-10), chain-mode-only-fires-for-actually-chained-pairs invariant. Pre-3a "refuses non-whitelisted pair" tests converted to "Phase 3a accepts" assertions. Audric tests mirror with `it.skipIf(MAX_BUNDLE_OPS < 4)` guards on 4-op rows so they auto-activate post-bump. System prompt rewritten to DAG-aware framing (cap 4, 4-op DAG example, zero-chain bundle paragraph) — token budget 10,131 / 10,200. SPEC 8 corpus extended to 11 P0-* prompts: P0-3 / P0-4 / P0-5 expected outcomes flipped from rejection → acceptance; P0-8 / P0-9 / P0-10 added for 4-op DAG / 4-op partial-chain / zero-chain shapes; P0-11 added for 5-op cap rejection. Phase 3b (`swap_execute → swap_execute` whitelist) deferred — separate ship gated on Phase 3a soak (≥10 4-op DAG dispatches with zero validator-side skips). |
| 0.3 | 2026-05-04 | **Phase 2 shipped (1.14.0).** `MAX_BUNDLE_OPS` raised 2 → 3. Engine pair-whitelist check converted from `length === 2` single-pair to `for i in 0..N-2` strict-adjacency loop. SDK validated as already 3-op-ready (zero shape changes). 8 new engine tests + 1 new SDK orchestration test (3-op chain). System prompt updated to "cap 3 + 3-op example", token budget 10,193 / 10,200. SPEC 8 corpus extended to 7 P0-* prompts (P0-6 = `withdraw → swap → send`, P0-7 = `withdraw → swap → save` — both expected to fire `engine.bundle_chain_mode_set` twice and resolve to ONE `txDigest`). Phase 3 (`swap → swap` + DAG validator + cap 4) deferred. |
| 0.2 | 2026-05-03 (afternoon) | **Phase 1 spike outcome — GREEN.** Spike report at `spec/SPEC_13_PHASE1_SPIKE_REPORT.md`. Discovered every SDK builder already supports the chain-mode shape (consumers accept `coin: TransactionObjectArgument`, producers return the coin handle, `addSwapToTx` already exposes both modes via `input.inputCoin?`). Phase 1's "six SDK builder migrations" is therefore zero — the work is purely orchestration in `composeTx` + one optional field on `PendingActionStep`. Effort estimate revised from ~10d to ~2.75d. Phase 1 ship target moves up from week of May 12 to **Wednesday 2026-05-06** (engine `1.13.0`). |
| 0.1 | 2026-05-03 (morning) | Initial scoping draft. Triggered by May 3 production review. Six SDK builder changes + one engine-side step-graph validator + a typed pair registry. Five phases (0-stabilize, 1-foundation, 2-3op, 3-DeFi-demo, 4-commerce, 5-arbitrary). |

---

## TL;DR

`composeTx({ steps })` already does PTB assembly across N appenders. **It just doesn't thread coin outputs from step N into step N+1's input** — every step pre-fetches its own coin from the user's wallet via `client.getCoins()`. When a chained asset doesn't exist in the wallet yet (because a prior step is about to produce it), the fetch fails and the whole bundle reverts at PREPARE time.

The fix is a small typed extension of `WriteStep`:

```ts
type WriteStep = {
  toolName: 'save_deposit';
  input: SaveDepositInput;
  inputCoinFromStep?: number;  // NEW — index of the prior step whose output is this step's input
};
```

Each appender learns:
1. **Skip the wallet fetch when `inputCoinFromStep` is set.** Take the prior step's `TransactionResult` instead.
2. **Don't transfer chained outputs back to the user.** When a step's output is going to be consumed by a later step, omit the `tx.transferObjects([coin], sender)` call. Only the FINAL holder of an output transfers it.

The engine learns:
1. **Validate the step graph at bundle composition time.** Every step declares what it consumes and produces. The engine walks the graph: every step that references `inputCoinFromStep: N` must be downstream of step N, and step N must produce a coin whose asset matches step N+1's input contract. Mismatches synthesize a `_gate: 'chain_invalid'` tool_result so the LLM re-plans.
2. **Refuse non-whitelisted pairs.** A `valid_pairs` registry lists every (producer, consumer) couple we've explicitly built + tested. Engine rejects bundles whose adjacent pairs aren't in the registry. Bumping the registry is how we expand bundle capability over time.

Phased rollout starts at **2-op pairs** (Phase 1, 7 pairs) → **3-op chains** (Phase 2, composed from valid 2-op pairs) → **4-op DeFi demo** (Phase 3, the headline use case) → **commerce composition** (Phase 4, `split_coin` + N×`pay_api`) → **arbitrary** (Phase 5, raised cap once registry covers everything useful).

---

## What this spec does NOT touch

- **Sequential fallback for non-whitelisted compositions.** When the engine refuses a bundle, the LLM splits and re-plans. That path already works today; SPEC 13 doesn't change it.
- **`pay_api` (DeFi side).** The MPP-payment leg is Phase 4 work. Phase 1-3 cover only the 9 canonical write tools in `@t2000/sdk`.
- **`claim_rewards`, `volo_stake`, `volo_unstake`.** These produce/consume coins but aren't part of any near-term bundle use case. They get chaining support only when a flow demands it (Phase 5 or later).
- **Cross-chain PTBs.** Sui-native only.
- **The "Response interrupted · retry" bug.** Independent of bundles. Diagnosed via Phase 0 instrumentation, fixed in its own ship.

---

## Phase 0 — Immediate stabilization (NOT this spec, ships in `1.12.0`)

Recap, because SPEC 13 builds on top of it:

1. **`MAX_BUNDLE_OPS` lowered from 5 → 2.** Engine refuses any bundle with N>2 writes; LLM splits.
2. **Pair whitelist guard.** When N=2, engine checks the (step[0], step[1]) pair against a hardcoded whitelist of 7 pairs (see § "Phase 1 pair registry" below). If the pair isn't whitelisted, engine refuses and synthesizes a `_gate: 'pair_not_whitelisted'` tool_result.
3. **System prompt simplification.** The two competing rules ("4-5 writes split across two turns" and "6+ HARD CAP") collapse into one: *"Bundles are 2 ops max, and only specific pairs are supported. For longer flows or non-whitelisted pairs, do them sequentially."*
4. **Streaming instrumentation.** Every engine generator exit point (`turn_complete` / `pending_action` / `error` / silent return) and every host stream close logs structured fields. We use this to diagnose the "Response interrupted · retry" bug from real production traffic.

Phase 0 ships behind no flag — it's a strict tightening, not a feature. Existing 2-op flows that were working continue working (because they all happen to be in the whitelist already). Existing 3+ op flows that were working flakily now reliably split sequentially. The lost capability is a small set of obscure 2-op pairs that aren't in the whitelist; the LLM splits them and the user gets the same outcome with one extra confirm tap.

**SPEC 13 starts from this baseline.**

---

## The architectural problem (current state)

### What `composeTx` does today (Layer 0, post-SPEC-7)

Each step in the bundle dispatches to a **fragment-appender** in `WRITE_APPENDER_REGISTRY`:

```ts
// packages/sdk/src/composeTx.ts:354
save_deposit: async (tx, input, ctx) => {
  // Wallet-mode coin fetch — THIS IS THE PROBLEM:
  const { coin, effectiveAmount } = await selectAndSplitCoin(
    tx, ctx.client, ctx.sender, assetInfo.type, rawAmount,
  );
  await addSaveToTx(tx, ctx.client, ctx.sender, coin, { asset });
  return { toolName: 'save_deposit', effectiveAmount, asset };
},

swap_execute: async (tx, input, ctx) => {
  // Produces a coin output:
  const result = await addSwapToTx(tx, ctx.client, ctx.sender, { ... });
  // BUT immediately dumps it back to the user — no chaining:
  tx.transferObjects([result.coin], ctx.sender);
  return { toolName: 'swap_execute', ...result };
},
```

`selectAndSplitCoin` calls `client.getCoins({ owner: sender, coinType: asset })`. If the user holds zero of `asset`, it throws `T2000Error('NO_COINS_FOUND', ...)`. The asset that `swap_execute` is *about to produce* doesn't exist in the wallet yet, so the next step's fetch fails and the bundle reverts.

### What's already there

The infrastructure is solid:

- ✓ `composeTx({ steps })` is the canonical entry-point, threading per-step appenders.
- ✓ Each appender returns a typed `StepPreview`.
- ✓ `derivedAllowedAddresses` auto-extracted from PTB (no hand-maintained array drift).
- ✓ NAVI + Cetus + Volo builders all already hand back `{ coin, ... }` objects.
- ✓ Single-write goes through the same code path (so adding chaining doesn't fork single-write behavior).

### What's missing

1. **A way for step N+1 to declare "I want step N's output as my input."**
2. **Step-N appender knowing whether to transfer its output to the user (final holder) or leave it in the PTB stack (chained input for step N+1).**
3. **Engine-side validation that the chain is well-formed before composeTx is called** (fail fast, don't let a malformed bundle waste a PREPARE round-trip).

These are the three deliverables of Phase 1.

---

## The contract — `consumes` / `produces` model

Every appender declares, via static metadata on its registry entry, what it consumes and produces:

```ts
// packages/sdk/src/composeTx-graph.ts (NEW)

export type CoinAsset =
  | 'USDC'
  | 'USDsui'
  | 'SUI'
  | 'vSUI'
  | { dynamic: 'swap.to' };  // swap_execute's output is determined by input.to

export interface AppenderCoinSpec {
  /** Coins this step takes as INPUT. Empty = no coin input (e.g. claim_rewards). */
  consumes: CoinAsset[];
  /** Coins this step produces as OUTPUT. Empty = no coin output (e.g. send_transfer). */
  produces: CoinAsset[];
}

export const APPENDER_COIN_SPEC: Record<WriteToolName, AppenderCoinSpec> = {
  save_deposit:   { consumes: ['USDC', 'USDsui'], produces: [] },                  // takes 1 stable, deposits
  withdraw:       { consumes: [],                produces: ['USDC', 'USDsui'] },   // pulls from NAVI
  borrow:         { consumes: [],                produces: ['USDC', 'USDsui'] },   // creates debt + coin
  repay_debt:     { consumes: ['USDC', 'USDsui'], produces: [] },
  send_transfer:  { consumes: ['USDC', 'USDsui', 'SUI'], produces: [] },
  swap_execute:   { consumes: [{ dynamic: 'swap.from' }], produces: [{ dynamic: 'swap.to' }] },
  claim_rewards:  { consumes: [],                produces: [] },                   // produces N reward coins, but not chainable in v1
  volo_stake:     { consumes: ['SUI'],           produces: ['vSUI'] },
  volo_unstake:   { consumes: ['vSUI'],          produces: ['SUI'] },
};
```

**Resolution rules** (the engine's step-graph validator runs these at compose time):

1. If a step has `inputCoinFromStep: N`, then step N's `produces[0]` (resolved against actual input) must be assignable to step's `consumes[0]` (resolved). For static asset arrays, "assignable" means equality. For `{ dynamic: 'swap.to' }`, the swap step's `input.to` is the actual produced asset.
2. A step with N > 0 `produces` whose output is consumed by some later step does NOT do `tx.transferObjects` for that output. Otherwise, it does.
3. A step with N > 0 `consumes` and `inputCoinFromStep` set takes the chained coin and SKIPS its `selectAndSplitCoin` / `selectSuiCoin` call.
4. A step with N > 0 `consumes` and `inputCoinFromStep` UNSET falls back to wallet-mode (existing behavior).

---

## Builder signature changes

The new shape adds two optional fields to `WriteStep` and one to the appender function. **Existing single-step callers see no change** (everything is opt-in).

### `WriteStep` extension

```ts
export type WriteStep =
  | { toolName: 'save_deposit'; input: SaveDepositInput; inputCoinFromStep?: number }
  | { toolName: 'withdraw'; input: WithdrawInput }
  | { toolName: 'borrow'; input: BorrowInput }
  | { toolName: 'repay_debt'; input: RepayDebtInput; inputCoinFromStep?: number }
  | { toolName: 'send_transfer'; input: SendTransferInput; inputCoinFromStep?: number }
  | { toolName: 'swap_execute'; input: SwapExecuteInput; inputCoinFromStep?: number }
  | { toolName: 'claim_rewards'; input: ClaimRewardsInput }
  | { toolName: 'volo_stake'; input: VoloStakeInput; inputCoinFromStep?: number }
  | { toolName: 'volo_unstake'; input: VoloUnstakeInput; inputCoinFromStep?: number };
```

`withdraw` and `borrow` don't take `inputCoinFromStep` because their `consumes` is empty. `claim_rewards` similarly.

### `AppenderContext` extension

The PTB-walker passes a per-step lookup of prior outputs:

```ts
export interface AppenderContext {
  client: SuiJsonRpcClient;
  sender: string;
  sponsoredContext: boolean;
  overlayFee?: OverlayFeeConfig;
  feeHooks?: ComposeTxFeeHooks;
  /** NEW — outputs produced by prior steps, keyed by step index. */
  priorOutputs: Map<number, TransactionObjectArgument>;
}
```

### Per-builder migration

Six builders touch coin inputs/outputs. Each needs a small change:

| Builder | Change | LOC | Risk |
|---|---|---|---|
| `save_deposit` | If `inputCoinFromStep` set → use `priorOutputs.get(idx)` instead of `selectAndSplitCoin`. Skip the size-check in chained mode (the prior step's output is whatever it is; deposit takes it as-is). | ~15 | Low — fee hook still fires identically. |
| `repay_debt` | Same shape as save_deposit. Chained input is treated as the repay coin; the existing `selectAndSplitCoin` size logic gets bypassed. | ~15 | Low — repay supports partial coin already. |
| `send_transfer` | If `inputCoinFromStep` set → use chained coin as the send object. Skip the size-check (chained coin has its own amount, derived from the producing step). | ~20 | Medium — the `amount` field on `SendTransferInput` becomes documentation-only when chained. Validate at preflight that chained-mode steps don't claim a specific amount. |
| `swap_execute` | (a) If `inputCoinFromStep` set → pass chained coin as `inputCoin` to `addSwapToTx` (need to extend `addSwapToTx` signature). (b) If THIS step's output is chained to a later step, omit the `tx.transferObjects([result.coin], ctx.sender)` and instead store `result.coin` in `priorOutputs.set(thisIdx, result.coin)`. | ~25 | Medium — `addSwapToTx` doesn't currently accept an input coin (Cetus aggregator wants raw amount). The Cetus SDK does support it via `getInputCoinForSwapByAmountIn`; we wire that through. |
| `withdraw` | Output is always produced. If a later step consumes it (`graph.usedAsInput.has(thisIdx)`), omit the `tx.transferObjects([coin], ctx.sender)` and store in `priorOutputs`. | ~10 | Low — withdraw output handoff is the simplest case. |
| `borrow` | Same shape as withdraw — output is produced; if chained, store instead of transfer. Fee hook still fires before the transfer/store decision. | ~10 | Low. |

### `composeTx` orchestrator

The walker becomes graph-aware:

```ts
export async function composeTx(opts: ComposeTxOptions): Promise<ComposeTxResult> {
  // 1. Validate the step graph BEFORE building the PTB.
  validateStepGraph(opts.steps); // throws T2000Error('CHAIN_INVALID', ...) on mismatch

  // 2. Compute which step outputs are consumed downstream (so producers
  //    know whether to transfer-to-user or store-for-chaining).
  const consumedByDownstream = computeConsumedSet(opts.steps);

  const tx = new Transaction();
  tx.setSender(opts.sender);
  const priorOutputs = new Map<number, TransactionObjectArgument>();

  const ctx: AppenderContext = { ...existing..., priorOutputs };

  const previews: StepPreview[] = [];
  for (const [idx, step] of opts.steps.entries()) {
    const appender = WRITE_APPENDER_REGISTRY[step.toolName];
    const stepCtx = {
      ...ctx,
      thisStepIdx: idx,
      isOutputChained: consumedByDownstream.has(idx),
    };
    const preview = await appender(tx, step, stepCtx);
    previews.push(preview);
  }

  // 3. Build + derive allowed addresses (unchanged).
  const txKindBytes = await tx.build({ client: opts.client, onlyTransactionKind: true });
  const derivedAllowedAddresses = deriveAllowedAddressesFromPtb(tx);
  return { tx, txKindBytes, derivedAllowedAddresses, perStepPreviews: previews };
}
```

`validateStepGraph` is the single source of truth for "is this composition valid":

```ts
function validateStepGraph(steps: WriteStep[]): void {
  for (const [idx, step] of steps.entries()) {
    const inputFromStep = (step as { inputCoinFromStep?: number }).inputCoinFromStep;
    if (inputFromStep === undefined) continue;

    // Must reference a prior step.
    if (inputFromStep >= idx || inputFromStep < 0) {
      throw new T2000Error('CHAIN_INVALID',
        `Step ${idx} references step ${inputFromStep}, which is not upstream.`);
    }

    // Producer's output asset must match consumer's input contract.
    const producer = steps[inputFromStep];
    const producerSpec = APPENDER_COIN_SPEC[producer.toolName];
    const consumerSpec = APPENDER_COIN_SPEC[step.toolName];

    const produced = resolveCoinAsset(producerSpec.produces[0], producer);
    const consumes = consumerSpec.consumes.map((c) => resolveCoinAsset(c, step));

    if (!consumes.includes(produced)) {
      throw new T2000Error('CHAIN_INVALID',
        `Step ${idx} (${step.toolName}) consumes [${consumes.join('|')}] but ` +
        `step ${inputFromStep} (${producer.toolName}) produces ${produced}.`);
    }

    // Pair must be on the whitelist (Phase 1-2 only; Phase 5 raises this).
    if (!VALID_PAIRS.has(`${producer.toolName}->${step.toolName}`)) {
      throw new T2000Error('CHAIN_INVALID',
        `Pair ${producer.toolName}->${step.toolName} is not in the chaining whitelist. ` +
        `Available pairs: ${[...VALID_PAIRS].join(', ')}`);
    }
  }
}
```

---

## Phase 1 pair registry (the v1 whitelist)

These 7 pairs cover every Audric multi-write flow we actually need. Each pair has an integration test that drives a real PTB to mainnet (in a forked test environment).

| # | Pair | Producer output → Consumer input | Demo flow |
|---|---|---|---|
| 1 | `swap_execute → send_transfer` | swap.to coin → transfer recipient | "Swap $100 USDC → SUI, send to friend" |
| 2 | `swap_execute → save_deposit` | swap.to (must be USDC/USDsui) → deposit | "Swap to USDsui and save" — Demo 1 leg |
| 3 | `swap_execute → repay_debt` | swap.to (must be USDC/USDsui) → repay | "Swap idle SUI to USDC and pay off card" |
| 4 | `withdraw → swap_execute` | USDC/USDsui coin → swap.from | "Withdraw and swap to SUI" |
| 5 | `withdraw → send_transfer` | USDC/USDsui coin → transfer | "Withdraw and send to friend" |
| 6 | `borrow → send_transfer` | borrowed coin → transfer | "Borrow $100 and pay rent" |
| 7 | `borrow → repay_debt` (same asset) | borrowed coin → repay | "Roll a USDC position to USDsui" — unusual but valid |

`VALID_PAIRS` is exported from `composeTx-graph.ts`:

```ts
export const VALID_PAIRS: ReadonlySet<string> = new Set([
  'swap_execute->send_transfer',
  'swap_execute->save_deposit',
  'swap_execute->repay_debt',
  'withdraw->swap_execute',
  'withdraw->send_transfer',
  'borrow->send_transfer',
  'borrow->repay_debt',
]);
```

**Engine integration.** `compose-bundle.ts` consumes `VALID_PAIRS` to validate before yielding pending_action. Mismatched bundles get synthesized `_gate: 'pair_not_whitelisted'` tool_results so the LLM re-plans. The host's `composeTx` re-validates as a defense-in-depth (caller bug catches).

---

## Phase 2 — 3-op chains (composition rule)

A 3-op bundle is valid iff every adjacent pair (steps 0→1, 1→2) is in `VALID_PAIRS`. **No new pairs need adding** — composition is by enumeration of valid 2-tuples.

Examples that work in Phase 2:

| 3-op flow | Adjacent pairs |
|---|---|
| `swap → swap → save` | swap→swap (NOT in whitelist) ❌ — splits |
| `withdraw → swap → send` | withdraw→swap ✓, swap→send ✓ — works |
| `borrow → swap → send` | borrow→swap (NOT in whitelist) ❌ — splits |
| `withdraw → swap → save` | withdraw→swap ✓, swap→save ✓ — works |
| `borrow → repay → send` | borrow→repay ✓, repay→send (NOT — repay produces nothing) ❌ |

Phase 2 may add pairs to enable specific user flows we observe (e.g. `swap→swap` if portfolio rebalancing is a frequent ask). Each new pair = 1 integration test + a registry line.

---

## Phase 3 — Demo 1 (the headline DeFi flow)

> *"Swap 10% into SUI, save 50% of my remaining USDC, then send $100 to Mom."*

This is a 4-op flow:

```
step 0: swap_execute(USDC → SUI, 200)         // 10% of $2000 portfolio
step 1: swap_execute(USDC → USDsui, 900)      // 50% of remaining $1800
step 2: save_deposit(USDsui, fromStep=1)      // chained from step 1
step 3: send_transfer(USDC, 100, "Mom")
```

Adjacent pairs: `swap→swap` (NEW, needs whitelist), `swap→save` ✓, `save→send` ❌ (save produces nothing — but that's fine because step 3 takes a fresh wallet coin via wallet-mode, no chaining needed at step 2→3).

**The graph is a DAG, not a strict chain.** Step 3 has no `inputCoinFromStep` — it pulls from the wallet. Step 2's `inputCoinFromStep: 1`. Step 0 stands alone (output transferred to user). The validator must:

1. Accept "no chaining" between adjacent steps (each just runs in wallet-mode).
2. Reject only when an explicit `inputCoinFromStep` is invalid.
3. The pair-whitelist check applies only to step pairs that have a chaining relationship (i.e., `step[i+1].inputCoinFromStep === i`).

Phase 3 deliverables:
1. Add `swap_execute → swap_execute` to `VALID_PAIRS` (with integration test).
2. Update `validateStepGraph` to support DAG topology (only checks declared chains, not all adjacent pairs).
3. End-to-end test that builds + executes Demo 1 against a forked mainnet.
4. Raise `MAX_BUNDLE_OPS` from 2 → 4 once Phase 3 lands.

---

## Phase 4 — Commerce composition (`split_coin` + `pay_api`)

> *"Buy everything for my house party — balloons, fairy lights, cake, banner. Budget $120."*

This is a different shape from DeFi: instead of a linear chain, one input coin splits into N parallel consumers.

```
step 0: split_coin(USDC, 119, [20, 33, 55, 11])   // produces 4 coins
step 1: pay_api(party_city, 20, fromStep=0, share=0)
step 2: pay_api(amazon, 33, fromStep=0, share=1)
step 3: pay_api(cakeboss, 55, fromStep=0, share=2)
step 4: pay_api(walmart, 11, fromStep=0, share=3)
```

Phase 4 work:
1. **New `split_coin` step type.** Pure utility — takes one wallet coin, splits into N. Produces N coins.
2. **`pay_api` MPP integration.** Today `pay_api` is excluded from `composeTx` because the recipient/amount is determined by a gateway 402 challenge. Phase 4 adds an "MPP-pre-resolved" path: the LLM's `pay_api` tool runs the read-side gateway dance ahead of bundle composition, then the bundle's `pay_api` step is purely the on-chain transfer. This means the gateway handshake (deliver-first, audit trail, spending limits) happens BEFORE bundle composition; the PTB step is just the USDC transfer.
3. **Multi-share `inputCoinFromStep`.** Extend the field to `inputCoinFromStep: { step: number; share: number }` to disambiguate which output of the split is consumed.
4. **End-to-end test** with 4 mock MPP services on a test gateway.

Phase 4 unblocks the commerce demo. Estimated 2-3 weeks because `pay_api`'s pre-resolved path is real engineering.

---

## Phase 5 — Arbitrary composition (the end state)

Once the registry covers everything useful (DeFi pairs from Phase 1-3 + `split_coin` and `pay_api` from Phase 4 + any additions observed in production), `MAX_BUNDLE_OPS` raises to whatever the eval corpus needs (likely 8-10). The validator still enforces:
- Every chain reference is to a valid producer.
- Every chained pair is in `VALID_PAIRS`.
- The DAG has no cycles (validator catches `inputCoinFromStep: i` with `i >= self.idx`).

At Phase 5, "atomic 4-op DeFi compound flow" and "atomic 4-vendor commerce cart" are first-class user capabilities. The only flows that DON'T bundle are ones whose chained pairs aren't (yet) on the whitelist — and the LLM splits those automatically.

---

## Test plan

### Unit tests (per phase)

- `composeTx-graph.test.ts` — `validateStepGraph` for every valid + invalid topology.
- `composeTx.test.ts` — extend with chained-mode test cases (mock-RPC, no on-chain).
- Per-builder tests — each modified appender gets `inputCoinFromStep` test cases.

### Integration tests (per phase)

- Mainnet-fork test environment (Sui local validator with mainnet snapshot).
- One test per pair in `VALID_PAIRS` — drives a real PTB and asserts on-chain effects.
- Demo 1 end-to-end (Phase 3 acceptance gate).
- Demo 2 end-to-end (Phase 4 acceptance gate).

### Production canary (per phase)

- After each phase ships, the engine emits `audric.harness.bundle_chain_outcome` telemetry per pair, with success/error split.
- 48-hour soak window before raising `MAX_BUNDLE_OPS` (mirroring the SPEC 7 P2.7 ramp pattern).

---

## Rollout schedule (proposed)

| Phase | Scope | Timeline | Engine ver | SDK ver | Audric flag |
|---|---|---|---|---|---|
| **0** | 2-op cap + pair whitelist + instrumentation | This week (May 5-9) | 1.12.0 | 1.12.0 | none (strict tightening) |
| **1** | Chaining foundation: 7 pairs, validator, builder migrations | Week of May 12 | 1.13.0 | 1.13.0 | `NEXT_PUBLIC_PTB_CHAINING_V1` |
| **2** | 3-op composition (no new pairs, just the validator extension) | Week of May 19 | 1.14.0 | 1.14.0 | flag flip |
| **3** | Demo 1 acceptance: `swap→swap` pair + 4-op cap | Week of May 26 | 1.15.0 | 1.15.0 | flag flip |
| **4** | Commerce: `split_coin`, `pay_api` MPP-pre-resolved, multi-share chaining | June 2-13 | 1.16.0 | 1.16.0 | `NEXT_PUBLIC_PTB_COMMERCE_V1` |
| **5** | Raise cap, monitor production, expand whitelist by demand | Mid-June | 1.17.0 | — | flag flip |

Each phase ships behind a flag, soaks 24-48h, flag flips, next phase begins.

---

## Open questions

1. **Should `swap_execute` be allowed to chain to ANOTHER `swap_execute`'s INPUT?** I.e., `swap.from = prev swap.to`. This is what Demo 1 does. Phase 3 adds the pair but it's worth confirming there's no Cetus-side limitation before committing.
2. **Sui PTB instruction budget at Phase 4.** A 4-op `split_coin + pay_api×N` consumes maybe 50-80 instructions. The PTB cap is ~1024, so we're nowhere near it. But each MPP integration could compound. Add a `instructionCount` estimator to validator output as Phase 4 work.
3. **Failure semantics.** If a 4-op atomic bundle reverts, the user sees one error message. Today the engine narrates which step failed. Verify that on-chain revert info gets back to the engine cleanly via `tool_result` + that the LLM narrates "step 3 failed because X" specifically. May need `stepResults[]` shape extension.
4. **Engine telemetry shape.** `audric.harness.bundle_chain_outcome{pair_name, outcome}` — confirm with @gradle-app or whoever owns the dashboard before shipping, so existing Phase-0 metrics don't get clobbered.
5. **Audric host changes.** `/api/transactions/prepare` already calls `composeTx({ steps })`. Does the chaining extension change any host-side code? Probably yes for the receipt narration ("step 3 of 5 swapped 5 USDC for 4.99 USDsui, which fed step 4's deposit"). Defer to Phase 1 implementation review.

---

## Cross-references

- **Layer 0 / Layer 1 architecture** → `spec/SPEC_7_MULTI_WRITE_PTB.md`
- **Current bundle composition** → `packages/engine/src/compose-bundle.ts`
- **Canonical write entry-point** → `packages/sdk/src/composeTx.ts` (note JSDoc lines 50-53 anticipate this exact extension)
- **Per-tool builder code** → `packages/sdk/src/protocols/{navi,cetus-swap,volo}.ts`
- **Engine harness specs** → `AUDRIC_HARNESS_CORRECTNESS_SPEC_v1.3.md`, `AUDRIC_HARNESS_INTELLIGENCE_SPEC_v1.4.1.md`
- **Why Phase 0 first** → `audric-build-tracker.md` S.53.7 (F14-fix-2 + MAX_BUNDLE_OPS=5) + the May 3 production review
- **Streaming instrumentation rationale** → `RUNBOOK_spec7_p27_ramp.md` Phase 0 entry
