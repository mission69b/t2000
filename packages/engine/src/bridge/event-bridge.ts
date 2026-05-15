// ---------------------------------------------------------------------------
// event-bridge.ts — AI SDK v6 stream events → EngineEvent translator
// ---------------------------------------------------------------------------
//
// SPEC 37 v0.7a Phase 0 deliverables 1 (R8) + 5 (AI SDK pin). Lands the
// foundation that gates Phase 1: a stateless translator that converts
// Vercel AI SDK v6 `streamText` events (`TextStreamPart<ToolSet>`) into
// the existing `EngineEvent` union the engine's outer agent loop yields.
//
// Bound to upstream types
// -----------------------
// As of Phase 0 deliverable 5 (`ai@^6.0.182` + `@ai-sdk/anthropic@^3.0.77`
// pinned), this file imports the actual `TextStreamPart` shape from `ai`
// via `bridge/ai-sdk-types.ts`. Future v6 → v7 breaking changes surface
// as TypeScript errors here (single point of failure by design).
//
// What the bridge IS
// ------------------
// • A pure async generator: `bridgeAISDKStream(events) → AsyncGenerator<EngineEvent>`.
// • Block-index aware for thinking — multiple Anthropic reasoning blocks
//   in one turn map to rising `blockIndex` values exactly as the legacy
//   `providers/anthropic.ts` path emits today.
// • `eval_summary` parser invoked at `reasoning-end` so the
//   `summaryMode` + `evaluationItems` fields land on `thinking_done`
//   identically to the Anthropic path.
// • Provider-metadata aware — Anthropic's signed-thinking signature is
//   surfaced on `thinking_done.signature` so the signed round-trip
//   continues to work post-Phase-5.
// • Error envelope normalisation: AI SDK error events carry `unknown`;
//   bridge converts to a real `Error` instance before emitting.
// • Finish-reason → `StopReason` mapping done in one place; v6's
//   6-value enum exhaustively covered.
// • `tool-error` is fan-folded into `tool_result` with `isError: true`
//   to match the engine's existing two-event model.
//
// What the bridge IS NOT
// ----------------------
// • Does NOT emit `pending_action`. That is engine orchestration's job
//   (post-stream, after the permission gate fires). The bridge runs
//   INSIDE the LLM stream loop.
// • Does NOT translate `tool-approval-request` (v6 native confirm flow).
//   v0.7a keeps the existing `EngineConfig.onPermissionRequest` /
//   `pending_action` orchestration path; engine code calls the AI SDK's
//   `addToolApprovalResponse` from outside the bridge.
// • Does NOT emit canvas / todo_update / proactive_text / harness_shape /
//   stream_state / tool_progress / pending_input / compaction. Those
//   are emitted by engine code OUTSIDE the LLM stream — outer loop
//   interleaves them with bridge output.
// • Does NOT stamp `attemptId`. Per `agent-harness-spec.mdc` Item 3,
//   `attemptId` is stamped by the engine at `pending_action` emit time.
//   Bridge never emits `pending_action`; constraint is met by construction.
//
// v6-vs-v5 simplification
// -----------------------
// In v5 the bridge needed a `toolNameByCallId` carry to recover the
// tool name when `tool-output-available` arrived (v5 omitted toolName
// from output events). In v6 `tool-result` and `tool-error` carry
// `toolName` directly. The carry mechanism is gone — `BridgeState`
// only tracks reasoning block indices and accumulated reasoning text.
//
// Test contract
// -------------
// `event-bridge.test.ts` covers:
//   • Every TextStreamPart variant the bridge consumes maps to the
//     expected EngineEvent (or correctly drops to nothing).
//   • Ordering preserved 1:1 through the bridge.
//   • Multiple thinking blocks stamp rising blockIndex.
//   • Anthropic provider-metadata signature flows through.
//   • <eval_summary> parser fires on reasoning-end when applicable.
//   • Finish-reason → StopReason mapping is exhaustive.
//   • Error envelope normalisation handles strings, objects, Errors,
//     null, circular refs.
//   • Usage normalisation handles v6's nested inputTokenDetails /
//     outputTokenDetails shape.
//   • abort becomes an error envelope with a stable message.
//   • New v6 events (source, file, raw, tool-output-denied, tool-input-end,
//     tool-approval-request) silently drop.
// ---------------------------------------------------------------------------

