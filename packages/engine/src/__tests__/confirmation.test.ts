import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { QueryEngine } from '../engine.js';
import { buildTool } from '../tool.js';
import type {
  LLMProvider,
  ChatParams,
  ProviderEvent,
  EngineEvent,
  PendingAction,
  Tool,
} from '../types.js';

// ---------------------------------------------------------------------------
// Mock provider
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
      yield { type: 'usage', inputTokens: 50, outputTokens: 25 };

      const hasToolCalls = turn.some((t) => t.type === 'tool_call');

      for (const item of turn) {
        if (item.type === 'text') {
          yield { type: 'text_delta', text: item.text };
        } else {
          yield { type: 'tool_use_start', id: item.id, name: item.name };
          yield { type: 'tool_use_done', id: item.id, name: item.name, input: item.input };
        }
      }

      yield { type: 'stop', reason: hasToolCalls ? 'tool_use' : 'end_turn' };
    },
  };
}

async function collectEvents(gen: AsyncGenerator<EngineEvent>): Promise<EngineEvent[]> {
  const events: EngineEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

// ---------------------------------------------------------------------------
// Test tools
// ---------------------------------------------------------------------------

const readTool: Tool = buildTool({
  name: 'check',
  description: 'Read-only check',
  inputSchema: z.object({}),
  jsonSchema: { type: 'object', properties: {} },
  isReadOnly: true,
  async call() {
    return { data: { balance: 100 } };
  },
});

const writeTool: Tool = buildTool({
  name: 'transfer',
  description: 'Transfer funds',
  inputSchema: z.object({ to: z.string(), amount: z.number() }),
  jsonSchema: {
    type: 'object',
    properties: { to: { type: 'string' }, amount: { type: 'number' } },
    required: ['to', 'amount'],
  },
  isReadOnly: false,
  permissionLevel: 'confirm',
  async call(input) {
    return { data: { success: true, to: input.to, amount: input.amount } };
  },
});

const autoWriteTool: Tool = buildTool({
  name: 'auto_action',
  description: 'Auto-approved write',
  inputSchema: z.object({}),
  jsonSchema: { type: 'object', properties: {} },
  isReadOnly: false,
  permissionLevel: 'auto',
  async call() {
    return { data: { done: true } };
  },
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Confirmation flow (pending_action + resumeWithToolResult)', () => {
  it('auto-approves read-only tools without pending_action', async () => {
    const provider = createMockProvider([
      [{ type: 'tool_call', id: 'tc-1', name: 'check', input: {} }],
      [{ type: 'text', text: 'Balance is $100' }],
    ]);

    const engine = new QueryEngine({
      provider,
      tools: [readTool],
      systemPrompt: 'Test',
    });

    const events = await collectEvents(engine.submitMessage('Check balance'));

    const pendingActions = events.filter((e) => e.type === 'pending_action');
    expect(pendingActions).toHaveLength(0);

    const results = events.filter((e) => e.type === 'tool_result');
    expect(results).toHaveLength(1);
  });

  it('yields pending_action for write tools and stops the stream', async () => {
    const provider = createMockProvider([
      [{ type: 'tool_call', id: 'tc-1', name: 'transfer', input: { to: '0xabc', amount: 50 } }],
      [{ type: 'text', text: 'Sent $50 to 0xabc' }],
    ]);

    const engine = new QueryEngine({
      provider,
      tools: [readTool, writeTool],
      systemPrompt: 'Test',
    });

    const events = await collectEvents(engine.submitMessage('Send $50 to 0xabc'));

    const pendingActions = events.filter((e) => e.type === 'pending_action');
    expect(pendingActions).toHaveLength(1);

    const pa = pendingActions[0];
    if (pa.type === 'pending_action') {
      expect(pa.action.toolName).toBe('transfer');
      expect(pa.action.description).toContain('transfer');
      expect(pa.action.toolUseId).toBe('tc-1');
    }

    // Stream should NOT contain turn_complete — it stopped at pending_action
    const turnCompletes = events.filter((e) => e.type === 'turn_complete');
    expect(turnCompletes).toHaveLength(0);
  });

  it('resumes with tool result after approval', async () => {
    const provider = createMockProvider([
      [{ type: 'tool_call', id: 'tc-1', name: 'transfer', input: { to: '0xabc', amount: 50 } }],
      [{ type: 'text', text: 'Sent $50 to 0xabc' }],
    ]);

    const engine = new QueryEngine({
      provider,
      tools: [readTool, writeTool],
      systemPrompt: 'Test',
    });

    // Phase 1: submit message, get pending action
    let pendingAction: PendingAction | null = null;
    for await (const event of engine.submitMessage('Send $50 to 0xabc')) {
      if (event.type === 'pending_action') {
        pendingAction = event.action;
      }
    }
    expect(pendingAction).not.toBeNull();

    // Phase 2: resume with the client-provided execution result
    const resumeEvents = await collectEvents(
      engine.resumeWithToolResult(pendingAction!, {
        approved: true,
        executionResult: { digest: '0xdeadbeef', success: true },
      }),
    );

    // Should emit tool_result then continue the LLM loop
    const toolResults = resumeEvents.filter((e) => e.type === 'tool_result');
    expect(toolResults).toHaveLength(1);
    if (toolResults[0].type === 'tool_result') {
      expect(toolResults[0].isError).toBe(false);
    }

    const textDeltas = resumeEvents.filter((e) => e.type === 'text_delta');
    expect(textDeltas.length).toBeGreaterThan(0);

    const turnComplete = resumeEvents.find((e) => e.type === 'turn_complete');
    expect(turnComplete).toBeDefined();
  });

  it('handles denial via resumeWithToolResult', async () => {
    const provider = createMockProvider([
      [{ type: 'tool_call', id: 'tc-1', name: 'transfer', input: { to: '0xabc', amount: 50 } }],
      [{ type: 'text', text: 'Transaction cancelled.' }],
    ]);

    const engine = new QueryEngine({
      provider,
      tools: [readTool, writeTool],
      systemPrompt: 'Test',
    });

    let pendingAction: PendingAction | null = null;
    for await (const event of engine.submitMessage('Send $50')) {
      if (event.type === 'pending_action') {
        pendingAction = event.action;
      }
    }
    expect(pendingAction).not.toBeNull();

    const resumeEvents = await collectEvents(
      engine.resumeWithToolResult(pendingAction!, { approved: false }),
    );

    const toolResults = resumeEvents.filter((e) => e.type === 'tool_result');
    expect(toolResults).toHaveLength(1);
    if (toolResults[0].type === 'tool_result') {
      expect(toolResults[0].isError).toBe(true);
      const data = toolResults[0].result as { error: string };
      expect(data.error).toContain('declined');
    }

    // Stream should end without another LLM call on denial
    const turnComplete = resumeEvents.find((e) => e.type === 'turn_complete');
    expect(turnComplete).toBeDefined();
  });

  it('auto-approves write tools with permissionLevel: auto', async () => {
    const provider = createMockProvider([
      [{ type: 'tool_call', id: 'tc-1', name: 'auto_action', input: {} }],
      [{ type: 'text', text: 'Done' }],
    ]);

    const engine = new QueryEngine({
      provider,
      tools: [autoWriteTool],
      systemPrompt: 'Test',
    });

    const events = await collectEvents(engine.submitMessage('Do it'));

    const pendingActions = events.filter((e) => e.type === 'pending_action');
    expect(pendingActions).toHaveLength(0);

    const results = events.filter((e) => e.type === 'tool_result');
    expect(results).toHaveLength(1);
    if (results[0].type === 'tool_result') {
      expect(results[0].isError).toBe(false);
    }
  });

  it('handles mixed read + write: reads execute, write yields pending_action', async () => {
    const provider = createMockProvider([
      [
        { type: 'tool_call', id: 'tc-1', name: 'check', input: {} },
        { type: 'tool_call', id: 'tc-2', name: 'transfer', input: { to: '0x123', amount: 10 } },
      ],
      [{ type: 'text', text: 'Checked and transferred.' }],
    ]);

    const engine = new QueryEngine({
      provider,
      tools: [readTool, writeTool],
      systemPrompt: 'Test',
    });

    const events = await collectEvents(engine.submitMessage('Check and send'));

    // The read tool should NOT have a result yet (engine yields pending_action first)
    // because the write tool in the same batch triggers pending_action
    const pendingActions = events.filter((e) => e.type === 'pending_action');
    expect(pendingActions).toHaveLength(1);
  });
});

describe('Cost tracking integration', () => {
  it('blocks when budget is exceeded', async () => {
    const provider = createMockProvider([
      [{ type: 'text', text: 'First response' }],
    ]);

    const engine = new QueryEngine({
      provider,
      tools: [],
      systemPrompt: 'Test',
      costTracker: { budgetLimitUsd: 0.0001 },
    });

    const events1 = await collectEvents(engine.submitMessage('Hello'));
    const usageEvents = events1.filter((e) => e.type === 'usage');
    expect(usageEvents.length).toBeGreaterThan(0);

    const events2 = await collectEvents(engine.submitMessage('Hello again'));
    const errorEvent = events2.find((e) => e.type === 'error');
    expect(errorEvent).toBeDefined();
    if (errorEvent?.type === 'error') {
      expect(errorEvent.error.message).toContain('budget');
    }
  });

  it('reports cost via getUsage()', async () => {
    const provider = createMockProvider([
      [{ type: 'text', text: 'Hi' }],
    ]);

    const engine = new QueryEngine({
      provider,
      tools: [],
      systemPrompt: 'Test',
    });

    await collectEvents(engine.submitMessage('Hello'));
    const usage = engine.getUsage();
    expect(usage.inputTokens).toBe(50);
    expect(usage.outputTokens).toBe(25);
    expect(usage.estimatedCostUsd).toBeGreaterThan(0);
  });

  it('resets cost on engine reset', async () => {
    const provider = createMockProvider([
      [{ type: 'text', text: 'Hi' }],
    ]);

    const engine = new QueryEngine({
      provider,
      tools: [],
      systemPrompt: 'Test',
    });

    await collectEvents(engine.submitMessage('Hello'));
    engine.reset();

    const usage = engine.getUsage();
    expect(usage.inputTokens).toBe(0);
    expect(usage.estimatedCostUsd).toBe(0);
  });

  it('accumulates cost across multiple submitMessage calls', async () => {
    const provider = createMockProvider([
      [{ type: 'text', text: 'Response 1' }],
      [{ type: 'text', text: 'Response 2' }],
    ]);

    const engine = new QueryEngine({
      provider,
      tools: [],
      systemPrompt: 'Test',
    });

    await collectEvents(engine.submitMessage('First'));
    await collectEvents(engine.submitMessage('Second'));

    const usage = engine.getUsage();
    expect(usage.inputTokens).toBe(100);
    expect(usage.outputTokens).toBe(50);
  });
});

describe('Confirmation edge cases', () => {
  it('handles provider error gracefully', async () => {
    const errorProvider: LLMProvider = {
      async *chat(): AsyncGenerator<ProviderEvent> {
        yield { type: 'message_start', messageId: 'msg-1', model: 'mock' };
        throw new Error('Network timeout');
      },
    };

    const engine = new QueryEngine({
      provider: errorProvider,
      tools: [],
      systemPrompt: 'Test',
    });

    let caughtError: Error | null = null;
    try {
      for await (const _event of engine.submitMessage('Hello')) {
        // iterating
      }
    } catch (err) {
      caughtError = err as Error;
    }

    expect(caughtError).not.toBeNull();
    expect(caughtError!.message).toContain('Network timeout');
  });
});
