// ---------------------------------------------------------------------------
// event-bridge.test.ts — full coverage of the v6 AI SDK → EngineEvent translator
// ---------------------------------------------------------------------------
//
// SPEC 37 v0.7a Phase 0 deliverables 1 (R8) + 5 (AI SDK pin). Acceptance:
//
//   • Every TextStreamPart variant the bridge consumes maps to the
//     expected EngineEvent (or correctly drops to nothing).
//   • Ordering preserved 1:1 through the bridge.
//   • Multiple thinking blocks stamp rising blockIndex.
//   • Anthropic provider-metadata signature flows through to
//     thinking_done.signature.
//   • <eval_summary> parser fires on reasoning-end when applicable.
//   • Finish-reason → StopReason mapping is exhaustive across v6's 6 values.
//   • Error envelope normalisation handles strings, objects, Errors,
//     null, circular refs.
//   • Usage normalisation handles v6's nested
//     inputTokenDetails.cacheReadTokens / cacheWriteTokens shape.
//   • abort with optional reason becomes an error envelope with a stable
//     message (reason interpolated when present).
//   • New v6 events (source, file, raw, tool-output-denied,
//     tool-input-end, tool-approval-request) silently drop.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import type { EngineEvent } from '../types.js';
import type { AISDKFinishReason, AISDKStreamEvent } from './ai-sdk-types.js';
import {
  bridgeAISDKStream,
  createBridgeState,
  mapFinishReason,
  translate,
} from './event-bridge.js';

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

function expectEvent<K extends EngineEvent['type']>(
  ev: EngineEvent | undefined,
  type: K,
): asserts ev is Extract<EngineEvent, { type: K }> {
  expect(ev).toBeDefined();
  expect(ev?.type).toBe(type);
}

/**
 * v6 LanguageModelUsage helper for fixtures. v6 uses `number | undefined`
 * (semantically "not measured" vs "zero"). Tests that need partial
 * usage shapes pass `undefined` explicitly for the missing fields.
 */
function usage(opts: {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
}): {
  inputTokens: number | undefined;
  inputTokenDetails: {
    noCacheTokens: number | undefined;
    cacheReadTokens: number | undefined;
    cacheWriteTokens: number | undefined;
  };
  outputTokens: number | undefined;
  outputTokenDetails: {
    textTokens: number | undefined;
    reasoningTokens: number | undefined;
  };
  totalTokens: number | undefined;
} {
  return {
    inputTokens: opts.inputTokens,
    inputTokenDetails: {
      noCacheTokens: undefined,
      cacheReadTokens: opts.cacheReadTokens,
      cacheWriteTokens: opts.cacheWriteTokens,
    },
    outputTokens: opts.outputTokens,
    outputTokenDetails: {
      textTokens: undefined,
      reasoningTokens: opts.reasoningTokens,
    },
    totalTokens: undefined,
  };
}

/** Minimal v6 finish event with no usage. */
function finishOnly(reason: AISDKFinishReason): AISDKStreamEvent {
  return {
    type: 'finish',
    finishReason: reason,
    rawFinishReason: undefined,
    totalUsage: usage({}),
  };
}

// ---------------------------------------------------------------------------
// Suite 1 — passthrough / no-op events
// ---------------------------------------------------------------------------

