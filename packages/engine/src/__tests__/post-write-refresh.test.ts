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
// Minimal scripted provider — same shape as confirmation.test.ts so each
// QueryEngine.chat() call returns the next scripted "turn".
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
      yield { type: 'usage', inputTokens: 10, outputTokens: 5 };
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

async function collect(gen: AsyncGenerator<EngineEvent>): Promise<EngineEvent[]> {
  const out: EngineEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

// ---------------------------------------------------------------------------
// Test tools — call counters let us assert refresh tools fired exactly once
// each per resume, and never on the deny / failed-write paths.
// ---------------------------------------------------------------------------

let balanceCalls = 0;
let savingsCalls = 0;
let healthCalls = 0;

const balanceTool: Tool = buildTool({
  name: 'balance_check',
  description: 'wallet balance',
  inputSchema: z.object({}),
  jsonSchema: { type: 'object', properties: {} },
  isReadOnly: true,
  async call() {
    balanceCalls++;
    return { data: { wallet: 112.43, holdings: [{ symbol: 'USDC', balance: 93.37 }] } };
  },
});

const savingsTool: Tool = buildTool({
  name: 'savings_info',
  description: 'savings positions',
  inputSchema: z.object({}),
  jsonSchema: { type: 'object', properties: {} },
  isReadOnly: true,
  async call() {
    savingsCalls++;
    return { data: { totalSavings: 10, savingsRate: 3.96 } };
  },
});

const healthTool: Tool = buildTool({
  name: 'health_check',
  description: 'borrow health',
  inputSchema: z.object({}),
  jsonSchema: { type: 'object', properties: {} },
  isReadOnly: true,
  async call() {
    healthCalls++;
    return { data: { healthFactor: 2.1 } };
  },
});

// Save deposit — write tool requiring confirmation.
const saveDeposit: Tool = buildTool({
  name: 'save_deposit',
  description: 'deposit USDC into NAVI',
  inputSchema: z.object({ amount: z.number() }),
  jsonSchema: {
    type: 'object',
    properties: { amount: { type: 'number' } },
    required: ['amount'],
  },
  isReadOnly: false,
  permissionLevel: 'confirm',
  async call(input) {
    return { data: { success: true, amount: input.amount } };
  },
});

// Failing write — used to assert refresh is skipped on { success: false }.
const failingWrite: Tool = buildTool({
  name: 'borrow',
  description: 'borrow against savings',
  inputSchema: z.object({ amount: z.number() }),
  jsonSchema: {
    type: 'object',
    properties: { amount: { type: 'number' } },
    required: ['amount'],
  },
  isReadOnly: false,
  permissionLevel: 'confirm',
  async call(input) {
    return { data: { success: true, amount: input.amount } };
  },
});

describe('Post-write refresh ([v1.5] EngineConfig.postWriteRefresh)', () => {
  function reset(): void {
    balanceCalls = 0;
    savingsCalls = 0;
    healthCalls = 0;
  }

  // Helper: drive a write through pending_action → resume.
  async function runWriteAndResume(opts: {
    refreshMap?: Record<string, string[]>;
    write: Tool;
    writeName: string;
    writeInput: unknown;
    approved: boolean;
    executionResult?: unknown;
    extraTools?: Tool[];
  }): Promise<EngineEvent[]> {
    const provider = createMockProvider([
      [{ type: 'tool_call', id: 'tc-write', name: opts.writeName, input: opts.writeInput }],
      [{ type: 'text', text: 'Done.' }],
    ]);
    const engine = new QueryEngine({
      provider,
      tools: [
        opts.write,
        balanceTool,
        savingsTool,
        healthTool,
        ...(opts.extraTools ?? []),
      ],
      systemPrompt: 'test',
      postWriteRefresh: opts.refreshMap,
    });

    let pa: PendingAction | null = null;
    for await (const e of engine.submitMessage('go')) {
      if (e.type === 'pending_action') pa = e.action;
    }
    expect(pa).not.toBeNull();

    return collect(
      engine.resumeWithToolResult(pa!, {
        approved: opts.approved,
        executionResult: opts.executionResult,
      }),
    );
  }

  it('runs configured refresh tools after a successful write and flags them', async () => {
    reset();
    const events = await runWriteAndResume({
      refreshMap: { save_deposit: ['balance_check', 'savings_info'] },
      write: saveDeposit,
      writeName: 'save_deposit',
      writeInput: { amount: 10 },
      approved: true,
      executionResult: { success: true, digest: '0xabc' },
    });

    expect(balanceCalls).toBe(1);
    expect(savingsCalls).toBe(1);
    expect(healthCalls).toBe(0);

    const toolResults = events.filter((e) => e.type === 'tool_result');
    // 1 for the write itself + 2 for refresh
    expect(toolResults.length).toBeGreaterThanOrEqual(3);
    const refreshes = toolResults.filter(
      (e) => e.type === 'tool_result' && e.wasPostWriteRefresh,
    );
    expect(refreshes).toHaveLength(2);
    const names = refreshes.map((e) => (e.type === 'tool_result' ? e.toolName : ''));
    expect(names).toEqual(['balance_check', 'savings_info']);
  });

  it('orders refresh events between the write tool_result and the LLM narration', async () => {
    reset();
    const events = await runWriteAndResume({
      refreshMap: { save_deposit: ['balance_check'] },
      write: saveDeposit,
      writeName: 'save_deposit',
      writeInput: { amount: 10 },
      approved: true,
      executionResult: { success: true },
    });

    const eventTypes = events.map((e) =>
      e.type === 'tool_result'
        ? `tool_result:${e.toolName}${e.wasPostWriteRefresh ? '*' : ''}`
        : e.type,
    );
    const writeIdx = eventTypes.indexOf('tool_result:save_deposit');
    const refreshIdx = eventTypes.indexOf('tool_result:balance_check*');
    const firstTextIdx = eventTypes.indexOf('text_delta');

    expect(writeIdx).toBeGreaterThanOrEqual(0);
    expect(refreshIdx).toBeGreaterThan(writeIdx);
    // Refresh must land before the LLM's narration so the model can cite it.
    expect(firstTextIdx === -1 || firstTextIdx > refreshIdx).toBe(true);
  });

  it('skips refresh entirely when the write was declined', async () => {
    reset();
    await runWriteAndResume({
      refreshMap: { save_deposit: ['balance_check', 'savings_info'] },
      write: saveDeposit,
      writeName: 'save_deposit',
      writeInput: { amount: 10 },
      approved: false,
    });
    expect(balanceCalls).toBe(0);
    expect(savingsCalls).toBe(0);
  });

  it('skips refresh when executionResult signals { success: false }', async () => {
    reset();
    await runWriteAndResume({
      refreshMap: { borrow: ['balance_check', 'savings_info', 'health_check'] },
      write: failingWrite,
      writeName: 'borrow',
      writeInput: { amount: 50 },
      approved: true,
      executionResult: { success: false, error: 'insufficient collateral' },
    });
    expect(balanceCalls).toBe(0);
    expect(savingsCalls).toBe(0);
    expect(healthCalls).toBe(0);
  });

  it('is a no-op when no refresh map is configured (back-compat)', async () => {
    reset();
    const events = await runWriteAndResume({
      refreshMap: undefined,
      write: saveDeposit,
      writeName: 'save_deposit',
      writeInput: { amount: 10 },
      approved: true,
      executionResult: { success: true },
    });
    expect(balanceCalls).toBe(0);
    const refreshes = events.filter(
      (e) => e.type === 'tool_result' && e.wasPostWriteRefresh,
    );
    expect(refreshes).toHaveLength(0);
  });

  it('silently ignores unknown / non-readonly refresh tool names', async () => {
    reset();
    const events = await runWriteAndResume({
      refreshMap: {
        save_deposit: ['balance_check', 'does_not_exist', 'save_deposit'],
      },
      write: saveDeposit,
      writeName: 'save_deposit',
      writeInput: { amount: 10 },
      approved: true,
      executionResult: { success: true },
    });
    expect(balanceCalls).toBe(1);
    const refreshes = events.filter(
      (e) => e.type === 'tool_result' && e.wasPostWriteRefresh,
    );
    expect(refreshes).toHaveLength(1);
  });

  it('still continues to the LLM narration when a refresh tool throws', async () => {
    reset();
    const flakyTool: Tool = buildTool({
      name: 'health_check_flaky',
      description: 'simulates RPC failure',
      inputSchema: z.object({}),
      jsonSchema: { type: 'object', properties: {} },
      isReadOnly: true,
      async call() {
        throw new Error('rpc 503');
      },
    });
    const events = await runWriteAndResume({
      refreshMap: { save_deposit: ['health_check_flaky', 'balance_check'] },
      write: saveDeposit,
      writeName: 'save_deposit',
      writeInput: { amount: 10 },
      approved: true,
      executionResult: { success: true },
      extraTools: [flakyTool],
    });
    expect(balanceCalls).toBe(1);
    const errored = events.filter(
      (e) =>
        e.type === 'tool_result' &&
        e.wasPostWriteRefresh &&
        e.isError,
    );
    expect(errored).toHaveLength(1);
    // Narration still happens
    expect(events.some((e) => e.type === 'text_delta')).toBe(true);
    expect(events.some((e) => e.type === 'turn_complete')).toBe(true);
  });
});
