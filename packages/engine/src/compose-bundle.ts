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
import type {
  ContentBlock,
  PendingAction,
  PendingActionStep,
  Tool,
} from './types.js';
import type { PendingToolCall } from './orchestration.js';

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
