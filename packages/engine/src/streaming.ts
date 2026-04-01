import type { EngineEvent, StopReason } from './types.js';

// ---------------------------------------------------------------------------
// SSE event format — serialisable subset of EngineEvent
// ---------------------------------------------------------------------------

/**
 * Wire-safe representation of EngineEvent for SSE transport.
 * `permission_request` replaces the `resolve` callback with a `permissionId`
 * that the client sends back via a separate HTTP endpoint.
 */
export type SSEEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_start'; toolName: string; toolUseId: string; input: unknown }
  | { type: 'tool_result'; toolName: string; toolUseId: string; result: unknown; isError: boolean }
  | { type: 'permission_request'; permissionId: string; toolName: string; toolUseId: string; input: unknown; description: string }
  | { type: 'turn_complete'; stopReason: StopReason }
  | { type: 'usage'; inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number }
  | { type: 'error'; message: string };

// ---------------------------------------------------------------------------
// Serialise: EngineEvent → SSE text
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
// Permission bridge — maps permissionIds to resolve callbacks
// ---------------------------------------------------------------------------

export class PermissionBridge {
  private pending = new Map<string, (approved: boolean) => void>();
  private counter = 0;

  /**
   * Register a permission_request resolve callback.
   * Returns the permissionId to send to the client.
   */
  register(resolve: (approved: boolean) => void): string {
    const id = `perm_${++this.counter}_${Date.now()}`;
    this.pending.set(id, resolve);
    return id;
  }

  /**
   * Resolve a pending permission request from the client.
   * Returns false if the permissionId is unknown (expired or invalid).
   */
  resolve(permissionId: string, approved: boolean): boolean {
    const resolver = this.pending.get(permissionId);
    if (!resolver) return false;
    resolver(approved);
    this.pending.delete(permissionId);
    return true;
  }

  /** Number of pending (unresolved) permission requests. */
  get size(): number {
    return this.pending.size;
  }

  /** Reject all pending permissions (e.g., on disconnect). */
  rejectAll(): void {
    for (const resolver of this.pending.values()) {
      resolver(false);
    }
    this.pending.clear();
  }
}

// ---------------------------------------------------------------------------
// Stream adapter: engine async generator → SSE text stream
// ---------------------------------------------------------------------------

/**
 * Wraps a QueryEngine.submitMessage() generator, converting EngineEvents
 * to SSE text. Permission requests are routed through the bridge.
 */
export async function* engineToSSE(
  events: AsyncGenerator<EngineEvent>,
  bridge: PermissionBridge,
): AsyncGenerator<string> {
  for await (const event of events) {
    switch (event.type) {
      case 'permission_request': {
        const permissionId = bridge.register(event.resolve);
        yield serializeSSE({
          type: 'permission_request',
          permissionId,
          toolName: event.toolName,
          toolUseId: event.toolUseId,
          input: event.input,
          description: event.description,
        });
        break;
      }

      case 'error': {
        yield serializeSSE({
          type: 'error',
          message: event.error.message,
        });
        break;
      }

      default: {
        yield serializeSSE(event as SSEEvent);
        break;
      }
    }
  }
}
