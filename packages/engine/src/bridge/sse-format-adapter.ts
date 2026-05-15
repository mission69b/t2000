// ---------------------------------------------------------------------------
// sse-format-adapter.ts — UIMessageStreamPart → legacy SSEEvent translator
// ---------------------------------------------------------------------------
//
// SPEC 37 v0.7a Phase 0 deliverable 1 (R8 — second half). Lands the
// translator that lets Phase 5 swap the engine's streaming layer to
// `createUIMessageStream` (AI SDK's standard UI protocol) WITHOUT changing
// the wire bytes that `audric/web` parses today.
//
// Why this module exists
// ----------------------
// Today (v0.5x) the engine emits `EngineEvent` from its outer agent loop
// and `streaming.ts:engineToSSE` serialises directly to legacy SSE bytes.
// In Phase 5 we replace the streaming layer with `createUIMessageStream`,
// which produces a typed `UIMessageStreamPart` sequence (text-delta,
// reasoning-delta, tool-input-available, tool-output-available, plus the
// `data-{name}` side-channel that carries canvas/pending_action/etc).
//
// This adapter is the seam: `bridgeUIMessageStream(parts)` consumes
// UIMessageStreamPart and yields legacy `SSEEvent` instances, which can
// then be passed to `serializeSSE` (already the sole wire-format
// authority) to produce identical bytes.
//
// Net effect on `audric/web`: ZERO change. The SSE consumer in
// `apps/web/hooks/useEngine.ts:processSSEChunk` parses the same byte
// stream pre- and post-Phase 5.
//
// Removed in v0.7b
// ----------------
// When `audric/web` migrates to native AI SDK UI protocol consumption
// (the documented `useChat` hook), this adapter becomes dead code and
// gets deleted. Until then it is the load-bearing compatibility shim.
//
// What this adapter IS
// --------------------
// • Stateful per-stream translator — same block-index counter +
//   eval_summary buffer pattern as `event-bridge.ts`.
// • The sole consumer of the AI-SDK-native UIMessage stream that the
//   Phase-5 engine surface produces.
// • Reuses `serializeSSE` from `streaming.ts` — the wire format itself
//   stays where it always lived; this adapter only normalises shape.
// • Handles engine side-channel events via the `data-{name}` convention
//   (`data-canvas`, `data-pending-action`, `data-todo-update`,
//   `data-proactive-text`, `data-harness-shape`, `data-stream-state`,
//   `data-tool-progress`, `data-pending-input`, `data-compaction`).
//   Phase-5 engine code writes these via `writer.write({ type:
//   'data-canvas', data: { template, data, title, toolUseId } })`.
//
// What this adapter IS NOT
// ------------------------
// • It does NOT introduce any new wire bytes. Every emitted SSEEvent
//   was already a documented variant in `streaming.ts:SSEEvent`. The
//   adapter's contract is byte-equivalence with the legacy path.
// • It does NOT translate to wire bytes itself — callers wrap with
//   `serializeSSE` (or use the `bridgeUIMessageStreamToSSE` convenience
//   generator). Keeping serialisation in one place protects the
//   wire-format SSOT.
// • It does NOT do permission gating, guard injection, or any
//   orchestration. Phase 5's engine code is responsible for putting
//   the right `data-{name}` parts onto the stream in the right order.
//
// Test contract
// -------------
// `sse-format-adapter.test.ts` covers:
//   • Every UIMessageStreamPart maps to the expected SSEEvent.
//   • Wire-byte equivalence: a fixture UIMessage stream produces
//     IDENTICAL bytes to the same logical turn run through the legacy
//     EngineEvent → serializeSSE path.
//   • Engine side-channel `data-{name}` parts route to the right
//     SSEEvent variant.
//   • Block-index tracking matches event-bridge.ts behaviour.
//   • <eval_summary> parser fires on reasoning-end (same parser
//     instance, same outputs).
//   • Error normalisation (UIMessage error parts carry `errorText`).
//   • Coverage on read tool, write tool, multi-tool, pending-action,
//     error, reasoning-only, canvas turns.
// ---------------------------------------------------------------------------

