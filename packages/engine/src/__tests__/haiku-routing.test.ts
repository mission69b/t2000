import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { QueryEngine } from '../engine.js';
import { buildTool } from '../tool.js';
import type {
  LLMProvider,
  ChatParams,
  ProviderEvent,
  EngineEvent,
  Tool,
} from '../types.js';

type ScriptedTurn =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; id: string; name: string; input: unknown };

function createMockProvider(
  turns: ScriptedTurn[][],
  expectedModel?: string,
): { provider: LLMProvider; receivedModels: (string | undefined)[] } {
  let callIndex = 0;
  const receivedModels: (string | undefined)[] = [];

  const provider: LLMProvider = {
    async *chat(params: ChatParams): AsyncGenerator<ProviderEvent> {
      receivedModels.push(params.model);
      const turn = turns[callIndex] ?? [];
      callIndex++;

      yield { type: 'message_start', messageId: `msg-${callIndex}`, model: expectedModel ?? 'mock' };
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

  return { provider, receivedModels };
}

async function collectEvents(gen: AsyncGenerator<EngineEvent>): Promise<EngineEvent[]> {
  const events: EngineEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

const HAIKU_MODEL = 'claude-3-5-haiku-20241022';

describe('Haiku model routing validation (Phase F.1)', () => {
  const balanceTool: Tool = buildTool({
    name: 'balance_check',
    description: 'Check wallet balance',
    inputSchema: z.object({}),
    jsonSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
    permission: 'auto',
    execute: async () => ({
      displayText: 'Balance: $106.28',
      data: { total: 106.28, usdc: 100, sui: 0.5 },
    }),
  });

  const saveTool: Tool = buildTool({
    name: 'save_deposit',
    description: 'Deposit USDC into savings',
    inputSchema: z.object({ amount: z.number() }),
    jsonSchema: {
      type: 'object' as const,
      properties: { amount: { type: 'number' as const } },
      required: ['amount'],
    },
    isReadOnly: false,
    permissionLevel: 'confirm',
    async call(input: { amount: number }) {
      return { data: { success: true, amount: input.amount } };
    },
  });

  it('passes Haiku model string through to provider', async () => {
    const { provider, receivedModels } = createMockProvider(
      [[{ type: 'text', text: 'Your balance is $106.28' }]],
      HAIKU_MODEL,
    );

    const engine = new QueryEngine({
      provider,
      tools: [balanceTool],
      model: HAIKU_MODEL,
      systemPrompt: { type: 'text', text: 'You are a financial assistant.' },
    });

    const events = await collectEvents(engine.submitMessage('Check my balance'));

    expect(receivedModels).toContain(HAIKU_MODEL);
    expect(events.some((e) => e.type === 'text_delta')).toBe(true);
    expect(events.some((e) => e.type === 'turn_complete')).toBe(true);
  });

  it('handles read tool calls (auto permission) with Haiku model', async () => {
    const { provider } = createMockProvider(
      [
        [{ type: 'tool_call', id: 'tc1', name: 'balance_check', input: {} }],
        [{ type: 'text', text: 'Your balance is $106.28 USDC.' }],
      ],
      HAIKU_MODEL,
    );

    const engine = new QueryEngine({
      provider,
      tools: [balanceTool],
      model: HAIKU_MODEL,
      systemPrompt: { type: 'text', text: 'You are a financial assistant.' },
    });

    const events = await collectEvents(engine.submitMessage('What is my balance?'));

    const toolResults = events.filter((e) => e.type === 'tool_result');
    expect(toolResults.length).toBe(1);
    expect((toolResults[0] as { toolName: string }).toolName).toBe('balance_check');

    const textEvents = events.filter((e) => e.type === 'text_delta');
    expect(textEvents.length).toBeGreaterThan(0);
  });

  it('yields pending_action for confirm-permission tools with Haiku', async () => {
    const { provider } = createMockProvider(
      [
        [{ type: 'tool_call', id: 'tc1', name: 'save_deposit', input: { amount: 50 } }],
      ],
      HAIKU_MODEL,
    );

    const engine = new QueryEngine({
      provider,
      tools: [balanceTool, saveTool],
      model: HAIKU_MODEL,
      systemPrompt: { type: 'text', text: 'You are a financial assistant.' },
      priceCache: new Map([['SUI', 3.5], ['USDC', 1]]),
      permissionConfig: {
        globalAutoBelow: 10,
        autonomousDailyLimit: 200,
        rules: [{ operation: 'save' as const, autoBelow: 50, confirmBetween: 1000 }],
      },
    });

    const events = await collectEvents(engine.submitMessage('Save $50'));

    const pendingActions = events.filter((e) => e.type === 'pending_action');
    expect(pendingActions.length).toBe(1);
    expect((pendingActions[0] as { action: { toolName: string } }).action.toolName).toBe('save_deposit');
  });

  it('falls back to default model when none specified', async () => {
    const { provider, receivedModels } = createMockProvider(
      [[{ type: 'text', text: 'Hello!' }]],
    );

    const engine = new QueryEngine({
      provider,
      tools: [balanceTool],
      systemPrompt: { type: 'text', text: 'You are a financial assistant.' },
    });

    await collectEvents(engine.submitMessage('Hi'));

    expect(receivedModels.length).toBeGreaterThan(0);
    expect(receivedModels.every((m) => m !== HAIKU_MODEL)).toBe(true);
  });

  it('processes multi-turn tool calls with Haiku model', async () => {
    const { provider } = createMockProvider(
      [
        [{ type: 'tool_call', id: 'tc1', name: 'balance_check', input: {} }],
        [{ type: 'text', text: 'Done checking.' }],
      ],
      HAIKU_MODEL,
    );

    const engine = new QueryEngine({
      provider,
      tools: [balanceTool, saveTool],
      model: HAIKU_MODEL,
      systemPrompt: { type: 'text', text: 'You are a financial assistant.' },
    });

    const events = await collectEvents(engine.submitMessage('Check my balance'));

    const toolStarts = events.filter((e) => e.type === 'tool_start');
    const toolResults = events.filter((e) => e.type === 'tool_result');
    expect(toolStarts.length).toBe(1);
    expect(toolResults.length).toBe(1);
    expect(events.some((e) => e.type === 'turn_complete')).toBe(true);
  });
});
