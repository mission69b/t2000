// ---------------------------------------------------------------------------
// ai-sdk-anthropic.test.ts — exhaustive Phase 1 v0.7a test suite
// ---------------------------------------------------------------------------
//
// Covers (per goal-driven-execution.mdc verify gate):
//   • Stream translation: every TextStreamPart variant the new provider
//     consumes maps to the correct ProviderEvent (or correctly drops).
//   • Reasoning blocks: rising blockIndex, signature flow-through,
//     eval_summary parser fires when applicable.
//   • Text blocks: proactive_marker parser fires when applicable.
//   • Finish-reason → StopReason exhaustive mapping.
//   • Usage shape: nested inputTokenDetails → flat ProviderEvent.usage.
//   • Error / abort events → throw with normalised messages.
//   • Forward-compat events silently dropped.
//   • Message conversion: Message[] → ModelMessage[] with tool-message
//     splitting, ReasoningPart with anthropic signature, SystemPrompt
//     concat, ToolDefinition[] → ToolSet, ThinkingConfig → providerOptions.
//   • Sanitization: orphan stripping + role merging.
//   • End-to-end chat(): retry-before-first-token + retry-exhausted +
//     no-retry-once-yielded + telemetry external.retry_count outcomes
//     + abort signal forwarding + friendly error messages.
// ---------------------------------------------------------------------------

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetTelemetrySink,
  setTelemetrySink,
  type TelemetrySink,
} from '../telemetry.js';
import type {
  ChatParams,
  Message,
  ProviderEvent,
  ToolDefinition,
} from '../types.js';
import {
  buildAnthropicProviderOptions,
  toAISDKMessages,
  toAISDKSystem,
  toAISDKToolChoice,
  toAISDKTools,
} from './ai-sdk-message-conversion.js';
import { sanitizeMessages } from './message-sanitization.js';

// We mock 'ai' BEFORE importing the provider so the module-level
// `streamText` symbol the provider closes over is the mocked one.
// vi.hoisted is required because vi.mock is hoisted above all `import`
// statements; closing over a top-level `const` triggers a TDZ error.
const { streamTextMock } = vi.hoisted(() => ({ streamTextMock: vi.fn() }));

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return {
    ...actual,
    streamText: streamTextMock,
  };
});

// Bypass the @ai-sdk/anthropic load — we always inject `modelFactory`
// for tests so the default factory's `createAnthropic({apiKey})` call
// (which validates the key shape) never fires. Stubbing the module
// keeps the import itself working.
vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: () => () => ({ /* fake LanguageModel */ } as unknown),
}));

// Imported AFTER the mocks so the provider closes over the mocked symbols.
const { AISDKAnthropicProvider, _internal } = await import('./ai-sdk-anthropic.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function eventStream<T>(events: T[]) {
  return {
    fullStream: (async function* () {
      for (const e of events) yield e;
    })(),
  };
}

function makeProvider(maxRetries = 3) {
  return new AISDKAnthropicProvider({
    apiKey: 'test-key',
    maxRetries,
    modelFactory: () => ({} as unknown as Parameters<typeof streamTextMock>[0]['model']),
  });
}

async function collect(stream: AsyncGenerator<ProviderEvent>): Promise<ProviderEvent[]> {
  const out: ProviderEvent[] = [];
  for await (const ev of stream) out.push(ev);
  return out;
}

// Spy sink: records every counter call so we can assert telemetry.
class SpySink implements TelemetrySink {
  calls: Array<{ name: string; tags?: Record<string, string>; value?: number }> = [];
  counter(name: string, tags?: Record<string, string>, value?: number): void {
    this.calls.push({ name, tags, value });
  }
  gauge(): void {}
  histogram(): void {}
}

beforeEach(() => {
  streamTextMock.mockReset();
});

afterEach(() => {
  resetTelemetrySink();
});

// ---------------------------------------------------------------------------
// Pure translation tests (TextStreamPart → ProviderEvent[])
// ---------------------------------------------------------------------------

