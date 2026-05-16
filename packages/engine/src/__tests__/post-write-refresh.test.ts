import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { QueryEngine } from '../engine.js';
import { defineTool } from '../v2/define-tool.js';
import {
  setTelemetrySink,
  resetTelemetrySink,
  type TelemetrySink,
  type TelemetryTags,
} from '../telemetry.js';
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

const balanceTool: Tool = defineTool({
  name: 'balance_check',
  description: 'wallet balance',
  inputSchema: z.object({}),
  isReadOnly: true,
  async call() {
    balanceCalls++;
    return { data: { wallet: 112.43, holdings: [{ symbol: 'USDC', balance: 93.37 }] } };
  },
});

const savingsTool: Tool = defineTool({
  name: 'savings_info',
  description: 'savings positions',
  inputSchema: z.object({}),
  isReadOnly: true,
  async call() {
    savingsCalls++;
    return { data: { totalSavings: 10, savingsRate: 3.96 } };
  },
});

const healthTool: Tool = defineTool({
  name: 'health_check',
  description: 'borrow health',
  inputSchema: z.object({}),
  isReadOnly: true,
  async call() {
    healthCalls++;
    return { data: { healthFactor: 2.1 } };
  },
});

// Save deposit — write tool requiring confirmation.
const saveDeposit: Tool = defineTool({
  name: 'save_deposit',
  description: 'deposit USDC into NAVI',
  inputSchema: z.object({ amount: z.number() }),
  isReadOnly: false,
  permissionLevel: 'confirm',
  async call(input) {
    return { data: { success: true, amount: input.amount } };
  },
});

