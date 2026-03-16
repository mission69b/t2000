import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentLoop, type AgentLoopOptions } from './agent-loop.js';
import type { LLMProvider, LLMResponse, ChatParams } from './llm/types.js';
import type { GatewayTool } from './tools.js';
import { z } from 'zod';

function createMockLLM(responses: LLMResponse[]): LLMProvider {
  let callCount = 0;
  return {
    id: 'mock',
    model: 'mock-model',
    chat: vi.fn(async (_params: ChatParams): Promise<LLMResponse> => {
      return responses[callCount++] ?? { text: 'no more responses', usage: { inputTokens: 0, outputTokens: 0 } };
    }),
  };
}

function createReadTool(name = 't2000_balance'): GatewayTool {
  return {
    name,
    description: 'Test read tool',
    schema: z.object({}),
    handler: vi.fn(async () => ({ balance: 100 })),
    stateChanging: false,
  };
}

function createWriteTool(name = 't2000_send'): GatewayTool {
  return {
    name,
    description: 'Test write tool',
    schema: z.object({ to: z.string(), amount: z.number() }),
    handler: vi.fn(async () => ({ txHash: '0xabc' })),
    stateChanging: true,
  };
}

const mockAgent = {
  address: () => '0x1234567890abcdef',
  balance: async () => ({ available: 1000, savings: 500, debt: 0, gasReserve: { sui: 1, usdEquiv: 3 }, net: 1500 }),
  positions: async () => ({ positions: [] }),
  rates: async () => ({}),
  healthFactor: async () => ({ healthFactor: 2.5 }),
  enforcer: { getConfig: () => ({ locked: false, maxPerTx: 0, maxDailySend: 0, dailyUsed: 0 }), assertNotLocked: () => {}, check: () => {} },
  contacts: { resolve: (addr: string) => ({ address: addr }), list: () => [] },
} as unknown;

function createLoop(llm: LLMProvider, tools: GatewayTool[]): AgentLoop {
  const opts: AgentLoopOptions = {
    agent: mockAgent as any,
    llm,
    tools,
    toolDefinitions: tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: { type: 'object', properties: {} },
    })),
  };
  return new AgentLoop(opts);
}

