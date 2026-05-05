import type { EngineEvent, HarnessShape, PendingAction, StopReason, TodoItem } from './types.js';
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
  | { type: 'tool_start'; toolName: string; toolUseId: string; input: unknown }
  | {
      type: 'tool_result';
      toolName: string;
      toolUseId: string;
      result: unknown;
      isError: boolean;
      // [v1.4] flags carried through unchanged from EngineEvent.tool_result
      wasEarlyDispatched?: boolean;
      resultDeduped?: boolean;
      // [v1.5] true when injected by the engine's post-write refresh
      // (see EngineConfig.postWriteRefresh)
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
  // tools (Cetus swap_execute, protocol_deep_dive, portfolio_analysis).
  // Engine wiring lands with the Cetus integration in a follow-on slice.
  | { type: 'tool_progress'; toolUseId: string; toolName: string; message: string; pct?: number }
  // [SPEC 9 v0.1.3 P9.4] Inline-form structured input event. Engine
  // emits when a tool's preflight returns `needsInput`; host renders
  // a typed form against `schema.fields` and POSTs values back via
  // `/api/engine/resume-with-input`. Wire-compatible upgrade of the
  // SPEC 8 v0.5.1 D2 reservation — `schema` narrows from `unknown`
  // to `FormSchema`; the additional `toolName` / `toolUseId` /
  // `description` fields are new; the round-trip state stays
  // engine-internal (host stores it as-is in the session payload).
  | {
      type: 'pending_input';
      inputId: string;
      toolName: string;
      toolUseId: string;
      schema: FormSchema;
      description?: string;
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
  | { type: 'harness_shape'; shape: HarnessShape; rationale: string };

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

// ---------------------------------------------------------------------------
// Stream adapter: engine async generator → SSE text stream
// ---------------------------------------------------------------------------

export async function* engineToSSE(
  events: AsyncGenerator<EngineEvent>,
): AsyncGenerator<string> {
  for await (const event of events) {
    if (event.type === 'error') {
      yield serializeSSE({ type: 'error', message: event.error.message });
    } else {
      yield serializeSSE(event as SSEEvent);
    }
  }
}