import type { EngineEvent, StopReason } from '../types.js';
import { parseEvalSummary } from '../eval-summary.js';
import type {
  AISDKFinishReason,
  AISDKLanguageModelUsage,
  AISDKProviderMetadata,
  AISDKStreamEvent,
} from './ai-sdk-types.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Translate an AI SDK `streamText` event source into the engine's
 * `EngineEvent` stream. Stateless from the caller's perspective — the
 * generator owns its own per-stream state (block-index counters,
 * accumulating reasoning text for the eval-summary parser).
 *
 * Caller is expected to await the generator to completion (or break
 * early on cancellation). The bridge does not own cancellation
 * semantics — the caller's `AbortSignal` propagates through the
 * upstream `streamText` call.
 */
export async function* bridgeAISDKStream(
  events: AsyncIterable<AISDKStreamEvent>,
): AsyncGenerator<EngineEvent> {
  const state = createBridgeState();
  for await (const event of events) {
    for (const e of translate(event, state)) yield e;
  }
}

/**
 * Pure synchronous translator for a single AI SDK event. Exposed for
 * tests + advanced callers (e.g. an EngineEvent-emitting recorder that
 * wants to consume the events one-at-a-time without an async loop).
 *
 * Mutates the passed `state` in place — caller owns lifetime. Use
 * `createBridgeState()` to construct a fresh state per stream.
 */
