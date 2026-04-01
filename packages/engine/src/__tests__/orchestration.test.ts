import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { TxMutex, runTools } from '../orchestration.js';
import { buildTool } from '../tool.js';
import type { EngineEvent, Tool } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReadTool(name: string, delay = 0): Tool {
  return buildTool({
    name,
    description: `Read tool: ${name}`,
    inputSchema: z.object({}),
    jsonSchema: { type: 'object', properties: {} },
    isReadOnly: true,
    async call() {
      if (delay) await new Promise((r) => setTimeout(r, delay));
      return { data: { source: name, ts: Date.now() } };
    },
  });
}

function makeWriteTool(name: string, sideEffect: () => void): Tool {
  return buildTool({
    name,
    description: `Write tool: ${name}`,
    inputSchema: z.object({}),
    jsonSchema: { type: 'object', properties: {} },
    isReadOnly: false,
    async call() {
      sideEffect();
      return { data: { written: name } };
    },
  });
}

async function collectEvents(gen: AsyncGenerator<EngineEvent>): Promise<EngineEvent[]> {
  const events: EngineEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

// ---------------------------------------------------------------------------
// TxMutex
// ---------------------------------------------------------------------------

describe('TxMutex', () => {
  it('serialises concurrent acquire calls', async () => {
    const mutex = new TxMutex();
    const order: number[] = [];

    const run = async (id: number) => {
      await mutex.acquire();
      order.push(id);
      await new Promise((r) => setTimeout(r, 10));
      mutex.release();
    };

    await Promise.all([run(1), run(2), run(3)]);

    expect(order).toEqual([1, 2, 3]);
  });

  it('allows immediate acquire when unlocked', async () => {
    const mutex = new TxMutex();
    await mutex.acquire();
    mutex.release();
    await mutex.acquire(); // should not deadlock
    mutex.release();
  });
});

// ---------------------------------------------------------------------------
// runTools — read parallelism
// ---------------------------------------------------------------------------

describe('runTools', () => {
  it('executes read tools in parallel', async () => {
    const tools = [makeReadTool('a', 50), makeReadTool('b', 50)];
    const mutex = new TxMutex();

    const start = Date.now();
    const events = await collectEvents(
      runTools(
        [
          { id: '1', name: 'a', input: {} },
          { id: '2', name: 'b', input: {} },
        ],
        tools,
        {},
        mutex,
      ),
    );
    const elapsed = Date.now() - start;

    expect(events).toHaveLength(2);
    expect(events.every((e) => e.type === 'tool_result')).toBe(true);
    // Both should complete in ~50ms (parallel), not ~100ms (serial)
    expect(elapsed).toBeLessThan(100);
  });

  it('executes write tools sequentially under mutex', async () => {
    const order: string[] = [];
    const tools = [
      makeWriteTool('w1', () => order.push('w1')),
      makeWriteTool('w2', () => order.push('w2')),
    ];
    const mutex = new TxMutex();

    const events = await collectEvents(
      runTools(
        [
          { id: '1', name: 'w1', input: {} },
          { id: '2', name: 'w2', input: {} },
        ],
        tools,
        {},
        mutex,
      ),
    );

    expect(events).toHaveLength(2);
    expect(order).toEqual(['w1', 'w2']);
  });

  it('runs reads before writes in a mixed batch', async () => {
    const order: string[] = [];
    const readTool = buildTool({
      name: 'read',
      description: 'Read',
      inputSchema: z.object({}),
      jsonSchema: { type: 'object', properties: {} },
      isReadOnly: true,
      async call() {
        order.push('read');
        return { data: 'read-result' };
      },
    });
    const writeTool = buildTool({
      name: 'write',
      description: 'Write',
      inputSchema: z.object({}),
      jsonSchema: { type: 'object', properties: {} },
      isReadOnly: false,
      async call() {
        order.push('write');
        return { data: 'write-result' };
      },
    });

    const mutex = new TxMutex();
    await collectEvents(
      runTools(
        [
          { id: '1', name: 'read', input: {} },
          { id: '2', name: 'write', input: {} },
        ],
        [readTool, writeTool],
        {},
        mutex,
      ),
    );

    expect(order).toEqual(['read', 'write']);
  });

  it('handles tool execution errors gracefully', async () => {
    const failTool = buildTool({
      name: 'fail',
      description: 'Always fails',
      inputSchema: z.object({}),
      jsonSchema: { type: 'object', properties: {} },
      isReadOnly: true,
      async call() {
        throw new Error('Boom');
      },
    });

    const mutex = new TxMutex();
    const events = await collectEvents(
      runTools(
        [{ id: '1', name: 'fail', input: {} }],
        [failTool],
        {},
        mutex,
      ),
    );

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('tool_result');
    if (events[0].type === 'tool_result') {
      expect(events[0].isError).toBe(true);
    }
  });

  it('rejects invalid input via zod schema', async () => {
    const strictTool = buildTool({
      name: 'strict',
      description: 'Requires a number',
      inputSchema: z.object({ count: z.number() }),
      jsonSchema: {
        type: 'object',
        properties: { count: { type: 'number' } },
        required: ['count'],
      },
      isReadOnly: true,
      async call(input) {
        return { data: input };
      },
    });

    const mutex = new TxMutex();
    const events = await collectEvents(
      runTools(
        [{ id: '1', name: 'strict', input: { count: 'not-a-number' } }],
        [strictTool],
        {},
        mutex,
      ),
    );

    expect(events).toHaveLength(1);
    if (events[0].type === 'tool_result') {
      const data = events[0].result as { error: string };
      expect(data.error).toContain('Invalid input');
    }
  });

  it('returns error for unknown tool names instead of crashing', async () => {
    const mutex = new TxMutex();
    const events = await collectEvents(
      runTools(
        [{ id: '1', name: 'nonexistent', input: {} }],
        [], // no tools registered
        {},
        mutex,
      ),
    );

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('tool_result');
    if (events[0].type === 'tool_result') {
      expect(events[0].isError).toBe(true);
      const data = events[0].result as { error: string };
      expect(data.error).toContain('Unknown tool');
    }
  });

  it('returns error for unknown write tool names', async () => {
    // Force an unknown tool into the write partition by having a known write tool
    // alongside an unknown one — the unknown one goes to reads in partition,
    // but let's test the write guard directly
    const writeTool = buildTool({
      name: 'known_write',
      description: 'Write',
      inputSchema: z.object({}),
      jsonSchema: { type: 'object', properties: {} },
      isReadOnly: false,
      async call() {
        return { data: 'ok' };
      },
    });

    const mutex = new TxMutex();
    const events = await collectEvents(
      runTools(
        [
          { id: '1', name: 'known_write', input: {} },
          { id: '2', name: 'ghost_write', input: {} },
        ],
        [writeTool],
        {},
        mutex,
      ),
    );

    // known_write succeeds, ghost_write is partitioned to reads (unknown) and errors
    const results = events.filter((e) => e.type === 'tool_result');
    expect(results).toHaveLength(2);
    const ghostResult = results.find(
      (e) => e.type === 'tool_result' && e.toolName === 'ghost_write',
    );
    expect(ghostResult).toBeDefined();
    if (ghostResult?.type === 'tool_result') {
      expect(ghostResult.isError).toBe(true);
    }
  });

  it('yields zero events for empty pending list', async () => {
    const mutex = new TxMutex();
    const events = await collectEvents(
      runTools([], [makeReadTool('unused')], {}, mutex),
    );
    expect(events).toHaveLength(0);
  });

  it('handles write tool errors without breaking the mutex', async () => {
    const failWrite = buildTool({
      name: 'fail_write',
      description: 'Fails',
      inputSchema: z.object({}),
      jsonSchema: { type: 'object', properties: {} },
      isReadOnly: false,
      async call() {
        throw new Error('Write failed');
      },
    });
    const okWrite = makeWriteTool('ok_write', () => {});

    const mutex = new TxMutex();
    const events = await collectEvents(
      runTools(
        [
          { id: '1', name: 'fail_write', input: {} },
          { id: '2', name: 'ok_write', input: {} },
        ],
        [failWrite, okWrite],
        {},
        mutex,
      ),
    );

    expect(events).toHaveLength(2);
    if (events[0].type === 'tool_result') {
      expect(events[0].isError).toBe(true);
      expect(events[0].toolName).toBe('fail_write');
    }
    if (events[1].type === 'tool_result') {
      expect(events[1].isError).toBe(false);
      expect(events[1].toolName).toBe('ok_write');
    }
  });
});
