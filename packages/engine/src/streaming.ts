// ---------------------------------------------------------------------------
// SPEC 37 v0.7a Phase 5 Slice A (2026-05-17, engine v2.2.0):
//
// This module is the wire-format SSOT only. The `engineToSSE` async-generator
// adapter that historically wrapped a `QueryEngine.submitMessage()` generator
// into an SSE byte stream was deleted in v2.2.0 — it had no live caller. The
// audric host's chat/resume routes iterate `EngineEvent` raw (per `audric/
// apps/web-v2/app/api/chat/route.ts`'s "v1.4.2 — Day 4 / Spec
// G3" switch to per-event collection + `serializeSSE`-per-event); CLI / MCP
// embed the engine in-process and never hit SSE. The legacy `withStreamState`
// wrapper that `engineToSSE` applied by default is still exported standalone
// from `index.ts` for hosts that want it.
//
// What stays:
//   - `SSEEvent` discriminated union — the wire-format type that audric's
//     SSE consumer (`useEngine.ts:processSSEChunk`) parses
//   - `serializeSSE(event) → string` — the canonical per-event wire emitter
//   - `parseSSE(raw) → SSEEvent | null` — the symmetric parser
//
// What got deleted in v2.2.0:
//   - `engineToSSE(events) → AsyncGenerator<string>` — pre-Phase-5 stream
//     adapter, no live caller. v2.0.0's AISDKEngine already emitted
//     EngineEvent directly via `streamText` + `bridge/event-bridge.ts`;
//     audric switched to raw-event iteration before this deletion.
// ---------------------------------------------------------------------------

import type { HarnessShape, PendingAction, StopReason, TodoItem } from './types.js';
import type { EvaluationItem } from './eval-summary.js';
import type { ProactiveType } from './proactive-marker.js';
import type { FormSchema } from './pending-input.js';

// ---------------------------------------------------------------------------
// SSE event format — serialisable subset of EngineEvent
// ---------------------------------------------------------------------------