export function translate(event: AISDKStreamEvent, state: BridgeState): EngineEvent[] {
  switch (event.type) {
    // Lifecycle / forward-compat events with no engine equivalent.
    // start-step in v6 carries request + warnings; finish-step carries
    // response + usage + finishReason + rawFinishReason +
    // providerMetadata. The outer engine loop reads finish-step usage
    // when it cares (e.g. for per-step telemetry); the bridge surfaces
    // only the cumulative `finish.totalUsage` to keep the legacy
    // EngineEvent.usage contract unchanged.
    case 'start':
    case 'start-step':
    case 'finish-step':
    case 'text-start':
    case 'text-end':
    case 'tool-input-start':
    case 'tool-input-end':
    case 'tool-input-delta':
    case 'source':
    case 'file':
    case 'raw':
    case 'tool-output-denied':
    case 'tool-approval-request':
      return [];

    case 'reasoning-start':
      state.reasoningTextById.set(event.id, '');
      if (!state.blockIndexById.has(event.id)) {
        state.blockIndexById.set(event.id, state.nextReasoningBlockIndex);
        state.nextReasoningBlockIndex += 1;
      }
      return [];

    case 'reasoning-delta': {
      const blockIndex =
        state.blockIndexById.get(event.id) ?? assignReasoningIndex(state, event.id);
      const accumulated = (state.reasoningTextById.get(event.id) ?? '') + event.text;
      state.reasoningTextById.set(event.id, accumulated);
      return [{ type: 'thinking_delta', text: event.text, blockIndex }];
    }

    case 'reasoning-end': {
      const blockIndex =
        state.blockIndexById.get(event.id) ?? assignReasoningIndex(state, event.id);
      const fullText = state.reasoningTextById.get(event.id) ?? '';
      const signature = extractAnthropicSignature(event.providerMetadata);
      const evalParse = parseEvalSummary(fullText);
      const ev: EngineEvent = {
        type: 'thinking_done',
        blockIndex,
        ...(signature !== undefined ? { signature } : {}),
        ...(evalParse !== null
          ? { summaryMode: evalParse.summaryMode, evaluationItems: evalParse.evaluationItems }
          : {}),
      };
      state.reasoningTextById.delete(event.id);
      return [ev];
    }

    case 'text-delta':
      return [{ type: 'text_delta', text: event.text }];

    case 'tool-call':
      // v6 tool-call carries the FULL parsed input. This is the
      // analogue of v5's `tool-input-available`. Engine sees this as
      // the signal that a tool call is dispatching.
      return [
        {
          type: 'tool_start',
          toolName: event.toolName,
          toolUseId: event.toolCallId,
          input: event.input,
          source: 'llm',
        },
      ];

    case 'tool-result':
      // v6 tool-result carries toolName directly (eliminates the
      // toolNameByCallId carry the v5 bridge needed). `output` is
      // typed by the originating tool; we forward as `unknown`
      // because the bridge is tool-agnostic.
      return [
        {
          type: 'tool_result',
          toolName: event.toolName,
          toolUseId: event.toolCallId,
          result: event.output,
          isError: false,
          source: 'llm',
        },
      ];

    case 'tool-error':
      // v6 tool-error carries toolName + structured `error` (unknown).
      // We coerce to the legacy two-event shape (tool_result with
      // isError: true) so audric/web's BlockRouter doesn't have to
      // learn a third event type.
      return [
        {
          type: 'tool_result',
          toolName: event.toolName,
          toolUseId: event.toolCallId,
          result: errorToString(event.error),
          isError: true,
          source: 'llm',
        },
      ];

    case 'finish': {
      const out: EngineEvent[] = [];
      const usageEvent = toUsageEvent(event.totalUsage);
      if (usageEvent !== null) out.push(usageEvent);
      out.push({ type: 'turn_complete', stopReason: mapFinishReason(event.finishReason) });
      return out;
    }

    case 'error':
      return [{ type: 'error', error: normaliseError(event.error) }];

    case 'abort':
      // v6 abort optionally carries a string reason. Surface it on
      // the error message when present so debug logs are more useful.
      return [
        {
          type: 'error',
          error: new Error(
            event.reason
              ? `AI SDK stream aborted: ${event.reason}`
              : 'AI SDK stream aborted',
          ),
        },
      ];

    default:
      // Forward-compat: AI SDK ships a new event type we don't yet
      // recognise → silently drop. Adding new translations is purely
      // additive; missing ones can never break audric/web.
      return [];
  }
}

// ---------------------------------------------------------------------------
// Bridge state — opaque to callers, exported for the per-event `translate()`
// ---------------------------------------------------------------------------

/**
 * Per-stream state. v6 simplification: no `toolNameByCallId` carry
 * (tool-result + tool-error now carry toolName directly). The state
 * tracks ONLY reasoning block bookkeeping.
 */
export interface BridgeState {
  /**
   * Map from AI SDK reasoning-block id → engine `blockIndex`. AI SDK
   * uses opaque string ids per block; the engine's hosts render
   * thinking accordions keyed on a monotonic 0-based index. We assign
   * the next index lazily on first sight of an id.
   */
  blockIndexById: Map<string, number>;
  nextReasoningBlockIndex: number;
  /** Accumulating reasoning text per-block — feeds the eval_summary parser at reasoning-end. */
  reasoningTextById: Map<string, string>;
}