import { parseEvalSummary } from '../eval-summary.js';
import { serializeSSE, type SSEEvent } from '../streaming.js';
import type { PendingAction, TodoItem, HarnessShape } from '../types.js';
import type { ProactiveType } from '../proactive-marker.js';
import type { FormSchema } from '../pending-input.js';
import type { AISDKFinishReason, UIMessageStreamPart } from './ai-sdk-types.js';
import { mapFinishReason } from './event-bridge.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Translate a `createUIMessageStream` UIMessage part stream into the
 * legacy `SSEEvent` sequence that `serializeSSE` consumes. Phase-5
 * compatibility shim — see file header for the full contract.
 *
 * Stateless from the caller's perspective; the generator owns its own
 * per-stream state (block-index counters, accumulating reasoning text
 * for the eval_summary parser, tool-name carry across input/output).
 */
export async function* bridgeUIMessageStream(
  parts: AsyncIterable<UIMessageStreamPart>,
): AsyncGenerator<SSEEvent> {
  const state = createAdapterState();
  for await (const part of parts) {
    for (const ev of translatePart(part, state)) yield ev;
  }
}

/**
 * Convenience: same as `bridgeUIMessageStream` composed with
 * `serializeSSE`. Yields wire bytes ready for an SSE response. Phase-5
 * route handlers (e.g. audric's `/api/engine/chat`) plug this in
 * exactly where `engineToSSE` plugs in today.
 */
export async function* bridgeUIMessageStreamToSSE(
  parts: AsyncIterable<UIMessageStreamPart>,
): AsyncGenerator<string> {
  for await (const ev of bridgeUIMessageStream(parts)) {
    yield serializeSSE(ev);
  }
}

// ---------------------------------------------------------------------------
// Per-event translator (also exported for tests)
// ---------------------------------------------------------------------------

export function translatePart(
  part: UIMessageStreamPart,
  state: AdapterState,
): SSEEvent[] {
  switch (part.type) {
    case 'start':
    case 'start-step':
    case 'finish-step':
    case 'text-start':
    case 'text-end':
    case 'tool-input-start':
    case 'tool-input-delta':
    case 'message-metadata':
    case 'source-url':
    case 'source-document':
    case 'file':
    // ─── v6-only event types ──────────────────────────────────────
    // The following arrived in AI SDK v6 alongside `tool-approval-*`
    // and the explicit input/denial flow. v0.7a defers their
    // surfacing to audric/web because the engine's own
    // `pending_action` flow already carries the analogous semantics
    // (and adds attemptId, modifiableFields, guardInjections that
    // upstream doesn't model). When v0.7b removes the SSE adapter,
    // hosts can adopt the upstream events directly.
    case 'tool-input-error':
    case 'tool-approval-request':
    case 'tool-output-denied':
    case 'abort':
      return [];

    case 'reasoning-start': {
      state.reasoningTextById.set(part.id, '');
      if (!state.blockIndexById.has(part.id)) {
        state.blockIndexById.set(part.id, state.nextReasoningBlockIndex);
        state.nextReasoningBlockIndex += 1;
      }
      return [];
    }

    case 'reasoning-delta': {
      const blockIndex =
        state.blockIndexById.get(part.id) ?? assignReasoningIndex(state, part.id);
      state.reasoningTextById.set(
        part.id,
        (state.reasoningTextById.get(part.id) ?? '') + part.delta,
      );
      return [{ type: 'thinking_delta', text: part.delta, blockIndex }];
    }

    case 'reasoning-end': {
      const blockIndex =
        state.blockIndexById.get(part.id) ?? assignReasoningIndex(state, part.id);
      const fullText = state.reasoningTextById.get(part.id) ?? '';
      const signature = extractAnthropicSignature(part.providerMetadata);
      const evalParse = parseEvalSummary(fullText);
      const ev: Extract<SSEEvent, { type: 'thinking_done' }> = {
        type: 'thinking_done',
        blockIndex,
        ...(signature !== undefined ? { signature } : {}),
        ...(evalParse !== null
          ? { summaryMode: evalParse.summaryMode, evaluationItems: evalParse.evaluationItems }
          : {}),
      };
      state.reasoningTextById.delete(part.id);
      return [ev];
    }

    case 'text-delta':
      return [{ type: 'text_delta', text: part.delta }];

    case 'tool-input-available':
      state.toolNameByCallId.set(part.toolCallId, part.toolName);
      return [
        {
          type: 'tool_start',
          toolName: part.toolName,
          toolUseId: part.toolCallId,
          input: part.input,
          source: 'llm',
        },
      ];

    case 'tool-output-available': {
      const toolName = state.toolNameByCallId.get(part.toolCallId) ?? '';
      return [
        {
          type: 'tool_result',
          toolName,
          toolUseId: part.toolCallId,
          result: part.output,
          isError: false,
          source: 'llm',
        },
      ];
    }

    case 'tool-output-error': {
      const toolName = state.toolNameByCallId.get(part.toolCallId) ?? '';
      return [
        {
          type: 'tool_result',
          toolName,
          toolUseId: part.toolCallId,
          result: part.errorText,
          isError: true,
          source: 'llm',
        },
      ];
    }

    case 'finish':
      // v6 UIMessageChunk carries `finishReason?: FinishReason` AT TOP
      // LEVEL on the finish part. `messageMetadata` is host-defined
      // bag — Phase-5 engine code drops `usage` onto it (and
      // optionally a `stopReason` override; precedence: top-level
      // `finishReason` wins, then host metadata `stopReason`, then
      // 'end_turn' default). Token counts only come from
      // `messageMetadata.usage` because v6 doesn't surface them on
      // the finish chunk itself.
      return finishToSSEEvents({
        finishReason: part.finishReason,
        messageMetadata: part.messageMetadata,
      });

    case 'error':
      return [{ type: 'error', message: part.errorText }];

    default:
      // Custom data parts: `data-{name}`. Engine side-channel events.
      if (typeof part.type === 'string' && part.type.startsWith('data-')) {
        return translateDataPart(part);
      }
      return [];
  }
}

