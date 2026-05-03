/**
 * SPEC 7 v0.4 Layer 2 — bundle composition helper.
 *
 * When the LLM emits ≥2 `tool_use` blocks in a single assistant turn
 * AND every block resolves to a `confirm`-tier write tool with
 * `bundleable: true`, the permission gate collects them all into a
 * `pendingWrites: PendingToolCall[]` array (instead of breaking on the
 * first one). This helper takes that collected array plus the same-turn
 * read tool_use_ids and returns a `PendingAction` with `steps[]`
 * populated.
 *
 * **Single-write fast path.** When `pendingWrites.length === 1`, the
 * caller should NOT call this helper — emit the legacy single-write
 * `pending_action` shape directly. Bundles are N≥2 only; the legacy
 * shape stays unchanged for backward compatibility (SPEC 1 attemptId
 * resume keying continues to work without host migration).
 *
 * **Quote-Refresh fields (SPEC 7 v0.3).** The helper inspects the
 * pending writes' inputs for references to upstream read results
 * (`balance_check`, `swap_quote`, `rates_info`, etc.). When a step
 * input could plausibly have been derived from a read result (e.g. an
 * amount field whose numeric value matches a read result's exposed
 * amount), the helper marks the corresponding read tool_use_id as a
 * regenerate input. Conservative — false positives just enable the
 * REGENERATE button when it could've stayed off; never wrong-direction.
 *
 * **What this helper does NOT do.**
 *  - Run guards (caller does that BEFORE calling here).
 *  - Apply USD permission resolution (caller does it per-step BEFORE
 *    calling here, to decide which writes get bundled).
 *  - Compose the on-chain PTB (host does that via `composeTx({ steps })`
 *    after the user approves).
 *
 * The helper is pure synchronous transformation: takes typed inputs,
 * returns a typed `PendingAction`.
 */
import { randomUUID } from 'node:crypto';
import { findTool } from './tool.js';
import { describeAction } from './describe-action.js';
import { getModifiableFields } from './tools/tool-modifiable-fields.js';
import { REGENERATABLE_READ_TOOLS } from './tool-ttls.js';
import { getTelemetrySink } from './telemetry.js';
import type {
  ContentBlock,
  PendingAction,
  PendingActionStep,
  Tool,
} from './types.js';
import type { PendingToolCall } from './orchestration.js';

/**
 * [Phase 0 → Phase 2 / SPEC 13] Maximum number of writes per atomic bundle.
 *
 * **History.**
 *  - Pre-Phase-0: 5 (F14-fix-2, 2026-05-03 morning).
 *  - Phase 0 (1.12.0, 2026-05-03 evening): tightened to 2 after the May 3
 *    production review found bundle failures all reduced to chained-asset
 *    gaps — the SDK pre-fetched coins from the wallet and the chained
 *    asset didn't exist yet (e.g. `swap_execute(USDC→USDsui) +
 *    save_deposit(USDsui)` reverted at PREPARE because USDsui wasn't in
 *    the wallet at compose time).
 *  - Phase 1 (1.13.0): cap stayed 2. SPEC 13 Phase 1 added the chained-
 *    coin handoff primitive (`PendingActionStep.inputCoinFromStep` +
 *    `composeTx` orchestration loop) but didn't widen the cap. The
 *    primitive is what makes Phase 2's raise to 3 possible — without it,
 *    every additional step is another wallet-fetch race.
 *  - Phase 2 (1.14.0, this version): cap raised to 3. Composition rule
 *    is strict-adjacency: every (step[i], step[i+1]) pair must be in
 *    `VALID_PAIRS`. No new pairs added — Phase 2 is purely the cap raise
 *    + adjacency-loop validation. The chain-mode population loop already
 *    runs over every `(i, i+1)` since 1.13.0, so 3-op atomic bundles
 *    like `withdraw → swap → send` thread two coin handles end-to-end
 *    in one PTB.
 *
 * **Why strict adjacency?** Every consecutive pair must be whitelisted
 * even if the consumer doesn't chain (no `inputCoinFromStep`). This
 * keeps the validator simple and matches the spec's Phase 2 model. The
 * looser DAG-aware variant (where non-chained adjacent steps can be
 * any tool combo) is a Phase 3 follow-up — defer until we see real
 * production flows that need it.
 *
 * **Phase 3+:** `swap_execute → swap_execute` (Demo 1 unlock) + DAG-aware
 * validator + cap raise to 4. SPEC 13 §"Phase 3" / §"Phase 5" tracks
 * these. Don't pre-emptively raise this constant past 3 without those
 * landing.
 *
 * Hosts importing this constant for system-prompt construction get the
 * current cap automatically. Bumping the cap is a one-line change here
 * that propagates to prompts via the import.
 */
export const MAX_BUNDLE_OPS = 3;

