// ---------------------------------------------------------------------------
// SPEC 8 v0.5.1 B3.2 — `harness_shape` event + `attemptCount` plumbing
//
// Two contracts under test:
//
//   1. `submitMessage(prompt, { harnessShape, harnessRationale })` yields a
//      one-shot `harness_shape` EngineEvent BEFORE any agentLoop activity,
//      and yields nothing when the option is omitted (back-compat with
//      pre-SPEC-8 hosts).
//
//   2. The dispatcher attaches a fresh `retryStats: { attemptCount: 1 }`
//      to ToolContext on every tool invocation, surfaces the value back
//      onto `tool_result.attemptCount` only when > 1, and never bleeds
//      counts across tools in the same turn.
//
// Mock provider lifted from confirmation.test.ts. No real API.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { QueryEngine } from '../engine.js';
import { buildTool } from '../tool.js';
import { harnessShapeForEffort } from '../types.js';
import type {
  LLMProvider,
  ChatParams,
  ProviderEvent,
  EngineEvent,
  Tool,
  ToolContext,
} from '../types.js';

// ---------------------------------------------------------------------------
// Mock provider — single-turn text reply, no tool calls.
// ---------------------------------------------------------------------------

function createMockProvider(): LLMProvider {
  let callIndex = 0;
  return {
    async *chat(_params: ChatParams): AsyncGenerator<ProviderEvent> {
      callIndex++;
      yield { type: 'message_start', messageId: `msg-${callIndex}`, model: 'mock' };
      yield { type: 'usage', inputTokens: 10, outputTokens: 5 };
      yield { type: 'text_delta', text: 'ok' };
      yield { type: 'stop', reason: 'end_turn' };
    },
  };
}

// Mock provider that issues exactly one tool call then a follow-up text turn.
function createToolCallingProvider(toolName: string): LLMProvider {
  let callIndex = 0;
  return {
    async *chat(_params: ChatParams): AsyncGenerator<ProviderEvent> {
      callIndex++;
      yield { type: 'message_start', messageId: `msg-${callIndex}`, model: 'mock' };
      yield { type: 'usage', inputTokens: 10, outputTokens: 5 };
      if (callIndex === 1) {
        yield { type: 'tool_use_start', id: 'tc-1', name: toolName };
        yield { type: 'tool_use_done', id: 'tc-1', name: toolName, input: {} };
        yield { type: 'stop', reason: 'tool_use' };
      } else {
        yield { type: 'text_delta', text: 'done' };
        yield { type: 'stop', reason: 'end_turn' };
      }
    },
  };
}