describe('translate', () => {
  const { translate, createStreamState } = _internal;

  it('text-delta → text_delta', () => {
    const state = createStreamState();
    expect(translate({ type: 'text-start', id: 't1' } as never, state)).toEqual([]);
    expect(translate({ type: 'text-delta', id: 't1', text: 'hello' } as never, state)).toEqual([
      { type: 'text_delta', text: 'hello' },
    ]);
  });

  it('text-end with no proactive marker → text_done (no marker)', () => {
    const state = createStreamState();
    translate({ type: 'text-start', id: 't1' } as never, state);
    translate({ type: 'text-delta', id: 't1', text: 'plain answer' } as never, state);
    expect(translate({ type: 'text-end', id: 't1' } as never, state)).toEqual([
      { type: 'text_done' },
    ]);
  });

  it('text-end with proactive marker → text_done with parsed marker', () => {
    const state = createStreamState();
    translate({ type: 'text-start', id: 't1' } as never, state);
    translate(
      {
        type: 'text-delta',
        id: 't1',
        text:
          '<proactive type="idle_balance" subjectKey="USDC">You have $120 USDC sitting idle.</proactive>',
      } as never,
      state,
    );
    const out = translate({ type: 'text-end', id: 't1' } as never, state);
    expect(out).toHaveLength(1);
    const ev = out[0];
    expect(ev.type).toBe('text_done');
    if (ev.type === 'text_done') {
      expect(ev.proactiveMarker?.proactiveType).toBe('idle_balance');
      expect(ev.proactiveMarker?.subjectKey).toBe('USDC');
      expect(ev.proactiveMarker?.body).toBe('You have $120 USDC sitting idle.');
    }
  });

  it('reasoning-delta → thinking_delta with blockIndex 0', () => {
    const state = createStreamState();
    translate({ type: 'reasoning-start', id: 'r1' } as never, state);
    expect(translate({ type: 'reasoning-delta', id: 'r1', text: 'think' } as never, state)).toEqual([
      { type: 'thinking_delta', text: 'think', blockIndex: 0 },
    ]);
  });

  it('multiple reasoning blocks get rising blockIndex', () => {
    const state = createStreamState();
    translate({ type: 'reasoning-start', id: 'r1' } as never, state);
    translate({ type: 'reasoning-start', id: 'r2' } as never, state);
    translate({ type: 'reasoning-start', id: 'r3' } as never, state);
    const r1 = translate({ type: 'reasoning-delta', id: 'r1', text: 'a' } as never, state);
    const r2 = translate({ type: 'reasoning-delta', id: 'r2', text: 'b' } as never, state);
    const r3 = translate({ type: 'reasoning-delta', id: 'r3', text: 'c' } as never, state);
    expect((r1[0] as { blockIndex: number }).blockIndex).toBe(0);
    expect((r2[0] as { blockIndex: number }).blockIndex).toBe(1);
    expect((r3[0] as { blockIndex: number }).blockIndex).toBe(2);
  });

  it('reasoning-end with anthropic signature → thinking_done.signature', () => {
    const state = createStreamState();
    translate({ type: 'reasoning-start', id: 'r1' } as never, state);
    translate({ type: 'reasoning-delta', id: 'r1', text: 'hello' } as never, state);
    const out = translate(
      {
        type: 'reasoning-end',
        id: 'r1',
        providerMetadata: { anthropic: { signature: 'sig-abc-123' } },
      } as never,
      state,
    );
    expect(out).toEqual([
      {
        type: 'thinking_done',
        blockIndex: 0,
        thinking: 'hello',
        signature: 'sig-abc-123',
      },
    ]);
  });

  it('reasoning-end with eval_summary → thinking_done.summaryMode + evaluationItems', () => {
    const state = createStreamState();
    translate({ type: 'reasoning-start', id: 'r1' } as never, state);
    const evalText = `Evaluating the swap.

<eval_summary>
{
  "items": [
    { "label": "Health Factor", "status": "good", "note": "1.85 → 1.62, above 1.20 threshold" },
    { "label": "Slippage cap", "status": "good" }
  ]
}
</eval_summary>`;
    translate({ type: 'reasoning-delta', id: 'r1', text: evalText } as never, state);
    const out = translate({ type: 'reasoning-end', id: 'r1' } as never, state);
    expect(out).toHaveLength(1);
    const ev = out[0];
    expect(ev.type).toBe('thinking_done');
    if (ev.type === 'thinking_done') {
      expect(ev.summaryMode).toBe(true);
      expect(ev.evaluationItems).toHaveLength(2);
      expect(ev.evaluationItems?.[0]).toEqual({
        label: 'Health Factor',
        status: 'good',
        note: '1.85 → 1.62, above 1.20 threshold',
      });
    }
  });

  it('reasoning-end without eval_summary → no summary fields', () => {
    const state = createStreamState();
    translate({ type: 'reasoning-start', id: 'r1' } as never, state);
    translate({ type: 'reasoning-delta', id: 'r1', text: 'just thinking' } as never, state);
    const out = translate({ type: 'reasoning-end', id: 'r1' } as never, state);
    const ev = out[0] as { summaryMode?: boolean; evaluationItems?: unknown[] };
    expect(ev.summaryMode).toBeUndefined();
    expect(ev.evaluationItems).toBeUndefined();
  });

  it('reasoning-end with redactedData → emits redacted_thinking (not thinking_done)', () => {
    // Round-tripping the redacted bytes is load-bearing — without it the
    // next turn's signed-thinking signature verification fails on
    // Anthropic's side. Mirrors the legacy AnthropicProvider's emit shape
    // so engine.ts's `case 'redacted_thinking'` branch handles it
    // identically (pushes to assistantBlocks).
    const state = createStreamState();
    translate({ type: 'reasoning-start', id: 'r1' } as never, state);
    const out = translate(
      {
        type: 'reasoning-end',
        id: 'r1',
        providerMetadata: { anthropic: { redactedData: 'REDACTED_BYTES_xyz' } },
      } as never,
      state,
    );
    expect(out).toEqual([
      { type: 'redacted_thinking', data: 'REDACTED_BYTES_xyz' },
    ]);
  });

  it('tool-call → tool_use_start + tool_use_done with parsed input', () => {
    const state = createStreamState();
    const out = translate(
      {
        type: 'tool-call',
        toolCallId: 'tool_xyz',
        toolName: 'balance_check',
        input: { wallet: '0xabc' },
      } as never,
      state,
    );
    expect(out).toEqual([
      { type: 'tool_use_start', id: 'tool_xyz', name: 'balance_check' },
      { type: 'tool_use_done', id: 'tool_xyz', name: 'balance_check', input: { wallet: '0xabc' } },
    ]);
  });

  it('finish with totalUsage → usage event then stop', () => {
    const state = createStreamState();
    const out = translate(
      {
        type: 'finish',
        finishReason: 'stop',
        totalUsage: {
          inputTokens: 100,
          outputTokens: 50,
          inputTokenDetails: { cacheReadTokens: 30, cacheWriteTokens: 5 },
        },
      } as never,
      state,
    );
    expect(out).toEqual([
      { type: 'usage', inputTokens: 100, outputTokens: 50, cacheReadTokens: 30, cacheWriteTokens: 5 },
      { type: 'stop', reason: 'end_turn' },
    ]);
  });

  it('finish with no usage → just stop', () => {
    const state = createStreamState();
    const out = translate(
      { type: 'finish', finishReason: 'tool-calls' } as never,
      state,
    );
    expect(out).toEqual([{ type: 'stop', reason: 'tool_use' }]);
  });

  it('finish reason exhaustive mapping', () => {
    const state = createStreamState();
    const cases: Array<[string, string]> = [
      ['stop', 'end_turn'],
      ['tool-calls', 'tool_use'],
      ['length', 'max_tokens'],
      ['content-filter', 'error'],
      ['error', 'error'],
      ['other', 'end_turn'],
    ];
    for (const [aiSdk, engine] of cases) {
      const out = translate(
        { type: 'finish', finishReason: aiSdk } as never,
        state,
      );
      expect(out[out.length - 1]).toEqual({ type: 'stop', reason: engine });
    }
  });

  it('error event → throws normalised Error', () => {
    const state = createStreamState();
    expect(() =>
      translate({ type: 'error', error: 'rate limit exceeded' } as never, state),
    ).toThrow('rate limit exceeded');
    expect(() =>
      translate({ type: 'error', error: { message: 'boom' } } as never, state),
    ).toThrow('boom');
    expect(() =>
      translate({ type: 'error', error: new Error('real error') } as never, state),
    ).toThrow('real error');
  });

  it('abort event → throws with reason interpolation', () => {
    const state = createStreamState();
    expect(() =>
      translate({ type: 'abort', reason: 'user cancelled' } as never, state),
    ).toThrow(/user cancelled/);
    expect(() => translate({ type: 'abort' } as never, state)).toThrow('AI SDK stream aborted');
  });

  it('forward-compat lifecycle events return empty array', () => {
    const state = createStreamState();
    for (const type of [
      'start',
      'start-step',
      'finish-step',
      'tool-input-start',
      'tool-input-end',
      'tool-input-delta',
      'source',
      'file',
      'raw',
      'tool-output-denied',
      'tool-approval-request',
      'tool-result',
      'tool-error',
    ]) {
      expect(translate({ type } as never, state)).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// Message conversion
// ---------------------------------------------------------------------------

describe('toAISDKMessages', () => {
  it('basic user/assistant text round-trips', () => {
    const messages: Message[] = [
      { role: 'user', content: [{ type: 'text', text: 'hi' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'hello' }] },
    ];
    expect(toAISDKMessages(messages)).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'hi' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'hello' }] },
    ]);
  });

  it('assistant tool_use → ToolCallPart in assistant message', () => {
    const messages: Message[] = [
      { role: 'user', content: [{ type: 'text', text: 'what is my balance?' }] },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Let me check.' },
          { type: 'tool_use', id: 't1', name: 'balance_check', input: {} },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', toolUseId: 't1', content: '{"USDC":50}' },
        ],
      },
    ];
    const out = toAISDKMessages(messages);
    expect(out[1].role).toBe('assistant');
    expect(out[1].content).toEqual([
      { type: 'text', text: 'Let me check.' },
      { type: 'tool-call', toolCallId: 't1', toolName: 'balance_check', input: {} },
    ]);
    expect(out[2].role).toBe('tool');
    expect(out[2].content).toEqual([
      {
        type: 'tool-result',
        toolCallId: 't1',
        toolName: '',
        output: { type: 'text', value: '{"USDC":50}' },
      },
    ]);
  });

  it('tool_result with isError → error-text output', () => {
    const messages: Message[] = [
      { role: 'user', content: [{ type: 'text', text: 'go' }] },
      {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'fail1', name: 'swap_execute', input: {} }],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', toolUseId: 'fail1', content: 'reverted', isError: true },
        ],
      },
    ];
    const out = toAISDKMessages(messages);
    expect(out[2].content).toEqual([
      {
        type: 'tool-result',
        toolCallId: 'fail1',
        toolName: '',
        output: { type: 'error-text', value: 'reverted' },
      },
    ]);
  });

  it('assistant thinking with signature → ReasoningPart with providerOptions.anthropic.signature', () => {
    const messages: Message[] = [
      { role: 'user', content: [{ type: 'text', text: 'go' }] },
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'considering...', signature: 'sig-abc' },
          { type: 'text', text: 'OK' },
        ],
      },
    ];
    const out = toAISDKMessages(messages);
    expect(out[1].content).toEqual([
      {
        type: 'reasoning',
        text: 'considering...',
        providerOptions: { anthropic: { signature: 'sig-abc' } },
      },
      { type: 'text', text: 'OK' },
    ]);
  });
});

