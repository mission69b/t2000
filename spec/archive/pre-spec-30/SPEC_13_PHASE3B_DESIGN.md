# SPEC 13 Phase 3b — Design (`swap_execute → swap_execute` whitelist for multi-hop swap chains)

**Date:** 2026-05-04
**Status:** v0.1 — design draft. Soak-gated on Phase 3a. Implementation deferred until Phase 3a hits soak gate (≥10 4-op DAG dispatches with zero validator-side skips) AND product confirms multi-hop swap intent is real demand.
**Local-only — gitignored** (per `audric-roadmap.md` policy).

---

## TL;DR

Phase 3b adds `swap_execute → swap_execute` to `VALID_PAIRS`, enabling explicit multi-hop swap chains inside one PTB (e.g. *"swap USDC to SUI then SUI to USDsui"* → one signature, both swaps atomic, output of first feeds input of second).

**Engine-side change is a one-liner in `compose-bundle.ts`.** All inference helpers (`inferProducerOutputAsset`, `inferConsumerInputAsset`, `shouldChainCoin`) already handle `swap_execute` symmetrically — Phase 3a's DAG validator + asset-alignment auto-detection just need that one pair entry to admit the new shape.

**The interesting work is on the UX side:**

1. **Compound slippage warning.** Two chained swaps stack price impact. The plan card needs to surface compound impact (~1.5–2× a single swap), not just per-step impact, so users tap-to-confirm with the right expectation.
2. **System prompt nudge against unnecessary decomposition.** Cetus aggregator already does multi-hop routing internally — if the user says *"swap USDC to USDsui"* and the optimal route happens to go through SUI, Cetus handles that as one swap_execute. The LLM should NOT decompose `A→C` into `A→B→C` unless the user explicitly says so. Two `swap_execute` steps means the user wanted the intermediate state OR the user explicitly asked for the route.
3. **Feature-flag rollout.** `NEXT_PUBLIC_PTB_SWAP_CHAIN_V1` (audric env). Default false. Flip after a 24-48h dev-mode smoke + zero-revert soak.