async function collect(gen: AsyncGenerator<EngineEvent>): Promise<EngineEvent[]> {
  const events: EngineEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

// ---------------------------------------------------------------------------
// (1) harness_shape emission
// ---------------------------------------------------------------------------

describe('submitMessage — harness_shape event emission', () => {
  it('emits harness_shape ONCE at turn start when host passes harnessShape', async () => {
    const engine = new QueryEngine({
      provider: createMockProvider(),
      tools: [],
      systemPrompt: 'Test',
    });

    const events = await collect(
      engine.submitMessage('hello', {
        harnessShape: 'standard',
        harnessRationale: 'matched recipe safe_borrow',
      }),
    );

    const shapeEvents = events.filter((e) => e.type === 'harness_shape');
    expect(shapeEvents).toHaveLength(1);
    expect(shapeEvents[0]).toEqual({
      type: 'harness_shape',
      shape: 'standard',
      rationale: 'matched recipe safe_borrow',
    });
  });

  it('emits BEFORE any text/tool events (turn-start ordering)', async () => {
    const engine = new QueryEngine({
      provider: createMockProvider(),
      tools: [],
      systemPrompt: 'Test',
    });

    const events = await collect(
      engine.submitMessage('hello', { harnessShape: 'lean' }),
    );

    // `usage` is the only EngineEvent type that may precede agentLoop work
    // (the mock provider emits one as part of `message_start`). The
    // harness_shape event MUST be the first non-usage emission.
    const firstNonUsageIndex = events.findIndex((e) => e.type !== 'usage');
    expect(events[firstNonUsageIndex].type).toBe('harness_shape');
  });

  it('emits NO harness_shape event when host omits the option (legacy host back-compat)', async () => {
    const engine = new QueryEngine({
      provider: createMockProvider(),
      tools: [],
      systemPrompt: 'Test',
    });

    const events = await collect(engine.submitMessage('hello'));
    expect(events.some((e) => e.type === 'harness_shape')).toBe(false);
  });

  it('falls back to a non-empty rationale when host passes only the shape', async () => {
    const engine = new QueryEngine({
      provider: createMockProvider(),
      tools: [],
      systemPrompt: 'Test',
    });

    const events = await collect(
      engine.submitMessage('hello', { harnessShape: 'rich' }),
    );

    const shape = events.find((e) => e.type === 'harness_shape') as Extract<
      EngineEvent,
      { type: 'harness_shape' }
    >;
    expect(shape).toBeDefined();
    expect(shape.rationale.length).toBeGreaterThan(0);
    expect(shape.rationale).toContain('rich');
  });

  it('falls back when host passes whitespace-only rationale', async () => {
    const engine = new QueryEngine({
      provider: createMockProvider(),
      tools: [],
      systemPrompt: 'Test',
    });

    const events = await collect(
      engine.submitMessage('hello', { harnessShape: 'max', harnessRationale: '   ' }),
    );

    const shape = events.find((e) => e.type === 'harness_shape') as Extract<
      EngineEvent,
      { type: 'harness_shape' }
    >;
    expect(shape.rationale.trim().length).toBeGreaterThan(0);
  });
});

describe('harnessShapeForEffort mapping', () => {
  it('maps every ThinkingEffort to a HarnessShape', () => {
    expect(harnessShapeForEffort('low')).toBe('lean');
    expect(harnessShapeForEffort('medium')).toBe('standard');
    expect(harnessShapeForEffort('high')).toBe('rich');
    expect(harnessShapeForEffort('max')).toBe('max');
  });
});

// ---------------------------------------------------------------------------
// (2) attemptCount round-trip via ToolContext.retryStats
// ---------------------------------------------------------------------------

const probeTool: Tool = buildTool({
  name: 'probe',
  description: 'Test tool that bumps retryStats from inside its call',
  inputSchema: z.object({}),
  jsonSchema: { type: 'object', properties: {} },
  isReadOnly: true,
  // `probe` simulates 3 HTTP attempts (the real BlockVision wrapper
  // does this for us — here we bump directly).
  async call(_input, ctx: ToolContext) {
    if (ctx.retryStats) ctx.retryStats.attemptCount = 3;
    return { data: { ok: true } };
  },
});

const cleanTool: Tool = buildTool({
  name: 'clean',
  description: 'Test tool that does not touch retryStats (1st-try success)',
  inputSchema: z.object({}),
  jsonSchema: { type: 'object', properties: {} },
  isReadOnly: true,
  async call() {
    return { data: { ok: true } };
  },
});

describe('tool dispatcher — attemptCount surfaces on tool_result', () => {
  it('emits attemptCount when the tool bumped retryStats > 1', async () => {
    const engine = new QueryEngine({
      provider: createToolCallingProvider('probe'),
      tools: [probeTool],
      systemPrompt: 'Test',
    });

    const events = await collect(engine.submitMessage('go'));
    const results = events.filter(
      (e): e is Extract<EngineEvent, { type: 'tool_result' }> => e.type === 'tool_result',
    );
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].toolName).toBe('probe');
    expect(results[0].attemptCount).toBe(3);
  });

  it('omits attemptCount entirely when the tool was a 1st-try success', async () => {
    const engine = new QueryEngine({
      provider: createToolCallingProvider('clean'),
      tools: [cleanTool],
      systemPrompt: 'Test',
    });

    const events = await collect(engine.submitMessage('go'));
    const results = events.filter(
      (e): e is Extract<EngineEvent, { type: 'tool_result' }> => e.type === 'tool_result',
    );
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].toolName).toBe('clean');
    expect(results[0].attemptCount).toBeUndefined();
  });

  it('isolates retryStats per tool — counters do not bleed across calls in the same turn', async () => {
    // Mock provider issues TWO parallel read tool calls in one turn.
    const provider: LLMProvider = {
      async *chat(_params: ChatParams): AsyncGenerator<ProviderEvent> {
        yield { type: 'message_start', messageId: 'msg-1', model: 'mock' };
        yield { type: 'usage', inputTokens: 10, outputTokens: 5 };
        yield { type: 'tool_use_start', id: 'tc-1', name: 'probe' };
        yield { type: 'tool_use_done', id: 'tc-1', name: 'probe', input: {} };
        yield { type: 'tool_use_start', id: 'tc-2', name: 'clean' };
        yield { type: 'tool_use_done', id: 'tc-2', name: 'clean', input: {} };
        yield { type: 'stop', reason: 'tool_use' };
      },
    };

    // Second turn returns final text.
    let callIndex = 0;
    const wrappedProvider: LLMProvider = {
      async *chat(params: ChatParams): AsyncGenerator<ProviderEvent> {
        callIndex++;
        if (callIndex === 1) {
          yield* provider.chat(params);
        } else {
          yield { type: 'message_start', messageId: 'msg-2', model: 'mock' };
          yield { type: 'usage', inputTokens: 10, outputTokens: 5 };
          yield { type: 'text_delta', text: 'done' };
          yield { type: 'stop', reason: 'end_turn' };
        }
      },
    };

    const engine = new QueryEngine({
      provider: wrappedProvider,
      tools: [probeTool, cleanTool],
      systemPrompt: 'Test',
    });

    const events = await collect(engine.submitMessage('go'));
    const results = events.filter(
      (e): e is Extract<EngineEvent, { type: 'tool_result' }> => e.type === 'tool_result',
    );
    const probeResult = results.find((r) => r.toolName === 'probe');
    const cleanResult = results.find((r) => r.toolName === 'clean');

    expect(probeResult?.attemptCount).toBe(3);
    expect(cleanResult?.attemptCount).toBeUndefined();
  });
});
