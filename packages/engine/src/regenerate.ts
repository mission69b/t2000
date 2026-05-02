/**
 * SPEC 7 v0.3 Quote-Refresh ReviewCard — engine-side bundle regeneration.
 *
 * When a user takes 30–60s to read a multi-step Payment Stream
 * `pending_action`, the upstream read results that fed bundle composition
 * (Cetus quotes, NAVI APYs, wallet balances) drift. Today the user has to
 * either approve with stale data (Sui dry-run is the safety gate, but the
 * UX is "did this just lie to me?") or cancel and re-prompt the LLM
 * (loses the narrative thread). The Quote-Refresh ReviewCard adds a
 * third option: an explicit REGENERATE button that re-fires the
 * upstream reads (no LLM call), rebuilds the bundle in place, and
 * yields a fresh `pending_action` with new per-step `attemptId`s.
 *
 * **What this function does NOT do.**
 *  - Run the LLM. Regenerate is "re-evaluate the same intent against
 *    fresh state" — the writes' tool names + inputs stay identical;
 *    only the upstream read TIMESTAMPS change (and any downstream
 *    derivations the host made off them).
 *  - Run the bundle on-chain. The host still presents the new
 *    PermissionCard for confirmation; user can approve, regenerate
 *    again, or deny.
 *  - Mutate `TurnMetrics` rows. The host route owns analytics — see
 *    `audric/apps/web/app/api/engine/regenerate/route.ts`.
 *
 * **Spec 1 / Spec 2 invariants preserved.**
 *  - Each regeneration produces its own per-step `attemptId` (UUID v4),
 *    so the host can write a fresh `TurnMetrics` row keyed on it.
 *  - The original `pending_action`'s `attemptId` stays valid for the
 *    host's `pendingActionOutcome = 'regenerated'` update — no
 *    accidental over-write of the original row.
 *
 * **Why synchronous (no SSE).** The chat stream that originally
 * yielded the bundled `pending_action` has already closed by the time
 * the user taps Regenerate (`useEngine.ts` flips `isStreaming: false`
 * on `pending_action`). Reopening a stream for a sub-second round-trip
 * would be heavier than the host needs. Instead, the host endpoint
 * calls this function synchronously and returns
 * `{ success, newPendingAction, timelineEvents[] }` in the response
 * body — host renders `timelineEvents[]` as a "↻ Regenerated · Ns"
 * group above the new card.
 */

import { randomUUID } from 'node:crypto';
import { composeBundleFromToolResults } from './compose-bundle.js';
import { REGENERATABLE_READ_TOOLS } from './tool-ttls.js';
import type { QueryEngine } from './engine.js';
import type {
  ContentBlock,
  Message,
  PendingAction,
} from './types.js';
import type { PendingToolCall } from './orchestration.js';

/**
 * One event in the `timelineEvents[]` array returned to the host.
 * Mirrors the engine's normal SSE event shapes for `tool_start` and
 * `tool_result` so the host can push them onto its timeline as if they
 * had streamed live.
 */
export type RegenerateTimelineEvent =
  | {
      type: 'tool_start';
      toolName: string;
      toolUseId: string;
      input: unknown;
    }
  | {
      type: 'tool_result';
      toolName: string;
      toolUseId: string;
      result: unknown;
      isError: boolean;
      durationMs: number;
    };

export interface RegenerateSuccess {
  success: true;
  /**
   * Fresh `pending_action` with new per-step `attemptId`s. The host
   * swaps this in for the original `PermissionCard` payload; the
   * existing PermissionCard renderer requires no changes — it sees a
   * fresh action with a fresh `quoteAge` of ~0ms.
   */
  newPendingAction: PendingAction;
  /**
   * Re-fired upstream read events the host renders as a
   * "↻ Regenerated · Ns" group above the new card. Order: every
   * `tool_start` for one read is paired with its `tool_result`; reads
   * are processed serially (so durations sum cleanly for the group
   * label).
   */
  timelineEvents: RegenerateTimelineEvent[];
}

export interface RegenerateFailure {
  success: false;
  reason: 'pending_action_not_found' | 'cannot_regenerate' | 'engine_error';
  message: string;
}