export type SSEEvent =
  // [SPEC 8 v0.5.1] blockIndex identifies the thinking block this delta belongs to.
  | { type: 'thinking_delta'; text: string; blockIndex: number }
  | {
      type: 'thinking_done';
      blockIndex: number;
      signature?: string;
      // [SPEC 8 v0.5.1] HowIEvaluated block fields — populated when the
      // thinking text contained a parseable <eval_summary> marker.
      summaryMode?: boolean;
      evaluationItems?: EvaluationItem[];
    }
  | { type: 'text_delta'; text: string }
  | {
      type: 'tool_start';
      toolName: string;
      toolUseId: string;
      input: unknown;
      // [SPEC 23A-Q-source, 2026-05-11] Origin of this tool dispatch —
      // mirrors EngineEvent.tool_start.source. See types.ts for the full
      // contract; serialised verbatim through JSON.stringify in
      // `serializeSSE`.
      source?: 'pwr' | 'llm' | 'user';
    }
  | {
      type: 'tool_result';
      toolName: string;
      toolUseId: string;
      result: unknown;
      isError: boolean;
      // [SPEC 23A-Q-source, 2026-05-11] Mirrors EngineEvent.tool_result.source.
      source?: 'pwr' | 'llm' | 'user';
      // [v1.4] flags carried through unchanged from EngineEvent.tool_result
      wasEarlyDispatched?: boolean;
      resultDeduped?: boolean;
      // [v1.5 → DEPRECATED] true when injected by the engine's post-write
      // refresh (see EngineConfig.postWriteRefresh). Equivalent to
      // `source === 'pwr'`; remove in the next minor — see types.ts.
      wasPostWriteRefresh?: boolean;
      // [SPEC 8 v0.5.1 B3.2] HTTP attempt count — set only when > 1 so
      // hosts can render "TOOL · attempt N · 1.4s" without header noise
      // on the common single-attempt path.
      attemptCount?: number;
    }
  | { type: 'pending_action'; action: PendingAction }
  | { type: 'turn_complete'; stopReason: StopReason }
  | { type: 'usage'; inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number }
  | { type: 'error'; message: string }
  | { type: 'canvas'; template: string; data: unknown; title: string; toolUseId: string }
  // [SPEC 8 v0.5.1] todo_update side-channel event paired to every
  // update_todo tool call. Mirrors EngineEvent.todo_update.
  | { type: 'todo_update'; items: TodoItem[]; toolUseId: string }
  // [SPEC 8 v0.5.1] tool_progress mid-execution signal from long-running
  // tools (Cetus swap_execute, portfolio_analysis). Engine wiring lands
  // with the Cetus integration in a follow-on slice.
  | { type: 'tool_progress'; toolUseId: string; toolName: string; message: string; pct?: number }
  // [SPEC 9 v0.1.3 P9.4] Inline-form structured input event. Engine
  // emits when a tool's preflight returns `needsInput`; host renders
  // a typed form against `schema.fields` and POSTs values back via
  // `/api/engine/resume-with-input`. Wire-compatible upgrade of the
  // SPEC 8 v0.5.1 D2 reservation — `schema` narrows from `unknown`
  // to `FormSchema`; the additional `toolName` / `toolUseId` /
  // `description` fields are new; the round-trip state (`assistantContent`
  // / `completedResults`) is carried on the wire so stateless hosts
  // can persist + echo back on resume.
  | {
      type: 'pending_input';
      inputId: string;
      toolName: string;
      toolUseId: string;
      schema: FormSchema;
      description?: string;
      assistantContent: unknown[];
      completedResults: Array<{
        toolUseId: string;
        content: string;
        isError: boolean;
      }>;
    }
  // [SPEC 9 v0.1.1 P9.2] Proactive insight marker payload. Mirrors
  // EngineEvent.proactive_text — see types.ts for full contract. Hosts
  // apply `✦ ADDED BY AUDRIC` lockup styling on the text TimelineBlock
  // when `suppressed: false`; strip the wrapper and render plain text
  // when `suppressed: true` (per-session cooldown hit).
  | {
      type: 'proactive_text';
      proactiveType: ProactiveType;
      subjectKey: string;
      body: string;
      suppressed: boolean;
      markerCount: number;
    }
  // [SPEC 8 v0.5.1 B3.2] One-shot per-turn harness shape declaration.
  // Mirrors EngineEvent.harness_shape — see types.ts for full contract.
  | { type: 'harness_shape'; shape: HarnessShape; rationale: string }
  // [SPEC 21.1] Stream-state choreography event — typed transition signal
  // for UI motion ("Routing…" → "Quote in hand" → "Confirming…" → ...).
  // Mirrors EngineEvent.stream_state — see types.ts for the full contract,
  // including the routing/quoting (engine-emitted) vs confirming/settling/
  // done (audric-emitted) split.
  | {
      type: 'stream_state';
      state: 'routing' | 'quoting' | 'confirming' | 'settling' | 'done';
    }
  // [SPEC 37 v0.7a Phase 5 Slice C / engine v2.2.0] stream_started event
  // — emitted first when `EngineConfig.streamCheckpointStore` is wired.
  // Carries the engine-generated streamId so the host can persist it
  // and pass it back as `resumeStreamId` on a reconnect after page
  // reload / Vercel cold-start / mobile-tab swap. Mirrors
  // EngineEvent.stream_started; see types.ts for the full contract.
  | { type: 'stream_started'; streamId: string };

// ---------------------------------------------------------------------------
// Serialise: SSEEvent → SSE text
// ---------------------------------------------------------------------------

export function serializeSSE(event: SSEEvent): string {
  const data = JSON.stringify(event);
  return `event: ${event.type}\ndata: ${data}\n\n`;
}

// ---------------------------------------------------------------------------
// Deserialise: SSE text → SSEEvent
// ---------------------------------------------------------------------------

export function parseSSE(raw: string): SSEEvent | null {
  const dataLine = raw.split('\n').find((l) => l.startsWith('data: '));
  if (!dataLine) return null;
  try {
    return JSON.parse(dataLine.slice(6)) as SSEEvent;
  } catch {
    return null;
  }
}

// `engineToSSE` was deleted in v2.2.0 — see the file header for the deletion
// rationale. Hosts that want the SPEC 21.1 stream-state wrapper apply
// `withStreamState` directly (exported standalone from `@t2000/engine`).
