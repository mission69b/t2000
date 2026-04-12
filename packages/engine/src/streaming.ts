import type { EngineEvent, PendingAction, StopReason } from './types.js';

// ---------------------------------------------------------------------------
// SSE event format — serialisable subset of EngineEvent
// ---------------------------------------------------------------------------

export type SSEEvent =
  | { type: 'thinking_delta'; text: string }
  | { type: 'thinking_done'; signature?: string }
  | { type: 'text_delta'; text: string }
  | { type: 'tool_start'; toolName: string; toolUseId: string; input: unknown }
  | { type: 'tool_result'; toolName: string; toolUseId: string; result: unknown; isError: boolean }
  | { type: 'pending_action'; action: PendingAction }
  | { type: 'turn_complete'; stopReason: StopReason }
  | { type: 'usage'; inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number }
  | { type: 'error'; message: string }
  | { type: 'canvas'; template: string; data: unknown; title: string; toolUseId: string };

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