describe('AgentLoop', () => {
  describe('text-only responses', () => {
    it('returns LLM text when no tool calls', async () => {
      const llm = createMockLLM([{ text: 'Your balance is $100', usage: { inputTokens: 10, outputTokens: 20 } }]);
      const loop = createLoop(llm, [createReadTool()]);

      const result = await loop.processMessage('what is my balance?');
      expect(result.text).toBe('Your balance is $100');
      expect(result.toolCalls).toHaveLength(0);
      expect(result.usage.inputTokens).toBe(10);
      expect(result.usage.outputTokens).toBe(20);
    });

    it('tracks cumulative usage across messages', async () => {
      const llm = createMockLLM([
        { text: 'first', usage: { inputTokens: 10, outputTokens: 5 } },
        { text: 'second', usage: { inputTokens: 15, outputTokens: 8 } },
      ]);
      const loop = createLoop(llm, []);

      await loop.processMessage('hello');
      await loop.processMessage('again');

      const total = loop.getTotalUsage();
      expect(total.inputTokens).toBe(25);
      expect(total.outputTokens).toBe(13);
    });
  });

  describe('read tool execution', () => {
    it('executes read tools immediately without confirmation', async () => {
      const readTool = createReadTool();
      const llm = createMockLLM([
        {
          text: '',
          toolCalls: [{ id: 'tc_1', name: 't2000_balance', arguments: {} }],
          usage: { inputTokens: 10, outputTokens: 5 },
        },
        { text: 'Your balance is $100', usage: { inputTokens: 20, outputTokens: 10 } },
      ]);
      const loop = createLoop(llm, [readTool]);

      const result = await loop.processMessage('check balance');
      expect(readTool.handler).toHaveBeenCalled();
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].dryRun).toBe(false);
      expect(result.needsConfirmation).toBeUndefined();
    });
  });

  describe('write tool confirmation flow', () => {
    it('runs dryRun for state-changing tools and asks for confirmation', async () => {
      const writeTool = createWriteTool();
      const llm = createMockLLM([
        {
          text: '',
          toolCalls: [{ id: 'tc_1', name: 't2000_send', arguments: { to: '0xabc', amount: 10 } }],
          usage: { inputTokens: 10, outputTokens: 5 },
        },
        { text: 'Send $10 to 0xabc? Confirm?', usage: { inputTokens: 20, outputTokens: 10 } },
      ]);
      const loop = createLoop(llm, [writeTool]);

      const result = await loop.processMessage('send $10 to 0xabc');
      expect(result.needsConfirmation).toBeTruthy();
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].dryRun).toBe(true);
      // Handler should NOT have been called yet (only dryRun preview)
      expect(writeTool.handler).not.toHaveBeenCalled();
    });

    it('executes the tool when user confirms with "yes"', async () => {
      const writeTool = createWriteTool();
      const llm = createMockLLM([
        {
          text: '',
          toolCalls: [{ id: 'tc_1', name: 't2000_send', arguments: { to: '0xabc', amount: 10 } }],
          usage: { inputTokens: 10, outputTokens: 5 },
        },
        { text: 'Send $10? Confirm?', usage: { inputTokens: 20, outputTokens: 10 } },
        { text: 'Sent $10 to 0xabc!', usage: { inputTokens: 30, outputTokens: 15 } },
      ]);
      const loop = createLoop(llm, [writeTool]);

      await loop.processMessage('send $10 to 0xabc');
      const result = await loop.processMessage('yes');

      expect(writeTool.handler).toHaveBeenCalled();
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].dryRun).toBe(false);
    });

    it('cancels the action when user says "no"', async () => {
      const writeTool = createWriteTool();
      const llm = createMockLLM([
        {
          text: '',
          toolCalls: [{ id: 'tc_1', name: 't2000_send', arguments: { to: '0xabc', amount: 10 } }],
          usage: { inputTokens: 10, outputTokens: 5 },
        },
        { text: 'Send $10? Confirm?', usage: { inputTokens: 20, outputTokens: 10 } },
      ]);
      const loop = createLoop(llm, [writeTool]);

      await loop.processMessage('send $10 to 0xabc');
      const result = await loop.processMessage('no');

      expect(result.text).toBe('Cancelled.');
      expect(writeTool.handler).not.toHaveBeenCalled();
    });

    it('expires confirmation after timeout', async () => {
      const writeTool = createWriteTool();
      const llm = createMockLLM([
        {
          text: '',
          toolCalls: [{ id: 'tc_1', name: 't2000_send', arguments: { to: '0xabc', amount: 10 } }],
          usage: { inputTokens: 10, outputTokens: 5 },
        },
        { text: 'Confirm?', usage: { inputTokens: 20, outputTokens: 10 } },
      ]);
      const loop = createLoop(llm, [writeTool]);

      await loop.processMessage('send $10');

      // Manually expire the pending confirmation
      const pending = (loop as any).pendingConfirmation;
      pending.createdAt = Date.now() - 3 * 60 * 1000; // 3 minutes ago

      const result = await loop.processMessage('yes');
      expect(result.text).toContain('expired');
      expect(writeTool.handler).not.toHaveBeenCalled();
    });
  });

  describe('unknown tools', () => {
    it('handles unknown tool calls gracefully', async () => {
      const llm = createMockLLM([
        {
          text: '',
          toolCalls: [{ id: 'tc_1', name: 'nonexistent_tool', arguments: {} }],
          usage: { inputTokens: 10, outputTokens: 5 },
        },
        { text: "I don't have that tool", usage: { inputTokens: 20, outputTokens: 10 } },
      ]);
      const loop = createLoop(llm, [createReadTool()]);

      const result = await loop.processMessage('do something weird');
      expect(result.text).toBeTruthy();
    });
  });

  describe('tool execution errors', () => {
    it('handles tool handler errors gracefully', async () => {
      const failTool: GatewayTool = {
        name: 't2000_balance',
        description: 'Failing tool',
        schema: z.object({}),
        handler: vi.fn(async () => { throw new Error('RPC timeout'); }),
        stateChanging: false,
      };
      const llm = createMockLLM([
        {
          text: '',
          toolCalls: [{ id: 'tc_1', name: 't2000_balance', arguments: {} }],
          usage: { inputTokens: 10, outputTokens: 5 },
        },
        { text: 'Sorry, there was an error fetching your balance.', usage: { inputTokens: 20, outputTokens: 10 } },
      ]);
      const loop = createLoop(llm, [failTool]);

      const result = await loop.processMessage('balance');
      expect(result.text).toBeTruthy();
    });
  });

  describe('hasPendingConfirmation', () => {
    it('returns false when no pending confirmation', () => {
      const loop = createLoop(createMockLLM([]), []);
      expect(loop.hasPendingConfirmation()).toBe(false);
    });
  });

  describe('clearHistory', () => {
    it('clears history and pending confirmations', async () => {
      const llm = createMockLLM([
        { text: 'hello', usage: { inputTokens: 5, outputTokens: 5 } },
      ]);
      const loop = createLoop(llm, []);
      await loop.processMessage('hi');
      loop.clearHistory();
      expect(loop.hasPendingConfirmation()).toBe(false);
    });
  });

  describe('execution lock', () => {
    it('serializes concurrent messages', async () => {
      const order: number[] = [];
      const llm: LLMProvider = {
        id: 'mock',
        model: 'mock',
        chat: vi.fn(async () => {
          const n = order.length;
          order.push(n);
          await new Promise(r => setTimeout(r, 50));
          return { text: `response-${n}`, usage: { inputTokens: 1, outputTokens: 1 } };
        }),
      };
      const loop = createLoop(llm, []);

      const [r1, r2] = await Promise.all([
        loop.processMessage('first'),
        loop.processMessage('second'),
      ]);

      // Both should complete, and they should have been serialized
      expect(r1.text).toBeTruthy();
      expect(r2.text).toBeTruthy();
      expect(order).toHaveLength(2);
    });
  });

  describe('max iterations', () => {
    it('stops after MAX_ITERATIONS to prevent infinite loops', async () => {
      const llm: LLMProvider = {
        id: 'mock',
        model: 'mock',
        chat: vi.fn(async () => ({
          text: '',
          toolCalls: [{ id: `tc_${Date.now()}`, name: 't2000_balance', arguments: {} }],
          usage: { inputTokens: 1, outputTokens: 1 },
        })),
      };
      const tool = createReadTool();
      const loop = createLoop(llm, [tool]);

      const result = await loop.processMessage('loop forever');
      expect(result.text).toContain('processing limit');
    });
  });
});