describe('toAISDKSystem', () => {
  it('string passes through', () => {
    expect(toAISDKSystem('you are helpful')).toBe('you are helpful');
  });

  it('SystemBlock[] concatenates with double newline', () => {
    expect(
      toAISDKSystem([
        { type: 'text', text: 'block 1' },
        { type: 'text', text: 'block 2', cache_control: { type: 'ephemeral' } },
      ]),
    ).toBe('block 1\n\nblock 2');
  });
});

describe('toAISDKTools', () => {
  it('converts ToolDefinition[] → ToolSet with correct names', () => {
    const tools: ToolDefinition[] = [
      {
        name: 'balance_check',
        description: 'Check wallet balance',
        input_schema: { type: 'object', properties: {}, required: [] },
      },
      {
        name: 'send_transfer',
        description: 'Send a transfer',
        input_schema: { type: 'object', properties: { to: { type: 'string' } }, required: ['to'] },
      },
    ];
    const set = toAISDKTools(tools);
    expect(Object.keys(set)).toEqual(['balance_check', 'send_transfer']);
    expect(set.balance_check.description).toBe('Check wallet balance');
  });
});

describe('toAISDKToolChoice', () => {
  it('translates engine choice → AI SDK choice', () => {
    expect(toAISDKToolChoice('auto')).toBe('auto');
    expect(toAISDKToolChoice('any')).toBe('required');
    expect(toAISDKToolChoice({ type: 'tool', name: 'balance_check' })).toEqual({
      type: 'tool',
      toolName: 'balance_check',
    });
    expect(toAISDKToolChoice(undefined)).toBeUndefined();
  });
});

