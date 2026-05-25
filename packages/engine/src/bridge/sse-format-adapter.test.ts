// ---------------------------------------------------------------------------
// sse-format-adapter.test.ts — full coverage + wire-byte equivalence
// ---------------------------------------------------------------------------
//
// SPEC 37 v0.7a Phase 0 deliverable 1 (R8 — second half). Acceptance:
//
//   • Every UIMessageStreamPart variant the adapter consumes maps to
//     the expected SSEEvent (or correctly drops to nothing).
//   • Wire-byte equivalence: a fixture UIMessage stream produces
//     IDENTICAL serialised bytes to the manual `for-await + serializeSSE`
//     EngineEvent path (which is what audric/web's chat + resume routes
//     do today since v1.4.2 / Spec G3 — the pre-v2.2.0 `engineToSSE`
//     adapter was the original equivalence target and was deleted in
//     Phase 5 Slice A; the contract this test pins is identical).
//     This is the load-bearing contract — it's how we know `audric/web`
//     doesn't notice when a Phase 5+ engine code path optionally emits
//     via `createUIMessageStream` instead of EngineEvent directly.
//   • Engine side-channel `data-{name}` parts route to the right
//     SSEEvent variant for all 7 categories (canvas, pending_action,
//     proactive_text, harness_shape, stream_state, tool_progress, error).
//   • Block-index tracking matches event-bridge.ts behaviour.
//   • <eval_summary> parser fires on reasoning-end.
//   • Error normalisation handles UIMessage-shaped error parts.
//   • finish/messageMetadata round-trip preserves usage + stopReason.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import {
  bridgeUIMessageStream,
  bridgeUIMessageStreamToSSE,
  createAdapterState,
  finishToSSEEvents,
  translatePart,
} from './sse-format-adapter.js';
import type { UIMessageStreamPart } from './ai-sdk-types.js';
import { serializeSSE, type SSEEvent } from '../streaming.js';
import type { PendingAction } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function* iterate<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) yield item;
}

async function collect<T>(gen: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of gen) out.push(item);
  return out;
}

function expectEvent<K extends SSEEvent['type']>(
  ev: SSEEvent | undefined,
  type: K,
): asserts ev is Extract<SSEEvent, { type: K }> {
  expect(ev).toBeDefined();
  expect(ev?.type).toBe(type);
}

// ---------------------------------------------------------------------------
// Suite 1 — passthrough / no-op
// ---------------------------------------------------------------------------