describe('bridgeAISDKStream — no-op event translation', () => {
  it('drops `start` events', () => {
    const state = createBridgeState();
    expect(translate({ type: 'start' }, state)).toEqual([]);
  });

  it('drops `start-step` and `finish-step` events', () => {
    const state = createBridgeState();
    expect(
      translate({ type: 'start-step', request: {}, warnings: [] }, state),
    ).toEqual([]);
    expect(
      translate(
        {
          type: 'finish-step',
          response: { id: 'r1', timestamp: new Date(), modelId: 'test' },
          usage: usage({ inputTokens: 1, outputTokens: 1 }),
          finishReason: 'stop',
          rawFinishReason: undefined,
          providerMetadata: undefined,
        },
        state,
      ),
    ).toEqual([]);
  });

  it('drops `text-start` and `text-end` events', () => {
    const state = createBridgeState();
    expect(translate({ type: 'text-start', id: 't1' }, state)).toEqual([]);
    expect(translate({ type: 'text-end', id: 't1' }, state)).toEqual([]);
  });

  it('drops `tool-input-*` events (start, delta, end)', () => {
    const state = createBridgeState();
    expect(
      translate({ type: 'tool-input-start', id: 'i1', toolName: 'foo' }, state),
    ).toEqual([]);
    expect(
      translate({ type: 'tool-input-delta', id: 'i1', delta: '{"a' }, state),
    ).toEqual([]);
    expect(translate({ type: 'tool-input-end', id: 'i1' }, state)).toEqual([]);
  });

  it('drops new v6 events (source, file, raw, tool-output-denied, tool-approval-request)', () => {
    const state = createBridgeState();
    const drops: AISDKStreamEvent[] = [
      { type: 'source', sourceType: 'url', id: 's1', url: 'https://example.com' } as AISDKStreamEvent,
      { type: 'raw', rawValue: { provider: 'anthropic', payload: {} } } as AISDKStreamEvent,
      {
        type: 'tool-output-denied',
        toolCallId: 'c1',
        toolName: 'foo',
      } as AISDKStreamEvent,
      {
        type: 'tool-approval-request',
        approvalId: 'a1',
        toolCall: {
          type: 'tool-call',
          toolCallId: 'c1',
          toolName: 'foo',
          input: {},
          dynamic: true,
        },
      } as AISDKStreamEvent,
    ];
    for (const part of drops) expect(translate(part, state)).toEqual([]);
  });

  it('silently drops unknown event types (forward-compat)', () => {
    const state = createBridgeState();
    expect(
      translate({ type: 'future-feature' } as unknown as AISDKStreamEvent, state),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — text deltas
// ---------------------------------------------------------------------------

describe('bridgeAISDKStream — text deltas', () => {
  it('maps text-delta to text_delta with the text field (v6 renames delta → text)', async () => {
    const events = await collect(
      bridgeAISDKStream(
        iterate<AISDKStreamEvent>([
          { type: 'text-start', id: 't1' },
          { type: 'text-delta', id: 't1', text: 'Hello' },
          { type: 'text-delta', id: 't1', text: ', world' },
          { type: 'text-end', id: 't1' },
        ]),
      ),
    );
    expect(events).toEqual([
      { type: 'text_delta', text: 'Hello' },
      { type: 'text_delta', text: ', world' },
    ]);
  });

  it('preserves order across interleaved text and reasoning', async () => {
    const events = await collect(
      bridgeAISDKStream(
        iterate<AISDKStreamEvent>([
          { type: 'reasoning-start', id: 'r1' },
          { type: 'reasoning-delta', id: 'r1', text: 'thinking 1' },
          { type: 'reasoning-end', id: 'r1' },
          { type: 'text-delta', id: 't1', text: 'a' },
          { type: 'reasoning-start', id: 'r2' },
          { type: 'reasoning-delta', id: 'r2', text: 'thinking 2' },
          { type: 'reasoning-end', id: 'r2' },
          { type: 'text-delta', id: 't1', text: 'b' },
        ]),
      ),
    );
    const types = events.map((e) => e.type);
    expect(types).toEqual([
      'thinking_delta',
      'thinking_done',
      'text_delta',
      'thinking_delta',
      'thinking_done',
      'text_delta',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — reasoning blocks (block index, signature, eval_summary)
// ---------------------------------------------------------------------------

describe('bridgeAISDKStream — reasoning blocks', () => {
  it('stamps rising blockIndex across multiple reasoning blocks', async () => {
    const events = await collect(
      bridgeAISDKStream(
        iterate<AISDKStreamEvent>([
          { type: 'reasoning-start', id: 'r1' },
          { type: 'reasoning-delta', id: 'r1', text: 'A' },
          { type: 'reasoning-end', id: 'r1' },
          { type: 'reasoning-start', id: 'r2' },
          { type: 'reasoning-delta', id: 'r2', text: 'B' },
          { type: 'reasoning-end', id: 'r2' },
          { type: 'reasoning-start', id: 'r3' },
          { type: 'reasoning-delta', id: 'r3', text: 'C' },
          { type: 'reasoning-end', id: 'r3' },
        ]),
      ),
    );
    const indices = events
      .filter((e) => e.type === 'thinking_delta' || e.type === 'thinking_done')
      .map((e) => (e as { blockIndex: number }).blockIndex);
    expect(indices).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it('reuses blockIndex when reasoning-delta arrives before reasoning-start (defensive)', async () => {
    const events = await collect(
      bridgeAISDKStream(
        iterate<AISDKStreamEvent>([
          { type: 'reasoning-delta', id: 'r1', text: 'A' },
          { type: 'reasoning-end', id: 'r1' },
        ]),
      ),
    );
    expect(events.map((e) => (e as { blockIndex: number }).blockIndex)).toEqual([0, 0]);
  });

  it('extracts Anthropic signature from providerMetadata.anthropic.signature', async () => {
    const events = await collect(
      bridgeAISDKStream(
        iterate<AISDKStreamEvent>([
          { type: 'reasoning-start', id: 'r1' },
          { type: 'reasoning-delta', id: 'r1', text: 'thought' },
          {
            type: 'reasoning-end',
            id: 'r1',
            providerMetadata: { anthropic: { signature: 'sig-deadbeef' } },
          },
        ]),
      ),
    );
    const done = events.find((e) => e.type === 'thinking_done');
    expectEvent(done, 'thinking_done');
    expect(done.signature).toBe('sig-deadbeef');
  });

  it('omits signature when providerMetadata is absent or non-string', async () => {
    const events = await collect(
      bridgeAISDKStream(
        iterate<AISDKStreamEvent>([
          { type: 'reasoning-start', id: 'r1' },
          { type: 'reasoning-end', id: 'r1' },
          { type: 'reasoning-start', id: 'r2' },
          {
            type: 'reasoning-end',
            id: 'r2',
            providerMetadata: { anthropic: { signature: 12345 as unknown as string } },
          },
        ]),
      ),
    );
    expect((events[0] as { signature?: string }).signature).toBeUndefined();
    expect((events[1] as { signature?: string }).signature).toBeUndefined();
  });

  it('runs eval_summary parser on accumulated reasoning text', async () => {
    const reasoningChunks = [
      'I need to check savings, balance, and HF impact.\n\n',
      '<eval_summary>\n{\n  "items": [\n',
      '    { "label": "Health Factor", "status": "good", "note": "1.85 OK" },\n',
      '    { "label": "Slippage", "status": "warning", "note": "0.5%" }\n',
      '  ]\n}\n</eval_summary>',
    ];
    const events = await collect(
      bridgeAISDKStream(
        iterate<AISDKStreamEvent>([
          { type: 'reasoning-start', id: 'r1' },
          ...reasoningChunks.map(
            (chunk): AISDKStreamEvent => ({
              type: 'reasoning-delta',
              id: 'r1',
              text: chunk,
            }),
          ),
          { type: 'reasoning-end', id: 'r1' },
        ]),
      ),
    );
    const done = events.find((e) => e.type === 'thinking_done');
    expectEvent(done, 'thinking_done');
    expect(done.summaryMode).toBe(true);
    expect(done.evaluationItems).toHaveLength(2);
    expect(done.evaluationItems?.[0]).toMatchObject({
      label: 'Health Factor',
      status: 'good',
    });
  });

  it('omits summaryMode when no <eval_summary> marker is present', async () => {
    const events = await collect(
      bridgeAISDKStream(
        iterate<AISDKStreamEvent>([
          { type: 'reasoning-start', id: 'r1' },
          { type: 'reasoning-delta', id: 'r1', text: 'plain thinking' },
          { type: 'reasoning-end', id: 'r1' },
        ]),
      ),
    );
    const done = events.find((e) => e.type === 'thinking_done');
    expectEvent(done, 'thinking_done');
    expect(done.summaryMode).toBeUndefined();
    expect(done.evaluationItems).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — tool calls (v6 tool-call / tool-result / tool-error)
// ---------------------------------------------------------------------------

describe('bridgeAISDKStream — tool calls', () => {
  it('maps tool-call to tool_start with source: llm', async () => {
    const events = await collect(
      bridgeAISDKStream(
        iterate<AISDKStreamEvent>([
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'balance_check',
            input: { address: '0xabc' },
            dynamic: true,
          },
        ]),
      ),
    );
    expect(events).toEqual([
      {
        type: 'tool_start',
        toolName: 'balance_check',
        toolUseId: 'call-1',
        input: { address: '0xabc' },
        source: 'llm',
      },
    ]);
  });

  it('maps tool-result to tool_result with toolName carried directly (v6 simplification)', async () => {
    const events = await collect(
      bridgeAISDKStream(
        iterate<AISDKStreamEvent>([
          {
            type: 'tool-call',
            toolCallId: 'call-2',
            toolName: 'save_deposit',
            input: { amount: 50 },
            dynamic: true,
          },
          {
            type: 'tool-result',
            toolCallId: 'call-2',
            toolName: 'save_deposit',
            input: { amount: 50 },
            output: { ok: true, txDigest: '0xdef' },
            dynamic: true,
          },
        ]),
      ),
    );
    expect(events).toHaveLength(2);
    const result = events[1];
    expectEvent(result, 'tool_result');
    expect(result.toolName).toBe('save_deposit');
    expect(result.toolUseId).toBe('call-2');
    expect(result.isError).toBe(false);
    expect(result.result).toEqual({ ok: true, txDigest: '0xdef' });
    expect(result.source).toBe('llm');
  });

  it('maps tool-error to tool_result with isError: true and error→string', async () => {
    const events = await collect(
      bridgeAISDKStream(
        iterate<AISDKStreamEvent>([
          {
            type: 'tool-call',
            toolCallId: 'call-3',
            toolName: 'rates_info',
            input: {},
            dynamic: true,
          },
          {
            type: 'tool-error',
            toolCallId: 'call-3',
            toolName: 'rates_info',
            input: {},
            error: 'NAVI MCP timed out',
            dynamic: true,
          },
        ]),
      ),
    );
    const result = events[1];
    expectEvent(result, 'tool_result');
    expect(result.isError).toBe(true);
    expect(result.result).toBe('NAVI MCP timed out');
    expect(result.toolName).toBe('rates_info');
  });

  it('coerces structured error objects to string via .message', async () => {
    const events = await collect(
      bridgeAISDKStream(
        iterate<AISDKStreamEvent>([
          {
            type: 'tool-error',
            toolCallId: 'call-4',
            toolName: 'rates_info',
            input: {},
            error: { message: 'rate-limited', code: 429 },
            dynamic: true,
          },
        ]),
      ),
    );
    const result = events[0];
    expectEvent(result, 'tool_result');
    expect(result.result).toBe('rate-limited');
  });

  it('coerces Error instances to string via .message', async () => {
    const events = await collect(
      bridgeAISDKStream(
        iterate<AISDKStreamEvent>([
          {
            type: 'tool-error',
            toolCallId: 'call-5',
            toolName: 'foo',
            input: {},
            error: new Error('upstream 500'),
            dynamic: true,
          },
        ]),
      ),
    );
    const result = events[0];
    expectEvent(result, 'tool_result');
    expect(result.result).toBe('upstream 500');
  });

  it('falls back to "tool error" for null/undefined error payloads', async () => {
    const events = await collect(
      bridgeAISDKStream(
        iterate<AISDKStreamEvent>([
          {
            type: 'tool-error',
            toolCallId: 'call-6',
            toolName: 'foo',
            input: {},
            error: null,
            dynamic: true,
          },
        ]),
      ),
    );
    const result = events[0];
    expectEvent(result, 'tool_result');
    expect(result.result).toBe('tool error');
  });

  // -------------------------------------------------------------------
  // [Day 17b] Side-channel parity with legacy QueryEngine:
  // tool-result events whose output carries the engine's `__canvas`
  // sentinel MUST emit an additional `canvas` EngineEvent. Pre-fix the
  // bridge silently dropped them, which broke every AISDKEngine canvas
  // render in production smoke. See engine.ts:1505-1523 for the original.
  // -------------------------------------------------------------------

  it('emits a canvas event in addition to tool_result when output has __canvas: true', async () => {
    const events = await collect(
      bridgeAISDKStream(
        iterate<AISDKStreamEvent>([
          {
            type: 'tool-result',
            toolCallId: 'call-canvas',
            toolName: 'render_canvas',
            input: { template: 'portfolio_timeline' },
            output: {
              __canvas: true,
              template: 'portfolio_timeline',
              title: 'Net Worth Over Time',
              templateData: { available: true, address: '0xabc' },
            },
            dynamic: true,
          },
        ]),
      ),
    );
    expect(events).toHaveLength(2);
    expectEvent(events[0], 'tool_result');
    expectEvent(events[1], 'canvas');
    const canvas = events[1] as {
      type: 'canvas';
      template: string;
      title: string;
      data: unknown;
      toolUseId: string;
    };
    expect(canvas.template).toBe('portfolio_timeline');
    expect(canvas.title).toBe('Net Worth Over Time');
    expect(canvas.data).toEqual({ available: true, address: '0xabc' });
    expect(canvas.toolUseId).toBe('call-canvas');
  });

  it('does NOT emit canvas for ordinary tool results without sentinel', async () => {
    const events = await collect(
      bridgeAISDKStream(
        iterate<AISDKStreamEvent>([
          {
            type: 'tool-result',
            toolCallId: 'call-plain',
            toolName: 'balance_check',
            input: {},
            output: { total: 100, savings: 22 },
            dynamic: true,
          },
        ]),
      ),
    );
    expect(events).toHaveLength(1);
    expectEvent(events[0], 'tool_result');
  });

  it('does NOT emit canvas for non-object outputs (string, number, null)', async () => {
    for (const output of ['a string', 42, null] as unknown[]) {
      const events = await collect(
        bridgeAISDKStream(
          iterate<AISDKStreamEvent>([
            {
              type: 'tool-result',
              toolCallId: 'call-x',
              toolName: 'foo',
              input: {},
              output,
              dynamic: true,
            },
          ]),
        ),
      );
      expect(events.filter((e) => e.type === 'canvas')).toHaveLength(0);
    }
  });

  it('coerces missing template/title strings to empty when canvas output is malformed', async () => {
    // Mirrors the legacy `String(r.template ?? '')` coercion. Keeps
    // the bridge tolerant of half-built canvas payloads from a buggy
    // tool implementation (the host renderer surfaces the empty
    // canvas instead of the bridge crashing).
    const events = await collect(
      bridgeAISDKStream(
        iterate<AISDKStreamEvent>([
          {
            type: 'tool-result',
            toolCallId: 'call-malformed',
            toolName: 'render_canvas',
            input: {},
            output: { __canvas: true },
            dynamic: true,
          },
        ]),
      ),
    );
    const canvas = events.find((e) => e.type === 'canvas') as
      | { template: string; title: string; data: unknown }
      | undefined;
    expect(canvas).toBeDefined();
    expect(canvas!.template).toBe('');
    expect(canvas!.title).toBe('');
    expect(canvas!.data).toBeNull();
  });

  it('preserves multiple parallel tool calls (toolName carried per-event in v6)', async () => {
    const events = await collect(
      bridgeAISDKStream(
        iterate<AISDKStreamEvent>([
          {
            type: 'tool-call',
            toolCallId: 'a',
            toolName: 'tool_a',
            input: 1,
            dynamic: true,
          },
          {
            type: 'tool-call',
            toolCallId: 'b',
            toolName: 'tool_b',
            input: 2,
            dynamic: true,
          },
          {
            type: 'tool-result',
            toolCallId: 'b',
            toolName: 'tool_b',
            input: 2,
            output: 'B',
            dynamic: true,
          },
          {
            type: 'tool-result',
            toolCallId: 'a',
            toolName: 'tool_a',
            input: 1,
            output: 'A',
            dynamic: true,
          },
        ]),
      ),
    );
    const results = events.filter((e) => e.type === 'tool_result');
    expect(results).toHaveLength(2);
    const byId = new Map(
      results.map((r) => [(r as { toolUseId: string }).toolUseId, r as { toolName: string }]),
    );
    expect(byId.get('a')?.toolName).toBe('tool_a');
    expect(byId.get('b')?.toolName).toBe('tool_b');
  });
});

// ---------------------------------------------------------------------------
// Suite 5 — finish reason → StopReason (v6's 6-value enum)
// ---------------------------------------------------------------------------

describe('bridgeAISDKStream — finish reason mapping', () => {
  const cases: Array<[AISDKFinishReason, ReturnType<typeof mapFinishReason>]> = [
    ['stop', 'end_turn'],
    ['tool-calls', 'tool_use'],
    ['length', 'max_tokens'],
    ['error', 'error'],
    ['content-filter', 'error'],
    ['other', 'end_turn'],
  ];

  for (const [input, expected] of cases) {
    it(`maps "${input}" → "${expected}"`, () => {
      expect(mapFinishReason(input)).toBe(expected);
    });
  }

  it('emits a usage event before turn_complete when totalUsage is present', async () => {
    const events = await collect(
      bridgeAISDKStream(
        iterate<AISDKStreamEvent>([
          {
            type: 'finish',
            finishReason: 'stop',
            rawFinishReason: undefined,
            totalUsage: usage({
              inputTokens: 100,
              outputTokens: 200,
              cacheReadTokens: 50,
            }),
          },
        ]),
      ),
    );
    expect(events).toHaveLength(2);
    const usageEv = events[0];
    expectEvent(usageEv, 'usage');
    expect(usageEv.inputTokens).toBe(100);
    expect(usageEv.outputTokens).toBe(200);
    expect(usageEv.cacheReadTokens).toBe(50);
    const done = events[1];
    expectEvent(done, 'turn_complete');
    expect(done.stopReason).toBe('end_turn');
  });

  it('preserves cacheWriteTokens from inputTokenDetails', async () => {
    const events = await collect(
      bridgeAISDKStream(
        iterate<AISDKStreamEvent>([
          {
            type: 'finish',
            finishReason: 'stop',
            rawFinishReason: undefined,
            totalUsage: usage({
              inputTokens: 100,
              outputTokens: 50,
              cacheReadTokens: 30,
              cacheWriteTokens: 70,
            }),
          },
        ]),
      ),
    );
    const usageEv = events[0];
    expectEvent(usageEv, 'usage');
    expect(usageEv.cacheReadTokens).toBe(30);
    expect(usageEv.cacheWriteTokens).toBe(70);
  });

  it('omits cacheReadTokens when inputTokenDetails.cacheReadTokens is undefined', async () => {
    const events = await collect(
      bridgeAISDKStream(
        iterate<AISDKStreamEvent>([
          {
            type: 'finish',
            finishReason: 'tool-calls',
            rawFinishReason: undefined,
            totalUsage: usage({ inputTokens: 10, outputTokens: 20 }),
          },
        ]),
      ),
    );
    const usageEv = events[0];
    expectEvent(usageEv, 'usage');
    expect(usageEv.cacheReadTokens).toBeUndefined();
    expect(usageEv.cacheWriteTokens).toBeUndefined();
  });

  it('defaults missing input/outputTokens to 0', async () => {
    const events = await collect(
      bridgeAISDKStream(
        iterate<AISDKStreamEvent>([
          {
            type: 'finish',
            finishReason: 'stop',
            rawFinishReason: undefined,
            totalUsage: usage({}),
          },
        ]),
      ),
    );
    const usageEv = events[0];
    expectEvent(usageEv, 'usage');
    expect(usageEv.inputTokens).toBe(0);
    expect(usageEv.outputTokens).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 6 — error envelope normalisation (top-level error event)
// ---------------------------------------------------------------------------

describe('bridgeAISDKStream — error envelope', () => {
  it('passes through Error instances unchanged', () => {
    const state = createBridgeState();
    const err = new Error('upstream failure');
    const out = translate({ type: 'error', error: err }, state);
    expect(out).toHaveLength(1);
    expectEvent(out[0], 'error');
    expect(out[0].error).toBe(err);
  });

  it('wraps strings in Error', () => {
    const state = createBridgeState();
    const out = translate({ type: 'error', error: 'rate-limited' }, state);
    expectEvent(out[0], 'error');
    expect(out[0].error.message).toBe('rate-limited');
  });

  it('extracts message field from objects', () => {
    const state = createBridgeState();
    const out = translate(
      { type: 'error', error: { message: 'invalid request', code: 400 } },
      state,
    );
    expectEvent(out[0], 'error');
    expect(out[0].error.message).toBe('invalid request');
  });

  it('falls back to JSON for objects without message', () => {
    const state = createBridgeState();
    const out = translate({ type: 'error', error: { code: 500, retryable: true } }, state);
    expectEvent(out[0], 'error');
    expect(out[0].error.message).toContain('500');
    expect(out[0].error.message).toContain('retryable');
  });

  it('handles null error payload', () => {
    const state = createBridgeState();
    const out = translate({ type: 'error', error: null }, state);
    expectEvent(out[0], 'error');
    expect(out[0].error.message).toBe('AI SDK stream error');
  });

  it('handles non-serialisable circular objects', () => {
    const state = createBridgeState();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const out = translate({ type: 'error', error: cyclic }, state);
    expectEvent(out[0], 'error');
    expect(out[0].error.message).toBe('AI SDK stream error (non-serialisable)');
  });

  it('maps abort with no reason to a stable error envelope', () => {
    const state = createBridgeState();
    const out = translate({ type: 'abort' }, state);
    expectEvent(out[0], 'error');
    expect(out[0].error.message).toBe('AI SDK stream aborted');
  });

  it('interpolates abort reason when provided (v6 optional reason field)', () => {
    const state = createBridgeState();
    const out = translate({ type: 'abort', reason: 'user cancelled' }, state);
    expectEvent(out[0], 'error');
    expect(out[0].error.message).toBe('AI SDK stream aborted: user cancelled');
  });
});

// ---------------------------------------------------------------------------
// Suite 7 — end-to-end shape: a realistic write-recommendation turn
// ---------------------------------------------------------------------------

describe('bridgeAISDKStream — end-to-end shape', () => {
  it('produces the expected EngineEvent stream for a save_deposit turn', async () => {
    const fixture: AISDKStreamEvent[] = [
      { type: 'start' },
      { type: 'start-step', request: {}, warnings: [] },
      { type: 'reasoning-start', id: 'r1' },
      { type: 'reasoning-delta', id: 'r1', text: 'User wants to save 50 USDC. ' },
      { type: 'reasoning-delta', id: 'r1', text: 'Health factor impact OK.' },
      {
        type: 'reasoning-end',
        id: 'r1',
        providerMetadata: { anthropic: { signature: 'sig-1' } },
      },
      { type: 'text-start', id: 't1' },
      { type: 'text-delta', id: 't1', text: "I'll save 50 USDC into NAVI." },
      { type: 'text-end', id: 't1' },
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'save_deposit',
        input: { amount: 50, asset: 'USDC' },
        dynamic: true,
      },
      {
        type: 'finish-step',
        response: { id: 'r1', timestamp: new Date(), modelId: 'test' },
        usage: usage({ inputTokens: 4000, outputTokens: 600 }),
        finishReason: 'tool-calls',
        rawFinishReason: undefined,
        providerMetadata: undefined,
      },
      {
        type: 'finish',
        finishReason: 'tool-calls',
        rawFinishReason: undefined,
        totalUsage: usage({
          inputTokens: 4000,
          outputTokens: 600,
          cacheReadTokens: 3500,
        }),
      },
    ];

    const events = await collect(bridgeAISDKStream(iterate(fixture)));
    const types = events.map((e) => e.type);
    expect(types).toEqual([
      'thinking_delta',
      'thinking_delta',
      'thinking_done',
      'text_delta',
      'tool_start',
      'usage',
      'turn_complete',
    ]);

    const done = events.find((e) => e.type === 'thinking_done');
    expectEvent(done, 'thinking_done');
    expect(done.signature).toBe('sig-1');
    expect(done.blockIndex).toBe(0);

    const start = events.find((e) => e.type === 'tool_start');
    expectEvent(start, 'tool_start');
    expect(start.source).toBe('llm');
    expect(start.toolName).toBe('save_deposit');

    const usageEv = events.find((e) => e.type === 'usage');
    expectEvent(usageEv, 'usage');
    expect(usageEv.cacheReadTokens).toBe(3500);

    const final = events[events.length - 1];
    expectEvent(final, 'turn_complete');
    expect(final.stopReason).toBe('tool_use');
  });

  it('end-to-end stream with no usage on finish still emits turn_complete', async () => {
    const events = await collect(bridgeAISDKStream(iterate([finishOnly('stop')])));
    expect(events.length).toBeGreaterThanOrEqual(1);
    const final = events[events.length - 1];
    expectEvent(final, 'turn_complete');
    expect(final.stopReason).toBe('end_turn');
  });
});