// Failing write — used to assert refresh is skipped on { success: false }.
const failingWrite: Tool = defineTool({
  name: 'borrow',
  description: 'borrow against savings',
  inputSchema: z.object({ amount: z.number() }),
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
      tools: [opts.write, balanceTool, savingsTool, healthTool, ...(opts.extraTools ?? [])],
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
    const refreshes = toolResults.filter((e) => e.type === 'tool_result' && e.wasPostWriteRefresh);
    expect(refreshes).toHaveLength(2);
    const names = refreshes.map((e) => (e.type === 'tool_result' ? e.toolName : ''));
    expect(names).toEqual(['balance_check', 'savings_info']);
  });

  it('[SPEC 23A-Q-source] stamps source: "pwr" on every PWR-injected tool_result', async () => {
    reset();
    const events = await runWriteAndResume({
      refreshMap: { save_deposit: ['balance_check', 'savings_info'] },
      write: saveDeposit,
      writeName: 'save_deposit',
      writeInput: { amount: 10 },
      approved: true,
      executionResult: { success: true },
    });

    const refreshes = events.filter((e) => e.type === 'tool_result' && e.wasPostWriteRefresh);
    expect(refreshes).toHaveLength(2);
    // Every PWR-injected refresh event must carry source: 'pwr' so the
    // host's <BlockRouter> can group them under PostWriteRefreshSurface
    // (SPEC 23A-A6) instead of stacking as standalone tool blocks.
    for (const r of refreshes) {
      expect(r.type === 'tool_result' && r.source).toBe('pwr');
    }

    // Sanity: the write itself (LLM-driven dispatch) must NOT be tagged
    // as 'pwr'. It rides through the resume path with source: 'llm'.
    const writeResult = events.find(
      (e) => e.type === 'tool_result' && e.toolName === 'save_deposit' && !e.wasPostWriteRefresh,
    );
    expect(writeResult).toBeDefined();
    expect(writeResult?.type === 'tool_result' && writeResult.source).toBe('llm');
  });

  it('[v1.28.1 — silent-PWR-drop fix] emits a tool_start with source: "pwr" BEFORE every tool_result, paired by toolUseId', async () => {
    // Regression for the pre-1.28.1 bug where `runPostWriteRefresh` only
    // emitted `tool_result` events, never `tool_start`. Hosts that build
    // a chronological timeline by registering blocks on `tool_start` and
    // updating them on `tool_result` (audric SPEC 8) silently dropped
    // every PWR result because no matching block existed for findLastIndex.
    // Symptom: <PostWriteRefreshSurface> never rendered in production
    // despite the engine running the refreshes correctly.
    //
    // The fix adds a leading `tool_start` emit loop. This test pins:
    //   1. tool_start fires for every refresh tool (count parity)
    //   2. Each tool_start carries source: 'pwr' so the host can route
    //      from the very first event without waiting for the result
    //   3. Each tool_start is paired by toolUseId with its tool_result
    //   4. tool_start ALWAYS precedes its matching tool_result in the
    //      event stream (chronological invariant — hosts that depend on
    //      this ordering must not see a tool_result for an unknown id)
    reset();
    const events = await runWriteAndResume({
      refreshMap: { save_deposit: ['balance_check', 'savings_info'] },
      write: saveDeposit,
      writeName: 'save_deposit',
      writeInput: { amount: 10 },
      approved: true,
      executionResult: { success: true },
    });

    const pwrStarts = events.filter((e) => e.type === 'tool_start' && e.source === 'pwr');
    const pwrResults = events.filter((e) => e.type === 'tool_result' && e.wasPostWriteRefresh);

    expect(pwrStarts).toHaveLength(2);
    expect(pwrResults).toHaveLength(2);

    // Each tool_start has a matching tool_result (paired by toolUseId).
    const startIds = pwrStarts.map((e) => (e.type === 'tool_start' ? e.toolUseId : ''));
    const resultIds = pwrResults.map((e) => (e.type === 'tool_result' ? e.toolUseId : ''));
    expect([...startIds].sort()).toEqual([...resultIds].sort());

    // Tool names match too (so the start carries the right glyph/label).
    const startNames = pwrStarts.map((e) => (e.type === 'tool_start' ? e.toolName : ''));
    expect([...startNames].sort()).toEqual(['balance_check', 'savings_info']);

    // tool_start ALWAYS precedes its matching tool_result in stream order.
    for (const id of startIds) {
      const startIdx = events.findIndex((e) => e.type === 'tool_start' && e.toolUseId === id);
      const resultIdx = events.findIndex((e) => e.type === 'tool_result' && e.toolUseId === id);
      expect(startIdx).toBeGreaterThanOrEqual(0);
      expect(resultIdx).toBeGreaterThan(startIdx);
    }
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
    const refreshes = events.filter((e) => e.type === 'tool_result' && e.wasPostWriteRefresh);
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
    const refreshes = events.filter((e) => e.type === 'tool_result' && e.wasPostWriteRefresh);
    expect(refreshes).toHaveLength(1);
  });

  it('still continues to the LLM narration when a refresh tool throws', async () => {
    reset();
    const flakyTool: Tool = defineTool({
      name: 'health_check_flaky',
      description: 'simulates RPC failure',
      inputSchema: z.object({}),
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
      (e) => e.type === 'tool_result' && e.wasPostWriteRefresh && e.isError,
    );
    expect(errored).toHaveLength(1);
    // Narration still happens
    expect(events.some((e) => e.type === 'text_delta')).toBe(true);
    expect(events.some((e) => e.type === 'turn_complete')).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // [SPEC 19 Option 3 / v1.24.12 / 2026-05-09] No post-write sleep.
  //
  // Phase A's bounded poll regressed median sleep wall-clock by +45% and
  // worst case by ~4× (production smoke 2026-05-09). Root cause: the
  // ceiling math used `floor(ceiling/interval)` which doesn't account for
  // per-iteration RPC time. By the time the poll baseline was captured,
  // the indexer had typically already caught up (host's
  // `/api/transactions/execute` already awaits `sui_wait_for_transaction`
  // ~2.1s before the resume request lands), so the poll busy-waited
  // looking for a delta that already happened.
  //
  // Option 3: skip the wait entirely. Refresh tools fire immediately
  // after cache invalidation.
  //
  // [v1.24.13 / 2026-05-09 / S.134] The Option 3 v1.24.12 safety net
  // (`engine.pwr.observed_stale_balance_check`) was REMOVED — fired
  // `stale=1` on 100% of writes in production but narrations were always
  // numerically correct. False-positive by construction: both snapshots
  // captured AFTER the write was settled = always agree.
  // ---------------------------------------------------------------------------
  describe('[SPEC 19 Option 3] no post-write sleep', () => {
    let captured: Array<{
      kind: 'counter' | 'histogram' | 'gauge';
      name: string;
      tags?: TelemetryTags;
      value?: number;
    }>;

    beforeEach(() => {
      captured = [];
      const sink: TelemetrySink = {
        counter: (name, tags, value) => {
          captured.push({ kind: 'counter', name, tags, value });
        },
        gauge: (name, value, tags) => {
          captured.push({ kind: 'gauge', name, value, tags });
        },
        histogram: (name, value, tags) => {
          captured.push({ kind: 'histogram', name, value, tags });
        },
      };
      setTelemetrySink(sink);
    });

    afterEach(() => {
      resetTelemetrySink();
    });

    it('emits engine.pwr.skipped_sleep_count exactly once per refresh and never engine.pwr.sleep_ms', async () => {
      reset();
      await runWriteAndResume({
        refreshMap: { save_deposit: ['balance_check', 'savings_info'] },
        write: saveDeposit,
        writeName: 'save_deposit',
        writeInput: { amount: 10 },
        approved: true,
        executionResult: { success: true },
      });

      const skipped = captured.filter(
        (c) => c.kind === 'counter' && c.name === 'engine.pwr.skipped_sleep_count',
      );
      expect(skipped).toHaveLength(1);

      const sleeps = captured.filter(
        (c) => c.kind === 'histogram' && c.name === 'engine.pwr.sleep_ms',
      );
      expect(sleeps).toHaveLength(0);
    });

    it('does not emit skipped_sleep_count when the write was declined (refresh skipped entirely)', async () => {
      reset();
      await runWriteAndResume({
        refreshMap: { save_deposit: ['balance_check', 'savings_info'] },
        write: saveDeposit,
        writeName: 'save_deposit',
        writeInput: { amount: 10 },
        approved: false,
      });

      const skipped = captured.filter(
        (c) => c.kind === 'counter' && c.name === 'engine.pwr.skipped_sleep_count',
      );
      expect(skipped).toHaveLength(0);
    });

    it('never emits the retired observed_stale_balance_check counter (v1.24.12 → v1.24.13 cleanup)', async () => {
      reset();
      await runWriteAndResume({
        refreshMap: { save_deposit: ['balance_check', 'savings_info'] },
        write: saveDeposit,
        writeName: 'save_deposit',
        writeInput: { amount: 10 },
        approved: true,
        executionResult: { success: true },
      });

      // Give any (would-be) background promise a microtask tick to settle.
      await new Promise((r) => setTimeout(r, 20));

      const stale = captured.filter(
        (c) => c.kind === 'counter' && c.name === 'engine.pwr.observed_stale_balance_check',
      );
      expect(stale).toHaveLength(0);
    });

    it('skipped_sleep_count tag is just has_wallet — the can_safety_net tag was retired with the safety net', async () => {
      reset();
      await runWriteAndResume({
        refreshMap: { save_deposit: ['balance_check'] },
        write: saveDeposit,
        writeName: 'save_deposit',
        writeInput: { amount: 10 },
        approved: true,
        executionResult: { success: true },
      });

      const skipped = captured.find(
        (c) => c.kind === 'counter' && c.name === 'engine.pwr.skipped_sleep_count',
      );
      expect(skipped).toBeDefined();
      expect(skipped?.tags).toEqual({ has_wallet: '0' });
    });
  });
});
