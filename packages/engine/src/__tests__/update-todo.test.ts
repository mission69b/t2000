import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { QueryEngine } from '../engine.js';
import { buildTool } from '../tool.js';
import { updateTodoTool } from '../tools/update-todo.js';
import type {
  ChatParams,
  EngineEvent,
  LLMProvider,
  ProviderEvent,
} from '../types.js';

// ---------------------------------------------------------------------------
// Mock LLM provider — same shape as engine.test.ts
// ---------------------------------------------------------------------------

type ScriptedTurn =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; id: string; name: string; input: unknown };

function createMockProvider(turns: ScriptedTurn[][]): LLMProvider {
  let callIndex = 0;
  return {
    async *chat(_params: ChatParams): AsyncGenerator<ProviderEvent> {
      const turn = turns[callIndex] ?? [];
      callIndex++;
      yield { type: 'message_start', messageId: `msg-${callIndex}`, model: 'mock' };
      yield { type: 'usage', inputTokens: 100, outputTokens: 50 };
      const hasToolCalls = turn.some((t) => t.type === 'tool_call');
      for (const item of turn) {
        if (item.type === 'text') {
          yield { type: 'text_delta', text: item.text };
        } else if (item.type === 'tool_call') {
          yield { type: 'tool_use_start', id: item.id, name: item.name };
          yield { type: 'tool_use_done', id: item.id, name: item.name, input: item.input };
        }
      }
      yield { type: 'stop', reason: hasToolCalls ? 'tool_use' : 'end_turn' };
    },
  };
}