describe('buildAnthropicProviderOptions', () => {
  it('returns undefined when nothing to forward', () => {
    expect(buildAnthropicProviderOptions(undefined, undefined)).toBeUndefined();
    expect(buildAnthropicProviderOptions({ type: 'disabled' }, undefined)).toBeUndefined();
  });

  it('forwards enabled thinking with budgetTokens', () => {
    expect(
      buildAnthropicProviderOptions({ type: 'enabled', budgetTokens: 4000 }, undefined),
    ).toEqual({
      anthropic: { thinking: { type: 'enabled', budgetTokens: 4000 } },
    });
  });

  it('forwards adaptive thinking with display', () => {
    expect(
      buildAnthropicProviderOptions(
        { type: 'adaptive', display: 'summarized' },
        undefined,
      ),
    ).toEqual({
      anthropic: { thinking: { type: 'adaptive', display: 'summarized' } },
    });
  });

  it('forwards outputConfig.effort', () => {
    expect(
      buildAnthropicProviderOptions(undefined, { effort: 'high' }),
    ).toEqual({
      anthropic: { outputConfig: { effort: 'high' } },
    });
  });
});

// ---------------------------------------------------------------------------
// Sanitization
// ---------------------------------------------------------------------------

describe('sanitizeMessages', () => {
  it('strips orphan tool_use that has no matching tool_result', () => {
    const messages: Message[] = [
      { role: 'user', content: [{ type: 'text', text: 'go' }] },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'thinking' },
          { type: 'tool_use', id: 'orphan', name: 'balance_check', input: {} },
        ],
      },
      { role: 'user', content: [{ type: 'text', text: 'next' }] },
    ];
    const out = sanitizeMessages(messages);
    expect(out[1].content).toEqual([{ type: 'text', text: 'thinking' }]);
  });

  it('strips orphan tool_result that has no matching tool_use', () => {
    const messages: Message[] = [
      { role: 'user', content: [{ type: 'text', text: 'q' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'a' }] },
      {
        role: 'user',
        content: [
          { type: 'tool_result', toolUseId: 'unknown', content: 'stale' },
          { type: 'text', text: 'next' },
        ],
      },
    ];
    const out = sanitizeMessages(messages);
    expect(out[2].content).toEqual([{ type: 'text', text: 'next' }]);
  });

  it('merges consecutive same-role messages', () => {
    const messages: Message[] = [
      { role: 'user', content: [{ type: 'text', text: 'first' }] },
      { role: 'user', content: [{ type: 'text', text: 'second' }] },
    ];
    const out = sanitizeMessages(messages);
    expect(out).toHaveLength(1);
    expect(out[0].content).toEqual([
      { type: 'text', text: 'first' },
      { type: 'text', text: 'second' },
    ]);
  });

  it('drops leading assistant messages so first is user', () => {
    const messages: Message[] = [
      { role: 'assistant', content: [{ type: 'text', text: 'leading' }] },
      { role: 'user', content: [{ type: 'text', text: 'q' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'a' }] },
    ];
    const out = sanitizeMessages(messages);
    expect(out[0].role).toBe('user');
    expect(out).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// End-to-end provider chat() — retry, telemetry, error mapping
// ---------------------------------------------------------------------------

describe('AISDKAnthropicProvider.chat()', () => {
  const baseParams: ChatParams = {
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    systemPrompt: 'helpful',
    tools: [],
  };

  it('happy path: text-delta + finish → text_delta + usage + stop', async () => {
    streamTextMock.mockReturnValueOnce(
      eventStream([
        { type: 'text-start', id: 't1' },
        { type: 'text-delta', id: 't1', text: 'hello' },
        { type: 'text-end', id: 't1' },
        {
          type: 'finish',
          finishReason: 'stop',
          totalUsage: { inputTokens: 10, outputTokens: 5 },
        },
      ]),
    );

    const provider = makeProvider();
    const events = await collect(provider.chat(baseParams));
    expect(events).toEqual([
      { type: 'text_delta', text: 'hello' },
      { type: 'text_done' },
      { type: 'usage', inputTokens: 10, outputTokens: 5 },
      { type: 'stop', reason: 'end_turn' },
    ]);
  });

  it('retries before first token on retriable error then succeeds', async () => {
    streamTextMock
      .mockImplementationOnce(() => ({
        fullStream: (async function* () {
          throw new Error('overloaded_error');
        })(),
      }))
      .mockReturnValueOnce(
        eventStream([
          { type: 'text-start', id: 't1' },
          { type: 'text-delta', id: 't1', text: 'recovered' },
          { type: 'text-end', id: 't1' },
          { type: 'finish', finishReason: 'stop' },
        ]),
      );

    const sink = new SpySink();
    setTelemetrySink(sink);

    const provider = new AISDKAnthropicProvider({
      apiKey: 'test-key',
      maxRetries: 3,
      modelFactory: () => ({} as never),
    });
    const events = await collect(provider.chat(baseParams));

    expect(events.find((e) => e.type === 'text_delta')).toEqual({ type: 'text_delta', text: 'recovered' });
    expect(streamTextMock).toHaveBeenCalledTimes(2);

    const retryCounter = sink.calls.find((c) => c.name === 'external.retry_count');
    expect(retryCounter?.tags).toEqual({ vendor: 'anthropic', outcome: 'retried_success', attempts: '2' });
  });

  it('exhausts retries and throws friendly message', async () => {
    streamTextMock.mockImplementation(() => ({
      fullStream: (async function* () {
        throw new Error('overloaded_error');
      })(),
    }));

    const sink = new SpySink();
    setTelemetrySink(sink);

    const provider = new AISDKAnthropicProvider({
      apiKey: 'test-key',
      maxRetries: 2,
      modelFactory: () => ({} as never),
    });

    await expect(collect(provider.chat(baseParams))).rejects.toThrow(
      "Anthropic's servers are over capacity",
    );
    // Initial attempt + 2 retries = 3 calls
    expect(streamTextMock).toHaveBeenCalledTimes(3);

    const retryCounter = sink.calls.find((c) => c.name === 'external.retry_count');
    expect(retryCounter?.tags).toEqual({ vendor: 'anthropic', outcome: 'exhausted', attempts: '3' });
  }, 30000);

  it('does NOT retry once tokens have yielded (mid-stream error propagates)', async () => {
    streamTextMock.mockReturnValueOnce({
      fullStream: (async function* () {
        yield { type: 'text-start', id: 't1' };
        yield { type: 'text-delta', id: 't1', text: 'partial' };
        throw new Error('overloaded_error');
      })(),
    });

    const sink = new SpySink();
    setTelemetrySink(sink);

    const provider = new AISDKAnthropicProvider({
      apiKey: 'test-key',
      maxRetries: 3,
      modelFactory: () => ({} as never),
    });

    const stream = provider.chat(baseParams);
    const collected: ProviderEvent[] = [];
    let error: Error | null = null;
    try {
      for await (const ev of stream) collected.push(ev);
    } catch (e) {
      error = e as Error;
    }
    expect(collected).toEqual([{ type: 'text_delta', text: 'partial' }]);
    expect(error?.message).toContain('over capacity');
    // Crucially: ONLY one call — mid-stream errors do NOT retry.
    expect(streamTextMock).toHaveBeenCalledTimes(1);

    const retryCounter = sink.calls.find((c) => c.name === 'external.retry_count');
    expect(retryCounter?.tags).toEqual({ vendor: 'anthropic', outcome: 'first_try', attempts: '1' });
  });

  it('telemetry first_try outcome on success without retry', async () => {
    streamTextMock.mockReturnValueOnce(
      eventStream([
        { type: 'text-start', id: 't1' },
        { type: 'text-delta', id: 't1', text: 'ok' },
        { type: 'text-end', id: 't1' },
        { type: 'finish', finishReason: 'stop' },
      ]),
    );

    const sink = new SpySink();
    setTelemetrySink(sink);

    const provider = makeProvider();
    await collect(provider.chat(baseParams));

    const retryCounter = sink.calls.find((c) => c.name === 'external.retry_count');
    expect(retryCounter?.tags).toEqual({ vendor: 'anthropic', outcome: 'first_try', attempts: '1' });
  });
});

describe('error helpers (_internal)', () => {
  it('isRetriableError handles common shapes', () => {
    const { isRetriableError } = _internal;
    expect(isRetriableError(new Error('overloaded_error'))).toBe(true);
    expect(isRetriableError(new Error('rate_limit_error'))).toBe(true);
    expect(isRetriableError(new Error('socket hang up'))).toBe(true);
    expect(isRetriableError(new Error('invalid input'))).toBe(false);
    expect(isRetriableError(null)).toBe(false);
  });

  it('friendlyErrorMessage maps common shapes', () => {
    const { friendlyErrorMessage } = _internal;
    expect(friendlyErrorMessage(new Error('overloaded_error'))).toMatch(/over capacity/);
    expect(friendlyErrorMessage(new Error('rate_limit_error'))).toMatch(/Too many requests/);
    expect(friendlyErrorMessage(new Error('socket hang up'))).toMatch(/Couldn't reach Anthropic/);
    expect(friendlyErrorMessage(new Error('mystery error'))).toBe('Something went wrong. Please try again.');
  });

  it('computeBackoffMs grows exponentially with jitter', () => {
    const { computeBackoffMs } = _internal;
    const a = computeBackoffMs(1);
    const b = computeBackoffMs(2);
    const c = computeBackoffMs(3);
    expect(a).toBeGreaterThanOrEqual(1000);
    expect(b).toBeGreaterThanOrEqual(2000);
    expect(c).toBeGreaterThanOrEqual(4000);
    // Capped at 8000 + jitter ≤ 250
    expect(computeBackoffMs(10)).toBeLessThanOrEqual(8250);
  });
});