/**
 * [Phase 0 / SPEC 13] Whitelisted (producer, consumer) pairs for atomic
 * bundling. Every key has the shape `${producer}->${consumer}`. Bundles
 * whose adjacent steps aren't in this set get refused with
 * `_gate: 'pair_not_whitelisted'` so the LLM splits sequentially.
 *
 * **The 7 pairs and why they're safe in Phase 0.**
 *
 * | Pair | Why it works at compose time today |
 * |---|---|
 * | `swap_execute → send_transfer` | Swap's `tx.transferObjects([result.coin], sender)` lands the swap output in the wallet for the same PTB; send's `selectAndSplitCoin` finds it. |
 * | `swap_execute → save_deposit` | Same mechanism — swap output is back in wallet for save's coin fetch. (P0 caveat: this currently *fails* if the wallet has zero of `swap.to` BEFORE the swap step. Phase 1's `inputCoinFromStep` fixes that. For now we accept the pair but warn the LLM in the prompt rule that wallet must hold ≥0 of target asset.) |
 * | `swap_execute → repay_debt` | Same as save. Same caveat. |
 * | `withdraw → swap_execute` | Withdraw's output is transferred to user; swap's coin fetch finds it. Same wallet caveat in reverse. |
 * | `withdraw → send_transfer` | Same shape. |
 * | `borrow → send_transfer` | Borrow output lands in wallet; send finds it. |
 * | `borrow → repay_debt` (same asset) | Unusual but valid — borrow output repays elsewhere. |
 *
 * **NOT in the whitelist** (sequential only until Phase 1+):
 *
 * - `swap → swap` — chained-asset handoff between two swaps. Phase 3.
 * - `borrow → swap` — borrow output is `USDC|USDsui`, swap takes any
 *   `from`. Could be added in Phase 1.
 * - `claim_rewards → *` — produces N reward coins, structurally
 *   different. Phase 5+.
 * - Anything with `volo_stake` / `volo_unstake` chained — Phase 5+.
 */
export const VALID_PAIRS: ReadonlySet<string> = new Set([
  'swap_execute->send_transfer',
  'swap_execute->save_deposit',
  'swap_execute->repay_debt',
  'withdraw->swap_execute',
  'withdraw->send_transfer',
  'borrow->send_transfer',
  'borrow->repay_debt',
]);

/**
 * Test whether a 2-op bundle's (producer, consumer) pair is in the
 * Phase 0 whitelist. Returns the pair key on match, `null` otherwise
 * so callers can include the rejection reason in the synthesized
 * tool_result.
 *
 * Caller is responsible for ensuring `producer` and `consumer` are the
 * actual tool names of the bundle's two steps (in execution order).
 */
export function checkValidPair(
  producer: string,
  consumer: string,
): { ok: true; pair: string } | { ok: false; pair: string } {
  const pair = `${producer}->${consumer}`;
  return VALID_PAIRS.has(pair) ? { ok: true, pair } : { ok: false, pair };
}

/**
 * [SPEC 13 Phase 1] Infer the asset symbol of a producer's output coin.
 * Used to align producer output ↔ consumer input before populating
 * `inputCoinFromStep` on the consumer step. Returns lowercase symbol or
 * null if not inferrable (input shape doesn't match expected fields).
 *
 * The defaults (`USDC` for `withdraw`/`borrow` when no `asset` field) match
 * the SDK's `resolveSaveableAsset(input.asset)` default.
 */
export function inferProducerOutputAsset(toolName: string, input: unknown): string | null {
  if (typeof input !== 'object' || input === null) return null;
  const i = input as Record<string, unknown>;
  if (toolName === 'swap_execute') {
    return typeof i.to === 'string' ? i.to.toLowerCase() : null;
  }
  if (toolName === 'withdraw' || toolName === 'borrow') {
    return typeof i.asset === 'string' ? i.asset.toLowerCase() : 'usdc';
  }
  return null;
}

/**
 * [SPEC 13 Phase 1] Infer the asset symbol the consumer expects to
 * receive in its input coin. Pair with `inferProducerOutputAsset` to
 * decide whether `inputCoinFromStep` is safe to populate.
 */
export function inferConsumerInputAsset(toolName: string, input: unknown): string | null {
  if (typeof input !== 'object' || input === null) return null;
  const i = input as Record<string, unknown>;
  if (
    toolName === 'send_transfer' ||
    toolName === 'save_deposit' ||
    toolName === 'repay_debt'
  ) {
    return typeof i.asset === 'string' ? i.asset.toLowerCase() : 'usdc';
  }
  if (toolName === 'swap_execute') {
    return typeof i.from === 'string' ? i.from.toLowerCase() : null;
  }
  return null;
}