export type RegenerateResult = RegenerateSuccess | RegenerateFailure;

/**
 * Re-fire the upstream reads that fed a bundled pending_action and
 * compose a fresh bundle. The engine MUST be created with the same
 * tool registry + ToolContext as the chat turn that produced the
 * original action. The host typically reaches this by calling
 * `createEngine({ address, session })` on the same session that
 * persisted the pending_action.
 *
 * **Side effect.** On success, this mutates the engine's message
 * history by appending one synthetic assistant message (carrying the
 * regenerated `tool_use` blocks) and one user message (carrying the
 * fresh `tool_result` blocks). This is so the LLM sees the fresh
 * data when the user approves the new bundle and the engine resumes.
 * The host should persist `engine.getMessages()` back to its session
 * store after a successful regenerate.
 *
 * **Failure modes.**
 *  - `pending_action_not_found` — the action isn't a bundle (no
 *    `steps`, or fewer than 2 steps). Single-write actions can't be
 *    regenerated by design.
 *  - `cannot_regenerate` — the action's `canRegenerate` flag is
 *    false, OR no contributing read tool_use_ids could be located in
 *    session history.
 *  - `engine_error` — a tool re-execution threw, OR bundle
 *    composition rejected (defensive — should not happen if the
 *    original bundle was valid).
 *
 * Errors in tool re-execution short-circuit the whole regenerate
 * (bundle composition would inherit a broken read result). The host
 * surfaces this as a toast: "Could not regenerate. The original card
 * is still valid."
 */