export function createBridgeState(): BridgeState {
  return {
    blockIndexById: new Map(),
    nextReasoningBlockIndex: 0,
    reasoningTextById: new Map(),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function assignReasoningIndex(state: BridgeState, id: string): number {
  const idx = state.nextReasoningBlockIndex;
  state.nextReasoningBlockIndex += 1;
  state.blockIndexById.set(id, idx);
  return idx;
}

/**
 * Anthropic's reasoning-block signature lives at
 * `providerMetadata.anthropic.signature`. Documented in AI SDK's
 * Anthropic provider reference. We surface it onto
 * `EngineEvent.thinking_done.signature` so the signed-thinking-block
 * round-trip continues to work after Phase 5.
 */
function extractAnthropicSignature(
  metadata: AISDKProviderMetadata | undefined,
): string | undefined {
  if (!metadata) return undefined;
  const anthropic = metadata.anthropic;
  if (!anthropic || typeof anthropic !== 'object') return undefined;
  const sig = (anthropic as Record<string, unknown>).signature;
  return typeof sig === 'string' ? sig : undefined;
}

/**
 * Map AI SDK v6's finish reason to the engine's `StopReason`. v6 has
 * 6 values: `stop | length | content-filter | tool-calls | error |
 * other`. The engine's `'max_turns'` is owned by the outer agent loop
 * (when N tool-loop iterations are exceeded) — never produced by the
 * LLM stream itself, so the bridge never emits it.
 */
export function mapFinishReason(reason: AISDKFinishReason): StopReason {
  switch (reason) {
    case 'stop':
      return 'end_turn';
    case 'tool-calls':
      return 'tool_use';
    case 'length':
      return 'max_tokens';
    case 'error':
    case 'content-filter':
      return 'error';
    case 'other':
    default:
      return 'end_turn';
  }
}

/**
 * Translate v6's `LanguageModelUsage` to `EngineEvent.usage`. v6 nests
 * cache fields under `inputTokenDetails`/`outputTokenDetails`; the
 * legacy `EngineEvent.usage` shape is flat. We map:
 *   inputTokens                      → inputTokens
 *   outputTokens                     → outputTokens
 *   inputTokenDetails.cacheReadTokens  → cacheReadTokens (when defined)
 *   inputTokenDetails.cacheWriteTokens → cacheWriteTokens (when defined)
 *
 * v6 uses `number | undefined` (not `number?`) for token counts —
 * means "not measured" rather than "zero". We default to 0 to keep
 * the legacy contract that hosts can sum these without null-checking.
 *
 * Returns `null` when the input is undefined (some `finish` events in
 * tests / mocks may have no usage at all). Caller handles the null.
 */
function toUsageEvent(
  usage: AISDKLanguageModelUsage | undefined,
): Extract<EngineEvent, { type: 'usage' }> | null {
  if (!usage) return null;
  const ev: Extract<EngineEvent, { type: 'usage' }> = {
    type: 'usage',
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
  };
  const cacheRead = usage.inputTokenDetails?.cacheReadTokens;
  if (cacheRead !== undefined) ev.cacheReadTokens = cacheRead;
  const cacheWrite = usage.inputTokenDetails?.cacheWriteTokens;
  if (cacheWrite !== undefined) ev.cacheWriteTokens = cacheWrite;
  return ev;
}

/**
 * Convert v6's `unknown` error payload (carried on `tool-error.error`)
 * to a string for the legacy `tool_result.result` field. Mirrors the
 * v5 path's `errorText` straight-through behavior — older audric/web
 * code reads `result` as a string when `isError === true`.
 */
function errorToString(raw: unknown): string {
  if (raw === undefined || raw === null) return 'tool error';
  if (typeof raw === 'string') return raw;
  if (raw instanceof Error) return raw.message;
  if (typeof raw === 'object') {
    const message = (raw as { message?: unknown }).message;
    if (typeof message === 'string') return message;
    try {
      return JSON.stringify(raw);
    } catch {
      return 'tool error (non-serialisable)';
    }
  }
  return String(raw);
}

function normaliseError(raw: unknown): Error {
  if (raw instanceof Error) return raw;
  if (typeof raw === 'string') return new Error(raw);
  if (raw && typeof raw === 'object') {
    const message = (raw as { message?: unknown }).message;
    if (typeof message === 'string') return new Error(message);
    try {
      return new Error(JSON.stringify(raw));
    } catch {
      return new Error('AI SDK stream error (non-serialisable)');
    }
  }
  return new Error('AI SDK stream error');
}