async function collectEvents(gen: AsyncGenerator<EngineEvent>): Promise<EngineEvent[]> {
  const out: EngineEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

// ---------------------------------------------------------------------------
// Preflight unit tests — run synchronously, no engine
// ---------------------------------------------------------------------------

// Narrowing helper — surfaces the error message once we've asserted invalid.
function expectInvalid(r: ReturnType<NonNullable<typeof updateTodoTool.preflight>>): string {
  expect(r.valid).toBe(false);
  if (r.valid) throw new Error('preflight unexpectedly valid');
  return r.error;
}

describe('update_todo preflight', () => {
  it('rejects empty items array', () => {
    const err = expectInvalid(updateTodoTool.preflight!({ items: [] }));
    expect(err).toMatch(/at least 1/i);
  });

  it('rejects more than 8 items', () => {
    const items = Array.from({ length: 9 }, (_, i) => ({
      id: `step-${i}`,
      label: `Step ${i}`,
      status: i === 0 ? ('in_progress' as const) : ('pending' as const),
    }));
    const err = expectInvalid(updateTodoTool.preflight!({ items }));
    expect(err).toMatch(/at most 8/i);
  });

  it('rejects label longer than 80 chars', () => {
    const err = expectInvalid(
      updateTodoTool.preflight!({
        items: [{ id: 'a', label: 'x'.repeat(81), status: 'in_progress' }],
      }),
    );
    expect(err).toMatch(/exceeds 80 chars/i);
  });

  it('rejects zero in_progress', () => {
    const err = expectInvalid(
      updateTodoTool.preflight!({
        items: [
          { id: 'a', label: 'Step A', status: 'pending' },
          { id: 'b', label: 'Step B', status: 'completed' },
        ],
      }),
    );
    expect(err).toMatch(/exactly 1.*in_progress.*got 0/i);
  });

  it('rejects multiple in_progress', () => {
    const err = expectInvalid(
      updateTodoTool.preflight!({
        items: [
          { id: 'a', label: 'Step A', status: 'in_progress' },
          { id: 'b', label: 'Step B', status: 'in_progress' },
        ],
      }),
    );
    expect(err).toMatch(/exactly 1.*in_progress.*got 2/i);
  });

  it('rejects duplicate ids', () => {
    const err = expectInvalid(
      updateTodoTool.preflight!({
        items: [
          { id: 'same', label: 'Step A', status: 'in_progress' },
          { id: 'same', label: 'Step B', status: 'pending' },
        ],
      }),
    );
    expect(err).toMatch(/duplicate.*"same"/i);
  });

  it('rejects empty id', () => {
    const err = expectInvalid(
      updateTodoTool.preflight!({
        items: [{ id: '   ', label: 'Step', status: 'in_progress' }],
      }),
    );
    expect(err).toMatch(/non-empty id/i);
  });

  it('rejects empty label', () => {
    expectInvalid(
      updateTodoTool.preflight!({
        items: [{ id: 'a', label: '', status: 'in_progress' }],
      }),
    );
  });

  it('rejects id longer than 40 chars', () => {
    const err = expectInvalid(
      updateTodoTool.preflight!({
        items: [{ id: 'x'.repeat(41), label: 'Step', status: 'in_progress' }],
      }),
    );
    expect(err).toMatch(/exceeds 40 chars/i);
  });

  it('accepts a valid 1-item list', () => {
    const r = updateTodoTool.preflight!({
      items: [{ id: 'a', label: 'The thing', status: 'in_progress' }],
    });
    expect(r.valid).toBe(true);
  });

  it('accepts a valid 8-item list with exactly 1 in_progress', () => {
    const items = Array.from({ length: 8 }, (_, i) => ({
      id: `step-${i}`,
      label: `Step ${i}`,
      status: i === 3 ? ('in_progress' as const) : i < 3 ? ('completed' as const) : ('pending' as const),
    }));
    const r = updateTodoTool.preflight!({ items });
    expect(r.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tool call unit test — verify pass-through shape
// ---------------------------------------------------------------------------

describe('update_todo call', () => {
  it('returns __todoUpdate flag and items pass-through', async () => {
    const items = [
      { id: 'a', label: 'Check balance', status: 'completed' as const },
      { id: 'b', label: 'Compute split', status: 'in_progress' as const },
    ];
    const result = await updateTodoTool.call(
      { items },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any,
    );
    const data = result.data as { __todoUpdate: boolean; items: typeof items };
    expect(data.__todoUpdate).toBe(true);
    expect(data.items).toEqual(items);
    expect(result.displayText).toContain('2 step');
  });
});

// ---------------------------------------------------------------------------
// Engine integration — todo_update side-channel + maxTurns exemption
// ---------------------------------------------------------------------------

describe('update_todo engine integration', () => {
  it('emits a todo_update side-channel event when the LLM calls update_todo', async () => {
    const todoItems = [{ id: 'a', label: 'Doing it', status: 'in_progress' as const }];
    const provider = createMockProvider([
      [{ type: 'tool_call', id: 'tu-1', name: 'update_todo', input: { items: todoItems } }],
      [{ type: 'text', text: 'Done.' }],
    ]);
    const engine = new QueryEngine({
      provider,
      tools: [updateTodoTool],
      systemPrompt: 'Test',
      maxTurns: 5,
    });
    const events = await collectEvents(engine.submitMessage('plan it'));
    const todoUpdate = events.find((e) => e.type === 'todo_update');
    expect(todoUpdate).toBeDefined();
    if (todoUpdate?.type === 'todo_update') {
      expect(todoUpdate.items).toEqual(todoItems);
      expect(todoUpdate.toolUseId).toBe('tu-1');
    }
  });

  it('exempts update_todo-only iterations from the maxTurns budget', async () => {
    // Build a script with 8 update_todo iterations followed by a final
    // text turn. With maxTurns=3 and NO exemption, this would terminate
    // with stopReason='max_turns' on iteration 4 (turn 1-3 = 3 update_todos,
    // turn 4 hits cap). With the exemption, all 8 update_todo iterations
    // are free and the final text turn exits cleanly with 'end_turn'.
    const todoCalls = Array.from({ length: 8 }, (_, i) => [
      {
        type: 'tool_call' as const,
        id: `tu-${i}`,
        name: 'update_todo',
        input: {
          items: [{ id: `s${i}`, label: `Step ${i}`, status: 'in_progress' as const }],
        },
      },
    ]);
    const provider = createMockProvider([
      ...todoCalls,
      [{ type: 'text', text: 'All planned.' }],
    ]);
    const engine = new QueryEngine({
      provider,
      tools: [updateTodoTool],
      systemPrompt: 'Test',
      maxTurns: 3,
    });
    const events = await collectEvents(engine.submitMessage('plan it'));
    const turnComplete = events.find((e) => e.type === 'turn_complete');
    expect(turnComplete).toBeDefined();
    if (turnComplete?.type === 'turn_complete') {
      expect(turnComplete.stopReason).toBe('end_turn');
    }
    const todoUpdates = events.filter((e) => e.type === 'todo_update');
    expect(todoUpdates).toHaveLength(8);
  });

  it('does NOT exempt mixed iterations (update_todo + another tool)', async () => {
    // Mixed iteration counts — when the LLM calls update_todo alongside a
    // real read tool, the iteration is real work and the budget MUST tick.
    const otherTool = buildTool({
      name: 'noop',
      description: 'No-op',
      inputSchema: z.object({}),
      jsonSchema: { type: 'object', properties: {} },
      isReadOnly: true,
      async call() {
        return { data: { ok: true } };
      },
    });
    const mixedTurn = [
      {
        type: 'tool_call' as const,
        id: 'tu-todo',
        name: 'update_todo',
        input: {
          items: [{ id: 'a', label: 'Do it', status: 'in_progress' as const }],
        },
      },
      { type: 'tool_call' as const, id: 'tu-noop', name: 'noop', input: {} },
    ];
    const provider = createMockProvider([
      mixedTurn,
      mixedTurn,
      mixedTurn,
      mixedTurn, // 4th — should hit cap with maxTurns=3 (no exemption)
      [{ type: 'text', text: 'should never reach here' }],
    ]);
    const engine = new QueryEngine({
      provider,
      tools: [updateTodoTool, otherTool],
      systemPrompt: 'Test',
      maxTurns: 3,
    });
    const events = await collectEvents(engine.submitMessage('go'));
    const turnComplete = events.find((e) => e.type === 'turn_complete');
    expect(turnComplete).toBeDefined();
    if (turnComplete?.type === 'turn_complete') {
      expect(turnComplete.stopReason).toBe('max_turns');
    }
  });
});