export async function regenerateBundle(
  engine: QueryEngine,
  action: PendingAction,
): Promise<RegenerateResult> {
  if (!action.steps || action.steps.length < 2) {
    return {
      success: false,
      reason: 'pending_action_not_found',
      message: 'Action is not a multi-step bundle',
    };
  }
  if (action.canRegenerate !== true) {
    return {
      success: false,
      reason: 'cannot_regenerate',
      message: 'Bundle has canRegenerate=false (no upstream reads contributed)',
    };
  }
  const regenIds = action.regenerateInput?.toolUseIds ?? [];
  if (regenIds.length === 0) {
    return {
      success: false,
      reason: 'cannot_regenerate',
      message: 'Bundle has no regenerateInput.toolUseIds',
    };
  }

  const messages = engine.getMessages();
  // `getTools()` returns `readonly Tool[]`; `composeBundleFromToolResults`
  // takes a mutable `Tool[]` slot but never mutates it, so the spread is
  // a typing concession rather than a defensive copy.
  const tools = [...engine.getTools()];

  // Locate the original tool_use blocks for each regenerateInput id and
  // pull the (toolName, input) pair so we can re-execute. Reads that
  // landed in earlier user-history are by construction in
  // `messages[*].content[*]` as `tool_use` blocks within an assistant
  // message.
  const originalReads: Array<{ toolName: string; input: unknown }> = [];
  for (const id of regenIds) {
    let found: { name: string; input: unknown } | null = null;
    outer: for (const msg of messages) {
      if (msg.role !== 'assistant') continue;
      for (const block of msg.content) {
        if (
          block.type === 'tool_use' &&
          (block as { id: string }).id === id
        ) {
          found = {
            name: (block as { name: string }).name,
            input: (block as { input: unknown }).input,
          };
          break outer;
        }
      }
    }
    if (!found) {
      return {
        success: false,
        reason: 'engine_error',
        message: `Original tool_use ${id} not found in session history`,
      };
    }
    if (!REGENERATABLE_READ_TOOLS.has(found.name)) {
      // Skip silently — a stale toolUseId in `regenerateInput` for a
      // non-regeneratable tool would be a defensive false-positive
      // (the bundle composer's allow-list filter usually catches it).
      continue;
    }
    originalReads.push({ toolName: found.name, input: found.input });
  }

  if (originalReads.length === 0) {
    return {
      success: false,
      reason: 'cannot_regenerate',
      message:
        'No regeneratable read tool_use blocks found in session history',
    };
  }

  // Re-execute each read serially. We do not parallelize here for two
  // reasons: (a) Cetus + NAVI MCP both have rate-limit windows that
  // serial calls amortize cleanly, (b) timelineEvents in the response
  // are easier to reason about when ordered by execution time. Most
  // bundles regenerate against ≤3 reads so the latency cost is small.
  const timelineEvents: RegenerateTimelineEvent[] = [];
  const newReads: Array<{
    toolUseId: string;
    toolName: string;
    input: unknown;
    result: unknown;
    isError: boolean;
    timestamp: number;
  }> = [];

  for (const r of originalReads) {
    const newToolUseId = `regen_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    timelineEvents.push({
      type: 'tool_start',
      toolName: r.toolName,
      toolUseId: newToolUseId,
      input: r.input,
    });
    const t0 = Date.now();
    let outcome: { data: unknown; isError: boolean };
    try {
      outcome = await engine.invokeReadTool(r.toolName, r.input);
    } catch (err) {
      outcome = {
        data: { error: err instanceof Error ? err.message : String(err) },
        isError: true,
      };
    }
    const durationMs = Date.now() - t0;
    timelineEvents.push({
      type: 'tool_result',
      toolName: r.toolName,
      toolUseId: newToolUseId,
      result: outcome.data,
      isError: outcome.isError,
      durationMs,
    });
    if (outcome.isError) {
      // First read failure terminates the whole regenerate. The host
      // surfaces a toast and keeps the original card valid — user can
      // tap Regenerate again or just approve with the stale quote.
      return {
        success: false,
        reason: 'engine_error',
        message: `Re-execution of ${r.toolName} failed`,
      };
    }
    newReads.push({
      toolUseId: newToolUseId,
      toolName: r.toolName,
      input: r.input,
      result: outcome.data,
      isError: false,
      timestamp: t0,
    });
  }

  // Append the regenerated reads as a synthetic assistant→user pair
  // onto session history. The pattern matches the engine's normal
  // tool-execution cycle (assistant emits tool_use, user replies with
  // tool_result), so when the user approves the new bundle and the
  // engine resumes, the LLM sees the fresh reads in conversation
  // order. The host persists `engine.getMessages()` after this call
  // returns success.
  const synthAssistantBlocks: ContentBlock[] = newReads.map((r) => ({
    type: 'tool_use',
    id: r.toolUseId,
    name: r.toolName,
    input: r.input,
  }));
  const synthUserBlocks: ContentBlock[] = newReads.map((r) => ({
    type: 'tool_result',
    toolUseId: r.toolUseId,
    content:
      typeof r.result === 'string' ? r.result : JSON.stringify(r.result),
    isError: r.isError,
  }));
  const synthMessages: Message[] = [
    { role: 'assistant', content: synthAssistantBlocks },
    { role: 'user', content: synthUserBlocks },
  ];
  engine.loadMessages([...messages, ...synthMessages]);

  // Reconstruct the writes the original bundle carried. composeBundle
  // re-stamps each step's `attemptId` with a fresh UUID v4 — that's
  // the load-bearing freshness; tool_use_id stays identical so
  // `assistantContent`'s tool_use → tool_result pairing in resume
  // remains intact.
  const pendingWrites: PendingToolCall[] = action.steps.map((step) => ({
    id: step.toolUseId,
    name: step.toolName,
    input: step.input,
  }));

  const readResults = newReads.map((r) => ({
    toolUseId: r.toolUseId,
    toolName: r.toolName,
    timestamp: r.timestamp,
  }));

  // Carry forward the original action's `assistantContent` and
  // `completedResults` verbatim — the writes' tool_use blocks and
  // any same-turn early-dispatched read results haven't changed.
  // The fresh reads we just ran are pushed into engine.messages as
  // earlier history, NOT into the new pending_action's payload.
  const assistantContent: ContentBlock[] = action.assistantContent ?? [];
  const completedResults = action.completedResults ?? [];

  let newPendingAction: PendingAction;
  try {
    newPendingAction = composeBundleFromToolResults({
      pendingWrites,
      tools,
      readResults,
      assistantContent,
      completedResults,
      turnIndex: action.turnIndex,
    });
  } catch (err) {
    return {
      success: false,
      reason: 'engine_error',
      message: err instanceof Error ? err.message : 'Bundle rebuild failed',
    };
  }

  return { success: true, newPendingAction, timelineEvents };
}