/**
 * [SPEC 13 Phase 1] Decide whether a (producer, consumer) bundle pair
 * should be wired with `inputCoinFromStep` for chained-coin handoff.
 *
 * Two gates:
 *   1. The pair MUST be in `VALID_PAIRS` (whitelist).
 *   2. The producer's output asset MUST equal the consumer's input
 *      asset (case-insensitive symbol comparison).
 *
 * When both gates pass, the orchestration loop at execute time will
 * thread the producer's `outputCoin` into the consumer's `inputCoin`,
 * suppressing the producer's terminal `tx.transferObjects` and the
 * consumer's wallet pre-fetch. Result: one atomic PTB, zero wallet
 * round-trips for the chained leg.
 *
 * When gate 2 fails (assets misaligned), the bundle still composes —
 * just without `inputCoinFromStep`. The on-chain leg will then fail
 * at execute time the same way it fails today (consumer's
 * `selectAndSplitCoin` returns "no coins found"), which is exactly
 * what the LLM should learn to avoid by rebundling.
 */
export function shouldChainCoin(producer: PendingToolCall, consumer: PendingToolCall): boolean {
  const pair = `${producer.name}->${consumer.name}`;
  if (!VALID_PAIRS.has(pair)) return false;
  const out = inferProducerOutputAsset(producer.name, producer.input);
  const inA = inferConsumerInputAsset(consumer.name, consumer.input);
  if (!out || !inA) return false;
  return out === inA;
}

export interface BundleCompositionInput {
  /** All confirm-tier bundleable writes the LLM emitted in this turn. MUST be ≥2. */
  pendingWrites: PendingToolCall[];
  /** Tools registered with the engine — for description + modifiableFields lookup. */
  tools: Tool[];
  /**
   * Same-turn earlier read tool_use ids + their results, in the order they
   * landed. The helper extracts `regenerateInput.toolUseIds` from this set
   * by intersecting it with the canonical regeneratable-read allow-list
   * (`REGENERATABLE_READ_TOOLS`).
   */
  readResults: Array<{
    toolUseId: string;
    toolName: string;
    timestamp: number;
  }>;
  /** Full assistant message blocks for the deferred turn (engine.ts uses this). */
  assistantContent: ContentBlock[];
  /** Already-resolved tool_result blocks (early-dispatched reads + auto writes). */
  completedResults: Array<{ toolUseId: string; content: string; isError: boolean }>;
  /** Per-write-call optional guard injections (already resolved, not re-run here). */
  guardInjectionsByCallId?: Record<string, Array<{ _gate: string; _hint?: string; _warning?: string }>>;
  /** Monotonic turn index — same value the legacy single-write path stamps. */
  turnIndex: number;
}

/**
 * Produce a bundled `PendingAction` from collected pending writes.
 * Caller MUST have already verified pendingWrites.length >= 2 and that
 * every entry's tool has `bundleable: true` + `permissionLevel: 'confirm'`.
 *
 * The helper additionally re-checks `bundleable: true` on each tool as a
 * defensive guard against caller bugs (cheap, catches future call sites
 * that misuse the helper).
 */
