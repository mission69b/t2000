import { describe, it, expect, vi } from 'vitest';
import { EarlyToolDispatcher } from '../early-dispatcher.js';
import type { Tool, ToolContext, EngineEvent } from '../types.js';
import type { PendingToolCall } from '../orchestration.js';
import { z } from 'zod';

function makeTool(overrides: Partial<Tool> = {}): Tool {
  return {
    name: 'read_tool',
    description: 'test',
    inputSchema: z.object({}).passthrough(),
    jsonSchema: { type: 'object', properties: {} },
    call: vi.fn().mockResolvedValue({ data: { result: 'ok' } }),
    isReadOnly: true,
    isConcurrencySafe: true,
    permissionLevel: 'auto',
    flags: {},
    ...overrides,
  };
}

function makeCall(id: string, name: string, input: unknown = {}): PendingToolCall {
  return { id, name, input };
}

const ctx: ToolContext = {};

async function collectAll(gen: AsyncGenerator<EngineEvent>): Promise<EngineEvent[]> {
  const events: EngineEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

describe('EarlyToolDispatcher', () => {
  it('dispatches read-only tools and returns true', () => {
    const tool = makeTool();
    const dispatcher = new EarlyToolDispatcher([tool], ctx);
    const dispatched = dispatcher.tryDispatch(makeCall('t1', 'read_tool'));
    expect(dispatched).toBe(true);
    expect(dispatcher.hasPending()).toBe(true);
    expect(tool.call).toHaveBeenCalledOnce();
  });

  it('rejects write tools and returns false', () => {
    const tool = makeTool({ name: 'write_tool', isReadOnly: false, isConcurrencySafe: false, permissionLevel: 'confirm' });
    const dispatcher = new EarlyToolDispatcher([tool], ctx);
    const dispatched = dispatcher.tryDispatch(makeCall('t1', 'write_tool'));
    expect(dispatched).toBe(false);
    expect(dispatcher.hasPending()).toBe(false);
  });

  it('rejects unknown tools and returns false', () => {
    const dispatcher = new EarlyToolDispatcher([], ctx);
    const dispatched = dispatcher.tryDispatch(makeCall('t1', 'unknown'));
    expect(dispatched).toBe(false);
  });

  it('collects results in dispatch order regardless of completion order', async () => {
    let resolveFirst!: (v: { data: unknown }) => void;
    let resolveSecond!: (v: { data: unknown }) => void;

    const slowTool = makeTool({
      name: 'slow_tool',
      call: () => new Promise((r) => { resolveFirst = r; }),
    });
    const fastTool = makeTool({
      name: 'fast_tool',
      call: () => new Promise((r) => { resolveSecond = r; }),
    });

    const dispatcher = new EarlyToolDispatcher([slowTool, fastTool], ctx);
    dispatcher.tryDispatch(makeCall('t1', 'slow_tool'));
    dispatcher.tryDispatch(makeCall('t2', 'fast_tool'));

    // Fast tool completes first
    resolveSecond({ data: { fast: true } });
    // Then slow tool
    resolveFirst({ data: { slow: true } });

    const events = await collectAll(dispatcher.collectResults());
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ type: 'tool_result', toolName: 'slow_tool', toolUseId: 't1' });
    expect(events[1]).toMatchObject({ type: 'tool_result', toolName: 'fast_tool', toolUseId: 't2' });
  });

  it('handles tool execution errors gracefully', async () => {
    const failTool = makeTool({
      name: 'fail_tool',
      call: vi.fn().mockRejectedValue(new Error('network timeout')),
    });
    const dispatcher = new EarlyToolDispatcher([failTool], ctx);
    dispatcher.tryDispatch(makeCall('t1', 'fail_tool'));

    const events = await collectAll(dispatcher.collectResults());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'tool_result',
      toolName: 'fail_tool',
      isError: true,
    });
    if (events[0].type === 'tool_result') {
      expect(events[0].result).toMatchObject({ error: 'network timeout' });
    }
  });

  it('applies tool result budgeting to early-dispatched tools', async () => {
    const bigResult = { data: { payload: 'x'.repeat(200) } };
    const tool = makeTool({
      name: 'big_tool',
      maxResultSizeChars: 50,
      call: vi.fn().mockResolvedValue(bigResult),
    });
    const dispatcher = new EarlyToolDispatcher([tool], ctx);
    dispatcher.tryDispatch(makeCall('t1', 'big_tool'));

    const events = await collectAll(dispatcher.collectResults());
    expect(events).toHaveLength(1);
    if (events[0].type === 'tool_result') {
      const r = String(events[0].result);
      expect(r).toContain('Truncated');
    }
  });

  it('tracks dispatched IDs', () => {
    const tool = makeTool();
    const dispatcher = new EarlyToolDispatcher([tool], ctx);
    dispatcher.tryDispatch(makeCall('t1', 'read_tool'));
    dispatcher.tryDispatch(makeCall('t2', 'read_tool'));

    const ids = dispatcher.dispatchedIds();
    expect(ids.has('t1')).toBe(true);
    expect(ids.has('t2')).toBe(true);
    expect(ids.has('t3')).toBe(false);
  });

  it('abort cancels in-flight tools', async () => {
    let capturedSignal: AbortSignal | undefined;
    const tool = makeTool({
      name: 'abort_tool',
      call: vi.fn().mockImplementation((_input, toolCtx) => {
        capturedSignal = toolCtx.signal;
        return new Promise((_, reject) => {
          if (toolCtx.signal?.aborted) reject(new Error('Aborted'));
          toolCtx.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
        });
      }),
    });

    const dispatcher = new EarlyToolDispatcher([tool], ctx);
    dispatcher.tryDispatch(makeCall('t1', 'abort_tool'));
    dispatcher.abort();

    expect(capturedSignal?.aborted).toBe(true);

    const events = await collectAll(dispatcher.collectResults());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'tool_result', isError: true });
  });

  it('handles mixed read + write calls correctly', () => {
    const readTool = makeTool({ name: 'read_tool' });
    const writeTool = makeTool({ name: 'write_tool', isReadOnly: false, isConcurrencySafe: false, permissionLevel: 'confirm' });

    const dispatcher = new EarlyToolDispatcher([readTool, writeTool], ctx);

    expect(dispatcher.tryDispatch(makeCall('t1', 'read_tool'))).toBe(true);
    expect(dispatcher.tryDispatch(makeCall('t2', 'write_tool'))).toBe(false);
    expect(dispatcher.dispatchedIds().size).toBe(1);
  });

  it('returns empty results when nothing dispatched', async () => {
    const dispatcher = new EarlyToolDispatcher([], ctx);
    const events = await collectAll(dispatcher.collectResults());
    expect(events).toHaveLength(0);
  });
});