// ---------------------------------------------------------------------------
// data-{name} dispatch — engine side-channel events
// ---------------------------------------------------------------------------

function translateDataPart(part: UIMessageStreamPart): SSEEvent[] {
  // Type-narrow defensively — we already checked `startsWith('data-')`.
  if (!('data' in part) || typeof part.type !== 'string') return [];
  const dataName = part.type.slice('data-'.length);
  const data = part.data;

  switch (dataName) {
    case 'pending-action':
      return [{ type: 'pending_action', action: data as PendingAction }];

    case 'canvas': {
      const c = data as { template: string; data: unknown; title: string; toolUseId: string };
      return [
        {
          type: 'canvas',
          template: c.template,
          data: c.data,
          title: c.title,
          toolUseId: c.toolUseId,
        },
      ];
    }

    case 'todo-update': {
      const t = data as { items: TodoItem[]; toolUseId: string };
      return [{ type: 'todo_update', items: t.items, toolUseId: t.toolUseId }];
    }

    case 'tool-progress': {
      const p = data as {
        toolUseId: string;
        toolName: string;
        message: string;
        pct?: number;
      };
      return [
        {
          type: 'tool_progress',
          toolUseId: p.toolUseId,
          toolName: p.toolName,
          message: p.message,
          ...(p.pct !== undefined ? { pct: p.pct } : {}),
        },
      ];
    }

    case 'proactive-text': {
      const pt = data as {
        proactiveType: ProactiveType;
        subjectKey: string;
        body: string;
        suppressed: boolean;
        markerCount: number;
      };
      return [
        {
          type: 'proactive_text',
          proactiveType: pt.proactiveType,
          subjectKey: pt.subjectKey,
          body: pt.body,
          suppressed: pt.suppressed,
          markerCount: pt.markerCount,
        },
      ];
    }

    case 'harness-shape': {
      const h = data as { shape: HarnessShape; rationale: string };
      return [{ type: 'harness_shape', shape: h.shape, rationale: h.rationale }];
    }

    case 'stream-state': {
      const s = data as {
        state: 'routing' | 'quoting' | 'confirming' | 'settling' | 'done';
      };
      return [{ type: 'stream_state', state: s.state }];
    }

    case 'pending-input': {
      const pi = data as {
        inputId: string;
        toolName: string;
        toolUseId: string;
        schema: FormSchema;
        description?: string;
        assistantContent: unknown[];
        completedResults: Array<{ toolUseId: string; content: string; isError: boolean }>;
      };
      return [
        {
          type: 'pending_input',
          inputId: pi.inputId,
          toolName: pi.toolName,
          toolUseId: pi.toolUseId,
          schema: pi.schema,
          ...(pi.description !== undefined ? { description: pi.description } : {}),
          assistantContent: pi.assistantContent,
          completedResults: pi.completedResults,
        },
      ];
    }

    case 'compaction':
      // Legacy SSEEvent omits `compaction` from the wire union (it's
      // engine-internal — telemetry-only on the host). Drop silently.
      return [];

    case 'error': {
      const e = data as { message: string };
      return [{ type: 'error', message: e.message }];
    }

    default:
      // Unknown data-{name} stream — silently drop. Forward-compatible
      // with Phase 5+ engine code that adds new side-channel events.
      return [];
  }
}