export function composeBundleFromToolResults(input: BundleCompositionInput): PendingAction {
  if (input.pendingWrites.length < 2) {
    throw new Error(
      'composeBundleFromToolResults requires ≥2 pending writes; ' +
      'use the legacy single-write path for N=1.',
    );
  }

  const steps: PendingActionStep[] = input.pendingWrites.map((call) => {
    const tool = findTool(input.tools, call.name);
    if (!tool) {
      throw new Error(`Unknown tool '${call.name}' in bundle composition`);
    }
    // [SPEC 7 P2.3 audit fix — BUG 13] Defensive check. The engine.ts
    // permission-gate already filters with
    // `every((w) => w.tool.flags?.bundleable === true)` before calling
    // this helper, but a future call site (CLI, server-task) could miss
    // it. Failing fast here catches the bug before producing a malformed
    // bundle that the host's `composeTx({ steps })` would reject downstream.
    if (tool.flags?.bundleable !== true) {
      throw new Error(
        `Tool '${call.name}' is not bundleable. Set ToolFlags.bundleable=true ` +
        'in tool-flags.ts before including it in a bundle. ' +
        'See SPEC 7 § "Layer 2 — Bundleable tools (v1)".',
      );
    }
    const description = describeAction(tool, call);
    const modifiableFields = getModifiableFields(call.name);
    return {
      toolName: call.name,
      toolUseId: call.id,
      attemptId: randomUUID(),
      input: call.input,
      description,
      ...(modifiableFields?.length ? { modifiableFields } : {}),
    };
  });

  // [SPEC 13 Phase 1] Populate `inputCoinFromStep` for adjacent steps
  // whose pair is whitelisted AND whose producer output asset aligns
  // with the consumer input asset. The host's `composeTx` orchestration
  // loop reads this field at execute time to thread coin handles
  // between appenders. Forward-only references (i-1 → i) — Phase 1 cap
  // is 2 ops so this loop runs at most once. Phase 2+ raises the cap.
  //
  // Each chain-mode population fires `engine.bundle_chain_mode_set`
  // (labels: `producer`, `consumer`) so production can confirm chain-
  // mode is actually firing per pair, not falling back to wallet-mode.
  // Without this counter we'd be inferring chain-mode from "things
  // didn't break" — fine for correctness, useless for diagnosis when
  // a Phase 2+ pair regresses to wallet-mode silently.
  for (let i = 1; i < input.pendingWrites.length; i++) {
    const producer = input.pendingWrites[i - 1];
    const consumer = input.pendingWrites[i];
    if (shouldChainCoin(producer, consumer)) {
      steps[i].inputCoinFromStep = i - 1;
      getTelemetrySink().counter('engine.bundle_chain_mode_set', {
        producer: producer.name,
        consumer: consumer.name,
      });
    }
  }

  // Regenerate-input tracking: any same-turn read tool_use_id that's in
  // the canonical re-runnable allow-list contributes to the bundle's
  // freshness. Conservative — we don't (yet) inspect step inputs to
  // confirm a reference; if a read landed earlier this turn AND it's in
  // REGENERATABLE_READ_TOOLS, we include it. False positives just
  // enable the REGENERATE button; they don't change correctness.
  const regenerateToolUseIds = input.readResults
    .filter((r) => REGENERATABLE_READ_TOOLS.has(r.toolName))
    .map((r) => r.toolUseId);

  const canRegenerate = regenerateToolUseIds.length > 0;

  // quoteAge = now − stalest contributing read timestamp. Min, not max:
  // we report the freshness of the WORST input (that's what gates UX).
  // [SPEC 7 P2.3 audit fix — BUG 12] Clamp to >= 0 against clock skew.
  // `Date.now()` is monotonic-ish but not guaranteed; if a read was
  // recorded a few ms in the future (NTP correction, VM clock drift),
  // a negative quoteAge would render as "QUOTE -3s OLD" in the UI.
  let quoteAge: number | undefined;
  if (regenerateToolUseIds.length > 0) {
    const stalest = Math.min(
      ...input.readResults
        .filter((r) => REGENERATABLE_READ_TOOLS.has(r.toolName))
        .map((r) => r.timestamp),
    );
    quoteAge = Math.max(0, Date.now() - stalest);
  }

  // Concatenated guard injections across every step. Hosts that don't
  // iterate `steps` see the union; hosts that do can re-derive per-step
  // by walking each step's toolUseId against this list (rare).
  const allGuardInjections: NonNullable<PendingAction['guardInjections']> = [];
  if (input.guardInjectionsByCallId) {
    for (const call of input.pendingWrites) {
      const injections = input.guardInjectionsByCallId[call.id];
      if (injections?.length) allGuardInjections.push(...injections);
    }
  }

  // Mirror the first step's identity into the legacy top-level fields
  // so pre-SPEC-7 hosts that don't iterate `steps` at least see the
  // first step's tool name + input. New hosts iterate `steps`. The
  // `description` mirrors the first step too — multi-step PermissionCard
  // hosts override this in the UI by walking steps[].description.
  //
  // [SPEC 7 P2.3 audit fix — BUG 2] Per spec line 463: "`steps[0]`
  // mirrors the top-level toolName/toolUseId/input/attemptId for hosts
  // that haven't been updated". Use steps[0].attemptId as the top-level
  // id (was: a fresh UUID, which broke the mirror invariant). Pre-bundle
  // hosts that key TurnMetrics rows on top-level `attemptId` now collide
  // with the bundle-aware host's step-0 row — both consistent. The
  // bundle has no separate "bundle-as-a-whole" attemptId; the resume
  // route's `updateMany({ where: { attemptId } })` keys still work
  // because they extend trivially to the per-step shape (loop
  // `stepResults`, update each row).
  const firstStep = steps[0];

  const action: PendingAction = {
    toolName: firstStep.toolName,
    toolUseId: firstStep.toolUseId,
    input: firstStep.input,
    description: firstStep.description,
    assistantContent: input.assistantContent,
    completedResults: input.completedResults,
    ...(allGuardInjections.length ? { guardInjections: allGuardInjections } : {}),
    turnIndex: input.turnIndex,
    attemptId: firstStep.attemptId,
    steps,
    canRegenerate,
    ...(quoteAge !== undefined ? { quoteAge } : {}),
    ...(regenerateToolUseIds.length > 0
      ? { regenerateInput: { toolUseIds: regenerateToolUseIds } }
      : {}),
  };

  return action;
}
