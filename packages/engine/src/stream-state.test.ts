import { describe, expect, it } from 'vitest';
import { withStreamState } from './stream-state.js';
import type { EngineEvent } from './types.js';

async function* fromArray<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) {
    yield item;
  }
}

async function collect<T>(g: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of g) {
    out.push(item);
  }
  return out;
}

describe('withStreamState', () => {
  it('emits routing immediately BEFORE swap_quote tool_start', async () => {
    const input: EngineEvent[] = [
      { type: 'tool_start', toolName: 'swap_quote', toolUseId: 'tc-1', input: {} },
    ];

    const out = await collect(withStreamState(fromArray(input)));

    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ type: 'stream_state', state: 'routing' });
    expect(out[1]).toEqual(input[0]);
  });

  it('emits quoting immediately AFTER successful swap_quote tool_result', async () => {
    const input: EngineEvent[] = [
      { type: 'tool_start', toolName: 'swap_quote', toolUseId: 'tc-1', input: {} },
      {
        type: 'tool_result',
        toolName: 'swap_quote',
        toolUseId: 'tc-1',
        result: { route: 'CETUS' },
        isError: false,
      },
    ];

    const out = await collect(withStreamState(fromArray(input)));

    expect(out).toHaveLength(4);
    expect(out[0]).toEqual({ type: 'stream_state', state: 'routing' });
    expect(out[1].type).toBe('tool_start');
    expect(out[2].type).toBe('tool_result');
    expect(out[3]).toEqual({ type: 'stream_state', state: 'quoting' });
  });

  it('does NOT emit quoting on swap_quote tool error', async () => {
    const input: EngineEvent[] = [
      { type: 'tool_start', toolName: 'swap_quote', toolUseId: 'tc-1', input: {} },
      {
        type: 'tool_result',
        toolName: 'swap_quote',
        toolUseId: 'tc-1',
        result: { error: 'no route found' },
        isError: true,
      },
    ];

    const out = await collect(withStreamState(fromArray(input)));

    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ type: 'stream_state', state: 'routing' });
    expect(out.find((e) => e.type === 'stream_state' && e.state === 'quoting')).toBeUndefined();
  });

  it('emits routing/quoting at most once per turn', async () => {
    const input: EngineEvent[] = [
      { type: 'tool_start', toolName: 'swap_quote', toolUseId: 'tc-1', input: {} },
      {
        type: 'tool_result',
        toolName: 'swap_quote',
        toolUseId: 'tc-1',
        result: { route: 'CETUS' },
        isError: false,
      },
      // LLM re-quotes mid-turn (rare but legal)
      { type: 'tool_start', toolName: 'swap_quote', toolUseId: 'tc-2', input: {} },
      {
        type: 'tool_result',
        toolName: 'swap_quote',
        toolUseId: 'tc-2',
        result: { route: 'TURBOS' },
        isError: false,
      },
    ];

    const out = await collect(withStreamState(fromArray(input)));

    const streamStates = out.filter((e) => e.type === 'stream_state');
    expect(streamStates).toHaveLength(2);
    expect(streamStates[0]).toEqual({ type: 'stream_state', state: 'routing' });
    expect(streamStates[1]).toEqual({ type: 'stream_state', state: 'quoting' });
  });

  it('resets per-turn state on turn_complete (multi-turn session)', async () => {
    const input: EngineEvent[] = [
      // Turn 1
      { type: 'tool_start', toolName: 'swap_quote', toolUseId: 'tc-1', input: {} },
      {
        type: 'tool_result',
        toolName: 'swap_quote',
        toolUseId: 'tc-1',
        result: { route: 'CETUS' },
        isError: false,
      },
      { type: 'turn_complete', stopReason: 'end_turn' },
      // Turn 2
      { type: 'tool_start', toolName: 'swap_quote', toolUseId: 'tc-2', input: {} },
      {
        type: 'tool_result',
        toolName: 'swap_quote',
        toolUseId: 'tc-2',
        result: { route: 'TURBOS' },
        isError: false,
      },
    ];

    const out = await collect(withStreamState(fromArray(input)));

    const streamStates = out.filter((e) => e.type === 'stream_state');
    expect(streamStates).toHaveLength(4);
    expect(streamStates.map((e) => e.type === 'stream_state' && e.state)).toEqual([
      'routing',
      'quoting',
      'routing',
      'quoting',
    ]);
  });

  it('does NOT fire on non-swap_quote tools', async () => {
    const input: EngineEvent[] = [
      { type: 'tool_start', toolName: 'balance_check', toolUseId: 'tc-1', input: {} },
      {
        type: 'tool_result',
        toolName: 'balance_check',
        toolUseId: 'tc-1',
        result: { total: 100 },
        isError: false,
      },
      { type: 'tool_start', toolName: 'savings_info', toolUseId: 'tc-2', input: {} },
      {
        type: 'tool_result',
        toolName: 'savings_info',
        toolUseId: 'tc-2',
        result: { savingsUsd: 50 },
        isError: false,
      },
    ];

    const out = await collect(withStreamState(fromArray(input)));

    expect(out.find((e) => e.type === 'stream_state')).toBeUndefined();
    expect(out).toHaveLength(input.length);
  });

  it('ignores microcompact dedup events (toolName: __deduped__)', async () => {
    const input: EngineEvent[] = [
      // microcompact synthetic dedup event for a previous-turn swap_quote
      {
        type: 'tool_result',
        toolName: '__deduped__',
        toolUseId: 'tc-1',
        result: null,
        isError: false,
        resultDeduped: true,
      },
    ];

    const out = await collect(withStreamState(fromArray(input)));

    expect(out.find((e) => e.type === 'stream_state')).toBeUndefined();
  });

  it('passes through unrelated event types unchanged', async () => {
    const input: EngineEvent[] = [
      { type: 'thinking_delta', text: 'Let me see...', blockIndex: 0 },
      { type: 'thinking_done', blockIndex: 0 },
      { type: 'text_delta', text: 'Routing your swap...' },
      { type: 'usage', inputTokens: 100, outputTokens: 50 },
    ];

    const out = await collect(withStreamState(fromArray(input)));

    expect(out).toEqual(input);
  });

  it('handles same-turn cached swap_quote (tool_result without preceding tool_start)', async () => {
    // TurnReadCache hit: re-asking swap_quote in the same turn yields a
    // tool_result with resultDeduped: true and NO tool_start. The wrapper
    // should still emit `quoting` (semantically correct: UI is about to
    // show a quote card; routing just happened to be instant).
    const input: EngineEvent[] = [
      {
        type: 'tool_result',
        toolName: 'swap_quote',
        toolUseId: 'tc-1',
        result: { route: 'CETUS' },
        isError: false,
        resultDeduped: true,
      },
    ];

    const out = await collect(withStreamState(fromArray(input)));

    expect(out).toHaveLength(2);
    expect(out[0].type).toBe('tool_result');
    expect(out[1]).toEqual({ type: 'stream_state', state: 'quoting' });
  });

  it('preserves emission order (routing fires BEFORE the tool_start it precedes)', async () => {
    // This is the contract that lets the host UI render the routing chip
    // before the tool block starts spinning. Re-stating as a property test.
    const input: EngineEvent[] = [
      { type: 'tool_start', toolName: 'swap_quote', toolUseId: 'tc-1', input: {} },
    ];

    const out = await collect(withStreamState(fromArray(input)));

    const routingIdx = out.findIndex(
      (e) => e.type === 'stream_state' && e.state === 'routing',
    );
    const toolStartIdx = out.findIndex(
      (e) => e.type === 'tool_start' && e.toolName === 'swap_quote',
    );
    expect(routingIdx).toBeGreaterThanOrEqual(0);
    expect(toolStartIdx).toBeGreaterThanOrEqual(0);
    expect(routingIdx).toBeLessThan(toolStartIdx);
  });

  it('preserves emission order (quoting fires AFTER the tool_result it follows)', async () => {
    const input: EngineEvent[] = [
      {
        type: 'tool_result',
        toolName: 'swap_quote',
        toolUseId: 'tc-1',
        result: { route: 'CETUS' },
        isError: false,
      },
    ];

    const out = await collect(withStreamState(fromArray(input)));

    const toolResultIdx = out.findIndex(
      (e) => e.type === 'tool_result' && e.toolName === 'swap_quote',
    );
    const quotingIdx = out.findIndex(
      (e) => e.type === 'stream_state' && e.state === 'quoting',
    );
    expect(toolResultIdx).toBeGreaterThanOrEqual(0);
    expect(quotingIdx).toBeGreaterThanOrEqual(0);
    expect(quotingIdx).toBeGreaterThan(toolResultIdx);
  });
});