describe('sse-format-adapter — no-op part translation', () => {
  it('drops lifecycle parts with no engine equivalent', () => {
    const state = createAdapterState();
    const dropped: UIMessageStreamPart[] = [
      { type: 'start' },
      { type: 'start-step' },
      { type: 'finish-step' },
      { type: 'text-start', id: 't1' },
      { type: 'text-end', id: 't1' },
      { type: 'tool-input-start', toolCallId: 'c1', toolName: 'x' },
      { type: 'tool-input-delta', toolCallId: 'c1', inputTextDelta: '{"a' },
      { type: 'message-metadata', messageMetadata: {} },
      { type: 'source-url', sourceId: 's1', url: 'https://example.com' },
      {
        type: 'source-document',
        sourceId: 's2',
        mediaType: 'text/plain',
        title: 'doc',
      },
      { type: 'file', url: 'https://example.com/x.png', mediaType: 'image/png' },
    ];
    for (const part of dropped) {
      expect(translatePart(part, state)).toEqual([]);
    }
  });

  it('drops unknown data-{name} parts (forward-compat)', () => {
    const state = createAdapterState();
    const out = translatePart(
      { type: 'data-future-feature', data: { x: 1 } } as unknown as UIMessageStreamPart,
      state,
    );
    expect(out).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — text + reasoning translation
// ---------------------------------------------------------------------------

describe('sse-format-adapter — text and reasoning', () => {
  it('maps text-delta to text_delta', async () => {
    const out = await collect(
      bridgeUIMessageStream(
        iterate<UIMessageStreamPart>([
          { type: 'text-delta', id: 't1', delta: 'Hello' },
          { type: 'text-delta', id: 't1', delta: ' world' },
        ]),
      ),
    );
    expect(out).toEqual([
      { type: 'text_delta', text: 'Hello' },
      { type: 'text_delta', text: ' world' },
    ]);
  });

  it('stamps rising blockIndex across multiple reasoning blocks', async () => {
    const out = await collect(
      bridgeUIMessageStream(
        iterate<UIMessageStreamPart>([
          { type: 'reasoning-start', id: 'r1' },
          { type: 'reasoning-delta', id: 'r1', delta: 'a' },
          { type: 'reasoning-end', id: 'r1' },
          { type: 'reasoning-start', id: 'r2' },
          { type: 'reasoning-delta', id: 'r2', delta: 'b' },
          { type: 'reasoning-end', id: 'r2' },
        ]),
      ),
    );
    const indices = out
      .filter((e) => e.type === 'thinking_delta' || e.type === 'thinking_done')
      .map((e) => (e as { blockIndex: number }).blockIndex);
    expect(indices).toEqual([0, 0, 1, 1]);
  });

  it('extracts Anthropic signature from providerMetadata', async () => {
    const out = await collect(
      bridgeUIMessageStream(
        iterate<UIMessageStreamPart>([
          { type: 'reasoning-start', id: 'r1' },
          { type: 'reasoning-delta', id: 'r1', delta: 'thought' },
          {
            type: 'reasoning-end',
            id: 'r1',
            providerMetadata: { anthropic: { signature: 'sig-99' } },
          },
        ]),
      ),
    );
    const done = out.find((e) => e.type === 'thinking_done');
    expectEvent(done, 'thinking_done');
    expect(done.signature).toBe('sig-99');
  });

  it('runs <eval_summary> parser on reasoning-end accumulated text', async () => {
    const chunks = [
      'Plan:\n',
      '<eval_summary>\n{\n  "items": [\n',
      '    { "label": "HF", "status": "good", "note": "OK" }\n',
      '  ]\n}\n</eval_summary>',
    ];
    const out = await collect(
      bridgeUIMessageStream(
        iterate<UIMessageStreamPart>([
          { type: 'reasoning-start', id: 'r1' },
          ...chunks.map(
            (delta): UIMessageStreamPart => ({ type: 'reasoning-delta', id: 'r1', delta }),
          ),
          { type: 'reasoning-end', id: 'r1' },
        ]),
      ),
    );
    const done = out.find((e) => e.type === 'thinking_done');
    expectEvent(done, 'thinking_done');
    expect(done.summaryMode).toBe(true);
    expect(done.evaluationItems).toHaveLength(1);
    expect(done.evaluationItems?.[0]).toMatchObject({ label: 'HF', status: 'good' });
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — tool calls
// ---------------------------------------------------------------------------

describe('sse-format-adapter — tool calls', () => {
  it('maps tool-input-available to tool_start with source: llm', async () => {
    const out = await collect(
      bridgeUIMessageStream(
        iterate<UIMessageStreamPart>([
          {
            type: 'tool-input-available',
            toolCallId: 'c1',
            toolName: 'balance_check',
            input: { address: '0xabc' },
          },
        ]),
      ),
    );
    expect(out).toEqual([
      {
        type: 'tool_start',
        toolName: 'balance_check',
        toolUseId: 'c1',
        input: { address: '0xabc' },
        source: 'llm',
      },
    ]);
  });

  it('carries toolName from tool-input-available to tool-output-available', async () => {
    const out = await collect(
      bridgeUIMessageStream(
        iterate<UIMessageStreamPart>([
          {
            type: 'tool-input-available',
            toolCallId: 'c1',
            toolName: 'rates_info',
            input: {},
          },
          {
            type: 'tool-output-available',
            toolCallId: 'c1',
            output: { apy: 4.5 },
          },
        ]),
      ),
    );
    const result = out[1];
    expectEvent(result, 'tool_result');
    expect(result.toolName).toBe('rates_info');
    expect(result.isError).toBe(false);
    expect(result.result).toEqual({ apy: 4.5 });
  });

  it('maps tool-output-error to tool_result with isError: true', async () => {
    const out = await collect(
      bridgeUIMessageStream(
        iterate<UIMessageStreamPart>([
          {
            type: 'tool-input-available',
            toolCallId: 'c2',
            toolName: 'volo_stats',
            input: {},
          },
          { type: 'tool-output-error', toolCallId: 'c2', errorText: 'rate-limited' },
        ]),
      ),
    );
    const result = out[1];
    expectEvent(result, 'tool_result');
    expect(result.isError).toBe(true);
    expect(result.result).toBe('rate-limited');
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — finish + usage round-trip
// ---------------------------------------------------------------------------

describe('sse-format-adapter — finish/usage', () => {
  it('emits usage then turn_complete when messageMetadata carries both', async () => {
    const out = await collect(
      bridgeUIMessageStream(
        iterate<UIMessageStreamPart>([
          {
            type: 'finish',
            messageMetadata: {
              stopReason: 'tool_use',
              usage: { inputTokens: 100, outputTokens: 200, cacheReadTokens: 50 },
            },
          },
        ]),
      ),
    );
    expect(out).toHaveLength(2);
    const usage = out[0];
    expectEvent(usage, 'usage');
    expect(usage.inputTokens).toBe(100);
    expect(usage.outputTokens).toBe(200);
    expect(usage.cacheReadTokens).toBe(50);
    const done = out[1];
    expectEvent(done, 'turn_complete');
    expect(done.stopReason).toBe('tool_use');
  });

  it('falls back to end_turn + no usage when metadata is empty', async () => {
    const out = await collect(
      bridgeUIMessageStream(iterate<UIMessageStreamPart>([{ type: 'finish' }])),
    );
    expect(out).toEqual([{ type: 'turn_complete', stopReason: 'end_turn' }]);
  });

  it('finishToSSEEvents preserves cacheWriteTokens when present', () => {
    const out = finishToSSEEvents({
      finishReason: 'stop',
      messageMetadata: {
        usage: {
          inputTokens: 1,
          outputTokens: 2,
          cacheReadTokens: 3,
          cacheWriteTokens: 4,
        },
      },
    });
    const usage = out[0];
    expectEvent(usage, 'usage');
    expect(usage.cacheWriteTokens).toBe(4);
  });

  it('finishToSSEEvents — top-level finishReason wins over host stopReason override (v6 precedence)', () => {
    const out = finishToSSEEvents({
      finishReason: 'tool-calls',
      messageMetadata: { stopReason: 'end_turn' },
    });
    const done = out[out.length - 1];
    expectEvent(done, 'turn_complete');
    expect(done.stopReason).toBe('tool_use');
  });

  it('finishToSSEEvents — falls back to host stopReason when top-level finishReason absent', () => {
    const out = finishToSSEEvents({
      messageMetadata: { stopReason: 'tool_use' },
    });
    const done = out[out.length - 1];
    expectEvent(done, 'turn_complete');
    expect(done.stopReason).toBe('tool_use');
  });

  it('finishToSSEEvents — defaults to end_turn when nothing is provided', () => {
    const out = finishToSSEEvents({});
    expect(out).toEqual([{ type: 'turn_complete', stopReason: 'end_turn' }]);
  });

  it('end-to-end finish with v6-shaped chunk (top-level finishReason)', async () => {
    const out = await collect(
      bridgeUIMessageStream(
        iterate<UIMessageStreamPart>([
          {
            type: 'finish',
            finishReason: 'tool-calls',
            messageMetadata: {
              usage: { inputTokens: 50, outputTokens: 25 },
            },
          },
        ]),
      ),
    );
    expect(out).toHaveLength(2);
    const usage = out[0];
    expectEvent(usage, 'usage');
    expect(usage.inputTokens).toBe(50);
    const done = out[1];
    expectEvent(done, 'turn_complete');
    expect(done.stopReason).toBe('tool_use');
  });
});

// ---------------------------------------------------------------------------
// Suite 5 — error normalisation
// ---------------------------------------------------------------------------

describe('sse-format-adapter — error', () => {
  it('maps error part to SSE error with the errorText as message', async () => {
    const out = await collect(
      bridgeUIMessageStream(
        iterate<UIMessageStreamPart>([{ type: 'error', errorText: 'rate-limited' }]),
      ),
    );
    expect(out).toEqual([{ type: 'error', message: 'rate-limited' }]);
  });
});

// ---------------------------------------------------------------------------
// Suite 6 — engine side-channel (data-{name}) dispatch
// ---------------------------------------------------------------------------

describe('sse-format-adapter — data-{name} side-channel dispatch', () => {
  it('routes data-canvas → canvas SSEEvent', async () => {
    const out = await collect(
      bridgeUIMessageStream(
        iterate<UIMessageStreamPart>([
          {
            type: 'data-canvas',
            data: {
              template: 'health-meter',
              data: { hf: 1.85 },
              title: 'Health',
              toolUseId: 'c1',
            },
          },
        ]),
      ),
    );
    expect(out).toEqual([
      {
        type: 'canvas',
        template: 'health-meter',
        data: { hf: 1.85 },
        title: 'Health',
        toolUseId: 'c1',
      },
    ]);
  });

  it('routes data-pending-action → pending_action SSEEvent (preserves attemptId)', async () => {
    const action: PendingAction = {
      toolName: 'save_deposit',
      toolUseId: 'c1',
      input: { amount: 50, asset: 'USDC' },
      description: 'Save 50 USDC',
      assistantContent: [],
      turnIndex: 1,
      attemptId: '11111111-2222-3333-4444-555555555555',
    };
    const out = await collect(
      bridgeUIMessageStream(
        iterate<UIMessageStreamPart>([{ type: 'data-pending-action', data: action }]),
      ),
    );
    expectEvent(out[0], 'pending_action');
    expect(out[0].action.attemptId).toBe('11111111-2222-3333-4444-555555555555');
    expect(out[0].action.toolName).toBe('save_deposit');
  });

  it('routes data-tool-progress → tool_progress SSEEvent (with optional pct)', async () => {
    const out = await collect(
      bridgeUIMessageStream(
        iterate<UIMessageStreamPart>([
          {
            type: 'data-tool-progress',
            data: {
              toolUseId: 'c1',
              toolName: 'swap_execute',
              message: 'Routing through Cetus…',
              pct: 30,
            },
          },
          {
            type: 'data-tool-progress',
            data: {
              toolUseId: 'c1',
              toolName: 'swap_execute',
              message: 'Quote in hand',
            },
          },
        ]),
      ),
    );
    expectEvent(out[0], 'tool_progress');
    expect(out[0].pct).toBe(30);
    expectEvent(out[1], 'tool_progress');
    expect(out[1].pct).toBeUndefined();
  });

  it('routes data-proactive-text → proactive_text SSEEvent', async () => {
    const out = await collect(
      bridgeUIMessageStream(
        iterate<UIMessageStreamPart>([
          {
            type: 'data-proactive-text',
            data: {
              proactiveType: 'idle_balance',
              subjectKey: 'USDC',
              body: '$120 idle',
              suppressed: false,
              markerCount: 1,
            },
          },
        ]),
      ),
    );
    expectEvent(out[0], 'proactive_text');
    expect(out[0].proactiveType).toBe('idle_balance');
    expect(out[0].suppressed).toBe(false);
  });

  it('routes data-harness-shape → harness_shape SSEEvent', async () => {
    const out = await collect(
      bridgeUIMessageStream(
        iterate<UIMessageStreamPart>([
          {
            type: 'data-harness-shape',
            data: { shape: 'rich', rationale: 'borrow keyword + prior writes' },
          },
        ]),
      ),
    );
    expectEvent(out[0], 'harness_shape');
    expect(out[0].shape).toBe('rich');
    expect(out[0].rationale).toContain('borrow');
  });

  it('routes data-stream-state → stream_state SSEEvent', async () => {
    const out = await collect(
      bridgeUIMessageStream(
        iterate<UIMessageStreamPart>([
          { type: 'data-stream-state', data: { state: 'routing' } },
          { type: 'data-stream-state', data: { state: 'quoting' } },
        ]),
      ),
    );
    expect(out.map((e) => (e as { state: string }).state)).toEqual(['routing', 'quoting']);
  });

  it('drops data-compaction (telemetry-only, no wire bytes)', async () => {
    const out = await collect(
      bridgeUIMessageStream(
        iterate<UIMessageStreamPart>([{ type: 'data-compaction', data: {} }]),
      ),
    );
    expect(out).toEqual([]);
  });

  it('routes data-error → error SSEEvent', async () => {
    const out = await collect(
      bridgeUIMessageStream(
        iterate<UIMessageStreamPart>([{ type: 'data-error', data: { message: 'boom' } }]),
      ),
    );
    expect(out).toEqual([{ type: 'error', message: 'boom' }]);
  });
});

// ---------------------------------------------------------------------------
// Suite 7 — wire-byte equivalence (the load-bearing contract)
// ---------------------------------------------------------------------------
//
// Each fixture defines:
//   • a UIMessageStreamPart[] sequence (the Phase-5 path input)
//   • the equivalent SSEEvent[] sequence (what the legacy path emits
//     for the same logical turn)
//
// The contract: bridgeUIMessageStreamToSSE(parts) must produce the
// same wire bytes as `parts.flatMap(legacyPath).map(serializeSSE).join('')`.
//
// If this test fails, audric/web's `processSSEChunk` will see different
// bytes after Phase 5 — the rollout is broken.
// ---------------------------------------------------------------------------

interface FixtureCase {
  name: string;
  parts: UIMessageStreamPart[];
  expected: SSEEvent[];
}

function bytesFromSSEEvents(events: SSEEvent[]): string {
  return events.map(serializeSSE).join('');
}

const FIXTURES: FixtureCase[] = [
  {
    name: 'read-only turn (balance_check)',
    parts: [
      { type: 'start' },
      { type: 'start-step' },
      { type: 'text-delta', id: 't1', delta: 'Checking your balance.' },
      {
        type: 'tool-input-available',
        toolCallId: 'c1',
        toolName: 'balance_check',
        input: { address: '0xabc' },
      },
      {
        type: 'tool-output-available',
        toolCallId: 'c1',
        output: { saveableUsdc: '120.00', wallet: { USDC: 120 } },
      },
      { type: 'text-delta', id: 't1', delta: ' You hold $120 USDC.' },
      { type: 'finish-step' },
      {
        type: 'finish',
        messageMetadata: {
          stopReason: 'end_turn',
          usage: { inputTokens: 1500, outputTokens: 80, cacheReadTokens: 1200 },
        },
      },
    ],
    expected: [
      { type: 'text_delta', text: 'Checking your balance.' },
      {
        type: 'tool_start',
        toolName: 'balance_check',
        toolUseId: 'c1',
        input: { address: '0xabc' },
        source: 'llm',
      },
      {
        type: 'tool_result',
        toolName: 'balance_check',
        toolUseId: 'c1',
        result: { saveableUsdc: '120.00', wallet: { USDC: 120 } },
        isError: false,
        source: 'llm',
      },
      { type: 'text_delta', text: ' You hold $120 USDC.' },
      {
        type: 'usage',
        inputTokens: 1500,
        outputTokens: 80,
        cacheReadTokens: 1200,
      },
      { type: 'turn_complete', stopReason: 'end_turn' },
    ],
  },
  {
    name: 'write turn yielding pending_action with attemptId (Item 3)',
    parts: [
      { type: 'reasoning-start', id: 'r1' },
      { type: 'reasoning-delta', id: 'r1', delta: 'User wants 50 USDC saved. HF OK.' },
      { type: 'reasoning-end', id: 'r1' },
      { type: 'text-delta', id: 't1', delta: "I'll save 50 USDC." },
      {
        type: 'tool-input-available',
        toolCallId: 'c1',
        toolName: 'save_deposit',
        input: { amount: 50, asset: 'USDC' },
      },
      {
        type: 'data-pending-action',
        data: {
          toolName: 'save_deposit',
          toolUseId: 'c1',
          input: { amount: 50, asset: 'USDC' },
          description: 'Save 50 USDC into NAVI',
          assistantContent: [],
          turnIndex: 0,
          attemptId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        } satisfies PendingAction,
      },
      {
        type: 'finish',
        messageMetadata: {
          stopReason: 'tool_use',
          usage: { inputTokens: 4000, outputTokens: 600, cacheReadTokens: 3500 },
        },
      },
    ],
    expected: [
      { type: 'thinking_delta', text: 'User wants 50 USDC saved. HF OK.', blockIndex: 0 },
      { type: 'thinking_done', blockIndex: 0 },
      { type: 'text_delta', text: "I'll save 50 USDC." },
      {
        type: 'tool_start',
        toolName: 'save_deposit',
        toolUseId: 'c1',
        input: { amount: 50, asset: 'USDC' },
        source: 'llm',
      },
      {
        type: 'pending_action',
        action: {
          toolName: 'save_deposit',
          toolUseId: 'c1',
          input: { amount: 50, asset: 'USDC' },
          description: 'Save 50 USDC into NAVI',
          assistantContent: [],
          turnIndex: 0,
          attemptId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        },
      },
      {
        type: 'usage',
        inputTokens: 4000,
        outputTokens: 600,
        cacheReadTokens: 3500,
      },
      { type: 'turn_complete', stopReason: 'tool_use' },
    ],
  },
  {
    name: 'multi-tool read turn (parallel reads)',
    parts: [
      {
        type: 'tool-input-available',
        toolCallId: 'c1',
        toolName: 'balance_check',
        input: {},
      },
      {
        type: 'tool-input-available',
        toolCallId: 'c2',
        toolName: 'rates_info',
        input: {},
      },
      { type: 'tool-output-available', toolCallId: 'c2', output: { apy: 4.5 } },
      { type: 'tool-output-available', toolCallId: 'c1', output: { usdc: 120 } },
      { type: 'finish', messageMetadata: { stopReason: 'tool_use' } },
    ],
    expected: [
      {
        type: 'tool_start',
        toolName: 'balance_check',
        toolUseId: 'c1',
        input: {},
        source: 'llm',
      },
      {
        type: 'tool_start',
        toolName: 'rates_info',
        toolUseId: 'c2',
        input: {},
        source: 'llm',
      },
      {
        type: 'tool_result',
        toolName: 'rates_info',
        toolUseId: 'c2',
        result: { apy: 4.5 },
        isError: false,
        source: 'llm',
      },
      {
        type: 'tool_result',
        toolName: 'balance_check',
        toolUseId: 'c1',
        result: { usdc: 120 },
        isError: false,
        source: 'llm',
      },
      { type: 'turn_complete', stopReason: 'tool_use' },
    ],
  },
  {
    name: 'tool error turn',
    parts: [
      {
        type: 'tool-input-available',
        toolCallId: 'c1',
        toolName: 'rates_info',
        input: {},
      },
      { type: 'tool-output-error', toolCallId: 'c1', errorText: 'NAVI MCP timed out' },
      { type: 'finish', messageMetadata: { stopReason: 'end_turn' } },
    ],
    expected: [
      {
        type: 'tool_start',
        toolName: 'rates_info',
        toolUseId: 'c1',
        input: {},
        source: 'llm',
      },
      {
        type: 'tool_result',
        toolName: 'rates_info',
        toolUseId: 'c1',
        result: 'NAVI MCP timed out',
        isError: true,
        source: 'llm',
      },
      { type: 'turn_complete', stopReason: 'end_turn' },
    ],
  },
  {
    name: 'reasoning-only turn (no tools)',
    parts: [
      { type: 'reasoning-start', id: 'r1' },
      { type: 'reasoning-delta', id: 'r1', delta: 'Thinking…' },
      {
        type: 'reasoning-end',
        id: 'r1',
        providerMetadata: { anthropic: { signature: 'sig-1' } },
      },
      { type: 'text-delta', id: 't1', delta: 'Here is what I think.' },
      { type: 'finish', messageMetadata: { stopReason: 'end_turn' } },
    ],
    expected: [
      { type: 'thinking_delta', text: 'Thinking…', blockIndex: 0 },
      { type: 'thinking_done', blockIndex: 0, signature: 'sig-1' },
      { type: 'text_delta', text: 'Here is what I think.' },
      { type: 'turn_complete', stopReason: 'end_turn' },
    ],
  },
  {
    name: 'canvas turn (engine side-channel)',
    parts: [
      {
        type: 'tool-input-available',
        toolCallId: 'c1',
        toolName: 'health_check',
        input: {},
      },
      { type: 'tool-output-available', toolCallId: 'c1', output: { hf: 1.85 } },
      {
        type: 'data-canvas',
        data: {
          template: 'health-meter',
          data: { hf: 1.85 },
          title: 'Health Factor',
          toolUseId: 'c1',
        },
      },
      { type: 'finish', messageMetadata: { stopReason: 'end_turn' } },
    ],
    expected: [
      {
        type: 'tool_start',
        toolName: 'health_check',
        toolUseId: 'c1',
        input: {},
        source: 'llm',
      },
      {
        type: 'tool_result',
        toolName: 'health_check',
        toolUseId: 'c1',
        result: { hf: 1.85 },
        isError: false,
        source: 'llm',
      },
      {
        type: 'canvas',
        template: 'health-meter',
        data: { hf: 1.85 },
        title: 'Health Factor',
        toolUseId: 'c1',
      },
      { type: 'turn_complete', stopReason: 'end_turn' },
    ],
  },
];

describe('sse-format-adapter — wire-byte equivalence', () => {
  for (const { name, parts, expected } of FIXTURES) {
    it(`${name}: produces SSEEvent sequence matching legacy path`, async () => {
      const actualEvents = await collect(bridgeUIMessageStream(iterate(parts)));
      expect(actualEvents).toEqual(expected);
    });

    it(`${name}: produces wire bytes byte-equivalent to legacy serializeSSE`, async () => {
      const actualBytes = (await collect(bridgeUIMessageStreamToSSE(iterate(parts)))).join('');
      const expectedBytes = bytesFromSSEEvents(expected);
      expect(actualBytes).toBe(expectedBytes);
    });
  }
});