**Ship target:** engine `1.16.0` (minor — adds a new bundle shape) + audric env flag toggle. Estimated effort: ~0.75 day total (matches the parent design's ~0.75d estimate).

**Why deferred from 3a's `1.15.0` ship:** Different risk profile. Phase 3a was pure validator relaxation — every bundle that worked before still works. Phase 3b admits a new chain shape with new UX considerations (slippage compounding) that 3a's single-swap leg flows didn't have to contend with.

---

## Use case grounding — when does a user actually want chained swaps?

This is the most important question for Phase 3b. If the answer is *"rarely / never"*, we shouldn't ship it at all. Three categories:

### 1. User explicitly specifies the route (≈ 70% of expected demand)

> *"Swap 10 USDC to SUI, then swap that SUI to USDsui"*

The user wants the intermediate state visible OR is reasoning step-by-step. This is the canonical Phase 3b unlock — both swaps execute in one signature, the user sees both card rows pre-confirm, and the second swap's input is exactly what the first produced (no wallet round-trip).

### 2. User wants atomic multi-asset rebalance (≈ 20% of expected demand)

> *"Swap half my SUI to USDsui and half to USDC"*

This is **not** a chained swap — it's two parallel swap_execute calls (Phase 3a 4-op shape, no chain between them). Already covered by today's DAG validator. Phase 3b doesn't apply.

### 3. LLM auto-decomposes a single-asset swap (≈ 10% of expected demand — and we want to PREVENT this)

> *"Swap USDC to USDsui"* → LLM emits `swap_execute(USDC → SUI)` then `swap_execute(SUI → USDsui)` because it thinks chaining is "more efficient"

**This is bad behavior.** Cetus aggregator already does multi-hop routing internally and finds the lowest-impact route. Forcing two swap_execute steps doubles the slippage budget and adds two router fee legs without any benefit. The system prompt MUST steer against this.

### Revealed preference

Phase 3b should ship **only if the LLM correctly distinguishes case 1 from case 3 most of the time.** If we can't reliably get the LLM to prefer single-hop Cetus routing for case 3, Phase 3b is a footgun, not a feature. This is the open question the soak (and a small eval-corpus pass) needs to answer before flag-flip.

---

## What changes (file-level)

### Engine (`packages/engine/src/compose-bundle.ts`)

```ts
// One-line addition to VALID_PAIRS:
export const VALID_PAIRS: ReadonlySet<string> = new Set([
  'swap_execute->send_transfer',
  'swap_execute->save_deposit',
  'swap_execute->repay_debt',
  'swap_execute->swap_execute',  // NEW (Phase 3b)
  'withdraw->swap_execute',
  'withdraw->send_transfer',
  'borrow->send_transfer',
  'borrow->repay_debt',
]);
```

`inferProducerOutputAsset('swap_execute', ...)` already returns `input.to`. `inferConsumerInputAsset('swap_execute', ...)` already returns `input.from`. `shouldChainCoin` resolves `producer.input.to === consumer.input.from` — the asset-alignment gate works without modification.

### Engine (`packages/engine/src/__tests__/compose-bundle.test.ts`)

New test cases (gated on the new pair):

1. **3b happy path:** 2-op `swap_execute(USDC → SUI) → swap_execute(SUI → USDsui)`. Asserts `shouldChainCoin` returns true. Asserts `engine.bundle_chain_mode_set` fires once with `{producer: swap_execute, consumer: swap_execute}`.
2. **3b asset misalignment:** 2-op `swap_execute(USDC → SUI) → swap_execute(USDC → USDsui)` (LLM forgot to align). Asserts `shouldChainCoin` returns false. Bundle still composes (wallet-mode for second swap), but the second swap will pull fresh USDC from the wallet — which is technically what the LLM asked for, but the test surfaces this as a regression-watch shape.
3. **3b 3-op chain:** `swap_execute(USDC → SUI) → swap_execute(SUI → USDsui) → save_deposit(USDsui)`. Asserts both pairs whitelisted, both chains wired. `bundle_chain_mode_set` fires twice.
4. **3b cap=4 with two swap pairs:** `swap_execute(A → B) → swap_execute(B → C) → swap_execute(C → D) → save_deposit(D)`. Asserts cap=4 admits, three chains wire. (Edge case — probably never seen in production but worth a test.)

### Audric (`audric/apps/web/lib/engine/prepare-bundle-tool.ts`)

This is the load-bearing change for the rollout:

```ts
// Today (Phase 3a):
const VALID_PAIRS = new Set<string>([
  'swap_execute->send_transfer',
  'swap_execute->save_deposit',
  'swap_execute->repay_debt',
  'withdraw->swap_execute',
  'withdraw->send_transfer',
  'borrow->send_transfer',
  'borrow->repay_debt',
]);

// Phase 3b — flag-gated:
const VALID_PAIRS = new Set<string>([
  'swap_execute->send_transfer',
  'swap_execute->save_deposit',
  'swap_execute->repay_debt',
  'withdraw->swap_execute',
  'withdraw->send_transfer',
  'borrow->send_transfer',
  'borrow->repay_debt',
  ...(env.NEXT_PUBLIC_PTB_SWAP_CHAIN_V1 ? ['swap_execute->swap_execute'] : []),
]);
```

When the flag is OFF, the audric LLM gets `pair_not_whitelisted` if it tries swap→swap and falls back to splitting (sequential) or recomposing as a single-hop swap. When the flag is ON, the LLM can bundle two chained swaps as one PTB.

### Audric (`audric/apps/web/lib/env.ts`)

Add to client schema (it's `NEXT_PUBLIC_*` so it's safe to be on the client):

```ts
const clientSchema = z.object({
  // ... existing ...
  NEXT_PUBLIC_PTB_SWAP_CHAIN_V1: z
    .enum(['true', 'false'])
    .optional()
    .default('false')
    .transform((v) => v === 'true'),
});
```

Per `env-validation-gate.mdc` — every new env var goes through the Zod gate. Default false ensures preview deploys + local builds get the safe behavior unless explicitly opted in.

### Audric (`audric/apps/web/lib/engine/engine-context.ts`)

Two prompt rules to add (both load-bearing):

#### Rule A — single-hop preferred

```
**Single-hop preferred for cross-asset swaps.** Cetus aggregator
finds the best route across 20+ DEXs internally. If the user says
"swap USDC to USDsui" — even if you know there's no direct pool —
emit ONE `swap_execute(USDC → USDsui)` and let Cetus handle the
intermediate hops. Two `swap_execute` steps must only be used when
the user explicitly asks for the intermediate route ("swap to SUI
first, then to USDsui") OR wants to see the intermediate state.
Forcing a two-hop decomposition compounds slippage and gives the
user a worse fill.
```

#### Rule B — compound slippage warning

```
**Chained swap warning (when emitting two swap_execute steps that
chain via inputCoinFromStep):** Add a one-line note to the plan
turn before the prepare_bundle call: "Heads up — chained swaps
compound price impact (~2× a single swap)." Do NOT add this when
both swaps are independent (no chain). Only the chain case stacks
slippage.
```

Token budget impact: ~140 chars for Rule A, ~100 chars for Rule B = ~60 tokens. Current ceiling is 10,250 (post-2a tracker). Phase 3a sits at 10,131. **Phase 3b lands at ~10,191 — well within budget. No ceiling bump required.**

### Audric (`audric/apps/web/lib/engine/__tests__/prepare-bundle-tool.test.ts`)

Mirror engine tests + flag-gated tests:

1. **Flag OFF — swap→swap rejected:** With `NEXT_PUBLIC_PTB_SWAP_CHAIN_V1=false`, a 2-op `swap → swap` bundle returns `_gate: pair_not_whitelisted`.
2. **Flag ON — swap→swap accepted:** Same input, flag flipped, bundle composes.
3. **Flag ON — asset misalignment passes through:** swap→swap with mismatched `to`/`from` composes but doesn't auto-chain (wallet-mode). Same shape as engine test #2.

### `spec/SPEC_8_CORPUS.md`

Add P0-11 (already shape-defined in Phase 3 design doc):

| ID | Prompt | Phase | Expected | Acceptance |
|---|---|---|---|---|
| P0-11 | `swap 5 USDC to SUI then swap 4 SUI to USDsui` | 3b | 2-op multi-hop. Both swaps. Step 1 chains from step 0. Pair = swap_execute → swap_execute (3b whitelisted). Asset alignment: producer.to=SUI ↔ consumer.from=SUI ✓. One PermissionCard, one signature, one PTB. | `engine.turn_outcome` = `pending_action_bundle` (n=2). `engine.bundle_chain_mode_set` fires once with `{producer: swap_execute, consumer: swap_execute}`. **Plan turn assistant text contains the compound-slippage warning string.** |

Add P0-12 (single-hop discipline check — the case-3 negative test):

| ID | Prompt | Phase | Expected | Acceptance |
|---|---|---|---|---|
| P0-12 | `swap 5 USDC to USDsui` | 3b | **1-op single swap.** LLM does NOT decompose into `USDC → SUI → USDsui` — it emits one `swap_execute(USDC → USDsui)` and trusts Cetus's router. | `engine.turn_outcome` = `pending_action_single` (n=1). No `prepare_bundle` call. **No `bundle_chain_mode_set` events.** |

P0-12 is the eval that locks the LLM behavior in case-3 (auto-decomposition prevention). If P0-12 fails (LLM decomposes anyway), Phase 3b is shipped under a regression — the single-hop preferred rule isn't load-bearing enough.

---

## Locked decisions

| # | Question | Decision | Why |
|---|---|---|---|
| 1 | Ship 3b as part of 3a or separately? | **Separately** (engine `1.16.0`). | Already locked in parent doc. Different risk profile + UX surface (slippage compounding). |
| 2 | Feature flag mechanics? | **`NEXT_PUBLIC_PTB_SWAP_CHAIN_V1`** boolean env, default false. Engine ALWAYS exports swap→swap in `VALID_PAIRS`; Audric's `prepare-bundle-tool.ts` conditionally includes it based on flag. | Engine doesn't have env access (per CLAUDE.md). Flag-gating is purely host-side. Non-Audric consumers (CLI, MCP) get the new pair always — fine because they don't have the same UX concerns and CLI users self-select for "I know what I'm doing." |
| 3 | Where does the compound-slippage warning live? | **System prompt instruction (LLM emits warning text)** — not a UI card affordance. | Cheaper than building a separate compound-slippage UI lane. Skill-recipe-style nudge. The plan card already renders LLM text above the step list; the warning lives there. |
| 4 | Should the slippage warning be a guard (block) or a hint (allow)? | **Hint.** The user explicitly asked for chained swaps; we surface the cost without blocking. | If the user said "swap to SUI then SUI to USDsui," they accepted the route. Blocking them would be paternalistic. Block is reserved for guards that prevent LOSS, not user-acknowledged tradeoffs. |
| 5 | Single-hop discipline rule strength? | **System prompt rule + corpus eval (P0-12).** No engine-side guard. | Engine doesn't know whether two adjacent `swap_execute` calls were "user wanted intermediate" or "LLM over-decomposed." The LLM is the authority on intent. P0-12 is the regression catch. |
| 6 | Asset-misalignment behavior? | **Compose, don't chain.** Same as today's Phase 3a behavior — `shouldChainCoin` returns false when assets misalign, the bundle composes in wallet-mode, and the second swap pulls fresh wallet coins. | Consistent with the existing pattern. Adding a hard block here for swap→swap specifically would be inconsistent with how every other pair behaves. The LLM learns from the (cosmetic) divergence. |
| 7 | Soak gate to flip the flag? | **5+ swap→swap dispatches with zero `bundle_outcome_count outcome=reverted` AND zero `compose_error` AND P0-12 passes manually.** | Lower bar than Phase 3a's 10-event gate because the surface is smaller (one new pair, no validator change). The P0-12 manual eval is the load-bearing safety check — it confirms the LLM doesn't auto-decompose. |
| 8 | Should we add `slippage` field aggregation to plan card? | **No, defer to Phase 3c if needed.** | Compound impact is approximate (depends on actual fills); a precise number requires re-quoting both legs and multiplying. The text warning ("~2× a single swap") is honest about being approximate. A precise UI label would be over-engineering for a low-frequency use case. |

---

## Risks

### R1 — LLM auto-decomposes single-hop swaps (case 3 above)

**Probability:** Medium-high if the system prompt rule is weak.
**Impact:** User pays compound slippage on a swap they didn't intend to chain.

**Mitigation:**
1. Single-hop preferred rule (Rule A above) added to system prompt.
2. P0-12 corpus eval explicitly tests this case.
3. Telemetry: `audric.bundle.swap_chain_dispatched` counter (new, sub-counter under existing fast_path_dispatched). If this fires on prompts where the user said *"swap A to B"* without saying *"then to C"*, that's a regression to investigate.

If P0-12 fails post-implementation: revert the flag flip, strengthen the prompt rule, re-eval. Don't ship 3b broadly until P0-12 passes consistently.

### R2 — Slippage warning text gets lost in plan card rendering

The plan card renders LLM text in a specific way. If the warning is appended after the step list (or in markdown formatting that our renderer drops — see the M3 markdown-table issue from May 3), users miss it.

**Mitigation:**
- Test the warning text rendering in dev console before flag-flip
- Position rule: warning goes BEFORE the step list (renders as a paragraph above the cards), not after
- Pre-flag-flip checklist: paste a swap→swap response into the dev UI, screenshot the rendered card, confirm warning is visually prominent

### R3 — Cetus router instruction-count compounding

Two chained swaps could emit 30+ instructions (Cetus router uses 5–15 per swap depending on routing complexity). PTB cap is ~1024, so we're fine in absolute terms.

**Mitigation:** Add `instructionCount` to SDK's `composeTx` preview return as **Phase 3b prerequisite** (~5 LOC). Telemetry: `audric.harness.bundle_instruction_count{step_count, has_swap_chain}` histogram. Post-soak, we get real numbers for cap-3b multi-hop bundles.

This is also useful for Phase 3a — would let us early-warn if any 4-op DAG bundle approaches the cap. **Recommend instrumenting it as part of Phase 3b's prerequisite work.**

### R4 — Flag-flip rollback complexity

If the flag gets flipped to ON in prod and we discover P0-12 regressions only after, we have two rollback paths:

1. **Fast:** flip flag back to OFF in Vercel env. Audric redeploys (1-2 min). Engine still exports swap→swap in `VALID_PAIRS` but Audric's prepare-bundle-tool stops including it.
2. **Slow:** revert the engine's `VALID_PAIRS` add and ship a `1.16.1` patch. Only needed if non-Audric consumers (CLI, MCP) are misbehaving.

**Mitigation:** Path 1 is the default rollback. Path 2 only triggers if a CLI bug surfaces. Document both paths in the post-3b Vercel runbook.

### R5 — Asset alignment edge case: same-asset chain

What if the LLM emits `swap_execute(USDC → SUI) → swap_execute(SUI → SUI)`? `shouldChainCoin` returns true (assets align), the chain wires, and the SDK builds a swap step with from=SUI to=SUI which is a preflight rejection in `swap.ts`:

```ts
preflight: (input) => {
  if (input.from.toLowerCase() === input.to.toLowerCase()) {
    return { valid: false, error: `Cannot swap ${input.from} to itself.` };
  }
}
```

So the engine rejects at preflight before composing. **No new bug.** Worth a test that confirms preflight catches this in the bundle context (not just single-step).

---

## File plan

| File | Change | LOC | Risk |
|---|---|---|---|
| `packages/engine/src/compose-bundle.ts` | One-line `VALID_PAIRS` addition | 1 | Trivial |
| `packages/engine/src/__tests__/compose-bundle.test.ts` | 4 new test cases (3b shapes) | ~80 | Low |
| `packages/engine/src/__tests__/engine-bundle.test.ts` | 1 new test: 2-op swap→swap dispatches as fast-path bundle | ~30 | Low |
| `packages/sdk/src/composeTx.ts` | Add `instructionCount` to preview return (R3 prerequisite) | ~10 | Low |
| `packages/sdk/src/__tests__/composeTx.test.ts` | Test instructionCount populated | ~20 | Low |
| `audric/apps/web/lib/env.ts` | New `NEXT_PUBLIC_PTB_SWAP_CHAIN_V1` env var, Zod-gated | ~10 | Low |
| `audric/apps/web/lib/engine/prepare-bundle-tool.ts` | Conditional VALID_PAIRS include based on env flag | ~5 | Low |
| `audric/apps/web/lib/engine/engine-context.ts` | 2 new prompt rules (single-hop preferred + chained swap warning) | ~15 | Low (token budget check, 10,191 / 10,250) |
| `audric/apps/web/lib/engine/__tests__/prepare-bundle-tool.test.ts` | Flag-on/off swap→swap behavior | ~50 | Low |
| `audric/apps/web/lib/engine/spec-consistency.ts` | New assertion: when flag is true, audric VALID_PAIRS includes swap→swap | ~10 | Low |
| `audric/apps/web/lib/engine/spec-consistency.test.ts` | Bump assertion count 16 → 17 | ~3 | Trivial |
| `spec/SPEC_8_CORPUS.md` | Add P0-11 (multi-hop happy path) + P0-12 (single-hop discipline) | ~20 | — |
| `spec/SPEC_13_PTB_CHAINING_FOUNDATION.md` | v0.5 entry — Phase 3b shipped, instruction-count instrumentation added, flag flipped | ~20 | — |

**Total Phase 3b:** ~270 LOC + tests, single coordinated engine release + audric bump + flag flip. Effort: ~0.75 day.

The estimate is comparable to Phase 3a (~1.5 day) because, although the code surface is smaller, the prompt-rule evaluation + manual P0-12 verification before flag-flip adds discrete time.

---

## Day-by-day

**Day 1 — Engine + SDK:**
- Branch `feat/spec13-phase3b-swap-chain`.
- Engine `compose-bundle.ts` whitelist add + 4 new tests.
- SDK `composeTx.ts` instructionCount add + tests.
- `pnpm test + typecheck + lint` clean.
- Engine release workflow `--field bump=minor` → `1.16.0`.

**Day 2 — Audric (flag OFF):**
- Bump `@t2000/{sdk,engine}@1.16.0` in audric.
- Add env var to `lib/env.ts` schema (default false).
- Conditional whitelist add in `prepare-bundle-tool.ts`.
- New prompt rules in `engine-context.ts` (token budget verification step).
- Tests + spec-consistency assertion.
- Push to main with flag OFF — production behavior unchanged.

**Day 3 — Pre-flip smoke (flag-flipped in DEV):**
- Set `NEXT_PUBLIC_PTB_SWAP_CHAIN_V1=true` in DEV env only (preview deploy or local).
- Manual P0-11: *"swap 5 USDC to SUI then 4 SUI to USDsui"* — verify bundle, signature, on-chain settlement.
- Manual P0-12: *"swap 5 USDC to USDsui"* — verify single swap_execute, no decomposition.
- Manual misalignment: *"swap USDC to SUI then USDC to USDsui"* — verify wallet-mode for second leg, no chain.
- Manual same-asset rejection: *"swap USDC to SUI then SUI to SUI"* — verify preflight catches.
- Verify rendered slippage warning text in plan card UI.

**Day 4 — Prod flag flip (if all smokes pass):**
- Set `NEXT_PUBLIC_PTB_SWAP_CHAIN_V1=true` in production env.
- Vercel auto-deploys with flag ON.
- Real-user organic traffic exercises P0-11 and P0-12 patterns.
- Soak: ≥5 fast-path dispatches with `pairs=swap_execute->swap_execute` and zero reverts/compose_errors.
- If P0-12 regresses (LLM auto-decomposes single-asset swaps): flip flag back to OFF, strengthen prompt rule, retry.

**Total wall-clock:** 4 days with the gate between Day 3 and Day 4. The wall-clock is longer than the engineering effort (0.75d) because the smoke verification window before flag-flip is the load-bearing safety mechanism.

---

## Implementation guardrails (locked from this design)

These hold true after Phase 3b ships, in tightening order:

1. **Strict-relaxation for non-flagged consumers.** Engine `1.16.0` exports swap→swap in `VALID_PAIRS` but non-Audric consumers (CLI, MCP, future hosts) inherit the change always. They don't have the env flag. **Test:** the engine test suite must prove a CLI/MCP-style call to `composeTx` with a swap→swap pair composes correctly without any audric dependencies.
2. **Audric default is OFF.** Until Day 3 smoke + Day 4 flag-flip, audric production behavior is unchanged. Verifies via `audric/apps/web/lib/__tests__/env-flag-defaults.test.ts` (or add one if missing).
3. **Single-hop discipline.** P0-12 corpus eval passes BEFORE prod flag-flip. If it fails, no flag flip. Document the failure mode and reattempt with a stronger prompt rule.
4. **Compound slippage warning emits on every chained swap pair.** Add to `spec-consistency.ts` an assertion that the prompt rule strings exist verbatim. If a future prompt edit removes the warning rule, spec-consistency catches it before deploy.
5. **Telemetry.** `audric.bundle.swap_chain_dispatched` counter fires on every swap→swap fast-path dispatch (mirrors `bundle.fast_path_dispatched` shape but specific to this pair). Used to estimate post-soak adoption + drift signals.
6. **Token budget.** Total system prompt remains ≤10,250 (current ceiling). Phase 3b's two new rules bring it to ~10,191 — comfortably under. No ceiling bump required.

---

## Cross-references

- Parent → `spec/SPEC_13_PHASE3_DESIGN.md` (locked Phase 3a + 3b strategy)
- Foundation → `spec/SPEC_13_PTB_CHAINING_FOUNDATION.md` (v0.4 — Phase 3a shipped)
- Eval corpus → `spec/SPEC_8_CORPUS.md` (P0-11 and P0-12 to be added)
- Env-validation gate → `.cursor/rules/env-validation-gate.mdc` (mandatory pattern for new env vars)
- Bundle dispatch fast path → `spec/SPEC_14_PREPARE_BUNDLE_PLAN_TIME_COMMITMENT.md` (v0.2)
- Spec consistency runner → `audric/apps/web/lib/engine/spec-consistency.ts` (16 assertions today; bumps to 17 with this ship)
- Phase 3a soak gate (the prerequisite) → audric.bundle.fast_path_dispatched step_count=4 ≥10 events with zero validator-side skips. Currently 1/10.