// ---------------------------------------------------------------------------
// Adapter state — opaque to callers
// ---------------------------------------------------------------------------

export interface AdapterState {
  blockIndexById: Map<string, number>;
  nextReasoningBlockIndex: number;
  reasoningTextById: Map<string, string>;
  toolNameByCallId: Map<string, string>;
}

export function createAdapterState(): AdapterState {
  return {
    blockIndexById: new Map(),
    nextReasoningBlockIndex: 0,
    reasoningTextById: new Map(),
    toolNameByCallId: new Map(),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function assignReasoningIndex(state: AdapterState, id: string): number {
  const idx = state.nextReasoningBlockIndex;
  state.nextReasoningBlockIndex += 1;
  state.blockIndexById.set(id, idx);
  return idx;
}

function extractAnthropicSignature(
  metadata: { anthropic?: Record<string, unknown> } | undefined,
): string | undefined {
  if (!metadata) return undefined;
  const anthropic = metadata.anthropic;
  if (!anthropic || typeof anthropic !== 'object') return undefined;
  const sig = (anthropic as Record<string, unknown>).signature;
  return typeof sig === 'string' ? sig : undefined;
}

/**
 * Translate the `finish` part's top-level `finishReason` + host
 * `messageMetadata` into the legacy (usage, turn_complete) pair.
 *
 * Phase-5 engine code SHOULD:
 *   1. Set `finishReason` at the top level of the finish part (v6
 *      native — feeds the upstream `useChat` hook for free).
 *   2. Pack token counts into `messageMetadata.usage`.
 *
 *      messageMetadata: {
 *        usage?: { inputTokens, outputTokens, cacheReadTokens?, cacheWriteTokens? },
 *        stopReason?: StopReason,  // optional override; top-level wins if both present
 *      }
 *
 * Both fields are optional — when absent we emit a single
 * `turn_complete` with `stopReason: 'end_turn'` (the historical
 * default). Top-level `finishReason` (when present) is mapped via
 * `mapFinishReason` to the engine's `StopReason` enum.
 *
 * Exported for tests so they can pin the contract.
 */
export function finishToSSEEvents(input: {
  finishReason?: AISDKFinishReason;
  messageMetadata?: unknown;
}): SSEEvent[] {
  const meta = (input.messageMetadata && typeof input.messageMetadata === 'object'
    ? input.messageMetadata
    : {}) as {
    stopReason?: SSEEvent extends { type: 'turn_complete'; stopReason: infer R } ? R : never;
    usage?: {
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
    };
  };
  const out: SSEEvent[] = [];
  if (meta.usage) {
    out.push({
      type: 'usage',
      inputTokens: meta.usage.inputTokens,
      outputTokens: meta.usage.outputTokens,
      ...(meta.usage.cacheReadTokens !== undefined
        ? { cacheReadTokens: meta.usage.cacheReadTokens }
        : {}),
      ...(meta.usage.cacheWriteTokens !== undefined
        ? { cacheWriteTokens: meta.usage.cacheWriteTokens }
        : {}),
    });
  }
  // Precedence: top-level finishReason → host stopReason → default.
  const stopReason = input.finishReason
    ? mapFinishReason(input.finishReason)
    : meta.stopReason ?? 'end_turn';
  out.push({ type: 'turn_complete', stopReason });
  return out;
}
