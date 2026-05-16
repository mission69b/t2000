// ---------------------------------------------------------------------------
// v2/step-finish.test.ts — unit tests for the onStepFinish handler
// ---------------------------------------------------------------------------
//
// SPEC 37 v0.7a Phase 2 Day 3 (2026-05-15).
//
// Verifies the step-finish handler's three responsibilities:
//   1. Calls updateGuardStateAfterToolResult for every tool result
//   2. Fires onAutoExecuted for successful WRITE tool calls
//   3. Accumulates sessionSpendUsd across writes (mirrored back into ToolContext)
//
// Errors:
//   - guard state update is skipped on isError=true (matches legacy behavior)
//   - onAutoExecuted is skipped on read tools and on errors
//   - onAutoExecuted host throws are caught (don't break engine)
// ---------------------------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import type { StepResult, ToolSet } from 'ai';
import { defineTool } from './define-tool.js';
import type { Tool as LegacyTool } from '../types.js';
import { createGuardRunnerState, DEFAULT_GUARD_CONFIG } from '../guards.js';
import { DEFAULT_PERMISSION_CONFIG } from '../permission-rules.js';
import { buildStepFinishHandler, type StepFinishMutableState } from './step-finish.js';
import type { InternalContext } from './internal-context.js';

function makeReadTool(name = 'balance_check'): LegacyTool {
  return defineTool({
    name,
    description: 'A read tool.',
    inputSchema: z.object({}),
    flags: {},
    permissionLevel: 'auto',
    isReadOnly: true,
    isConcurrencySafe: true,
    call: async () => ({ data: null }),
  });
}

function makeWriteTool(name = 'send_transfer'): LegacyTool {
  return defineTool({
    name,
    description: 'A write tool.',
    inputSchema: z.object({ amount: z.number(), to: z.string() }),
    flags: { mutating: true },
    permissionLevel: 'confirm',
    isReadOnly: false,
    isConcurrencySafe: false,
    call: async () => ({ data: null }),
  });
}

function makeInternal(
  overrides: Partial<InternalContext> & {
    onAutoExecuted?: InternalContext['config']['onAutoExecuted'];
  } = {},
): InternalContext {
  return {
    toolContext: {
      walletAddress: '0xtest',
      retryStats: { attemptCount: 1 },
      sessionSpendUsd: 0,
      priceCache: new Map([['USDC', 1]]),
      permissionConfig: DEFAULT_PERMISSION_CONFIG,
    },
    guardState: createGuardRunnerState(),
    guardConfig: DEFAULT_GUARD_CONFIG,
    contacts: [],
    walletAddress: '0xtest',
    config: {
      onAutoExecuted: overrides.onAutoExecuted,
      onGuardFired: undefined,
      postWriteRefresh: undefined,
      permissionConfig: DEFAULT_PERMISSION_CONFIG,
      priceCache: new Map([['USDC', 1]]),
    },
    getMessages: () => [],
    ...overrides,
  };
}

/**
 * Construct a minimal StepResult<ToolSet> shape with the fields
 * step-finish actually reads. Other fields use harmless stub values.
 */
function makeStep(
  toolResults: Array<{ toolName: string; toolCallId: string; input: unknown; output: unknown }>,
  toolErrors: Array<{ toolName: string; toolCallId: string; input: unknown; error: unknown }> = [],
): StepResult<ToolSet> {
  const tcs = toolResults.map((r) => ({
    type: 'tool-call' as const,
    toolCallId: r.toolCallId,
    toolName: r.toolName,
    input: r.input,
    dynamic: true as const,
  }));
  const trs = toolResults.map((r) => ({
    type: 'tool-result' as const,
    toolCallId: r.toolCallId,
    toolName: r.toolName,
    input: r.input,
    output: r.output,
    dynamic: true as const,
  }));
  const tes = toolErrors.map((e) => ({
    type: 'tool-error' as const,
    toolCallId: e.toolCallId,
    toolName: e.toolName,
    input: e.input,
    error: e.error,
    dynamic: true as const,
  }));

  return {
    stepNumber: 0,
    model: { provider: 'anthropic', modelId: 'test' },
    functionId: undefined,
    metadata: undefined,
    experimental_context: undefined,
    content: [...tcs, ...trs, ...tes],
    text: '',
    reasoning: [],
    reasoningText: undefined,
    files: [],
    sources: [],
    toolCalls: tcs,
    staticToolCalls: [],
    dynamicToolCalls: tcs,
    toolResults: trs,
    staticToolResults: [],
    dynamicToolResults: trs,
    finishReason: 'tool-calls',
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    warnings: [],
    request: {} as never,
    response: {} as never,
    providerMetadata: undefined,
  } as unknown as StepResult<ToolSet>;
}

describe('buildStepFinishHandler', () => {
  it('calls onAutoExecuted for a successful write tool call', async () => {
    const onAutoExecuted = vi.fn();
    const tool = makeWriteTool('send_transfer');
    const internal = makeInternal({ onAutoExecuted });
    const mutable: StepFinishMutableState = { sessionSpendUsdLocal: 0 };
    const handler = buildStepFinishHandler([tool], internal, mutable);

    const step = makeStep([
      {
        toolName: 'send_transfer',
        toolCallId: 'call_1',
        input: { amount: 5, to: '0xabc' },
        output: { ok: true },
      },
    ]);

    await handler(step);

    // onAutoExecuted is fired in the background — wait a tick for the
    // promise chain to resolve.
    await new Promise((r) => setImmediate(r));

    expect(onAutoExecuted).toHaveBeenCalledTimes(1);
    expect(onAutoExecuted).toHaveBeenCalledWith({
      toolName: 'send_transfer',
      usdValue: expect.any(Number),
      walletAddress: '0xtest',
    });
  });

  it('does NOT call onAutoExecuted for a read tool', async () => {
    const onAutoExecuted = vi.fn();
    const tool = makeReadTool('balance_check');
    const internal = makeInternal({ onAutoExecuted });
    const mutable: StepFinishMutableState = { sessionSpendUsdLocal: 0 };
    const handler = buildStepFinishHandler([tool], internal, mutable);

    const step = makeStep([
      {
        toolName: 'balance_check',
        toolCallId: 'call_2',
        input: {},
        output: { balance: 100 },
      },
    ]);

    await handler(step);
    await new Promise((r) => setImmediate(r));

    expect(onAutoExecuted).not.toHaveBeenCalled();
  });

  it('does NOT call onAutoExecuted on a tool-error', async () => {
    const onAutoExecuted = vi.fn();
    const tool = makeWriteTool('send_transfer');
    const internal = makeInternal({ onAutoExecuted });
    const mutable: StepFinishMutableState = { sessionSpendUsdLocal: 0 };
    const handler = buildStepFinishHandler([tool], internal, mutable);

    const step = makeStep(
      [],
      [
        {
          toolName: 'send_transfer',
          toolCallId: 'call_3',
          input: { amount: 5, to: '0xabc' },
          error: new Error('rpc unavailable'),
        },
      ],
    );

    await handler(step);
    await new Promise((r) => setImmediate(r));

    expect(onAutoExecuted).not.toHaveBeenCalled();
  });

  it('accumulates sessionSpendUsd across multiple write calls', async () => {
    const tool = makeWriteTool('send_transfer');
    const internal = makeInternal();
    const mutable: StepFinishMutableState = { sessionSpendUsdLocal: 0 };
    const handler = buildStepFinishHandler([tool], internal, mutable);

    const step1 = makeStep([
      {
        toolName: 'send_transfer',
        toolCallId: 'call_a',
        input: { amount: 3, to: '0xabc' },
        output: { ok: true },
      },
    ]);
    const step2 = makeStep([
      {
        toolName: 'send_transfer',
        toolCallId: 'call_b',
        input: { amount: 7, to: '0xdef' },
        output: { ok: true },
      },
    ]);

    await handler(step1);
    const after1 = mutable.sessionSpendUsdLocal;
    await handler(step2);
    const after2 = mutable.sessionSpendUsdLocal;

    expect(after1).toBeGreaterThan(0);
    expect(after2).toBeGreaterThan(after1);
    // ToolContext.sessionSpendUsd is mirrored after each step
    expect(internal.toolContext.sessionSpendUsd).toBe(after2);
  });

  it('catches host errors thrown by onAutoExecuted (does not propagate)', async () => {
    const onAutoExecuted = vi.fn(() => {
      throw new Error('host crash');
    });
    const tool = makeWriteTool('send_transfer');
    const internal = makeInternal({ onAutoExecuted });
    const mutable: StepFinishMutableState = { sessionSpendUsdLocal: 0 };
    const handler = buildStepFinishHandler([tool], internal, mutable);

    const step = makeStep([
      {
        toolName: 'send_transfer',
        toolCallId: 'call_4',
        input: { amount: 5, to: '0xabc' },
        output: { ok: true },
      },
    ]);

    // Should not throw — host errors get console.warn'd inside the
    // handler's promise chain.
    await expect(handler(step)).resolves.toBeUndefined();
    await new Promise((r) => setImmediate(r));

    expect(onAutoExecuted).toHaveBeenCalled();
  });

  it('updates guard state for both read and write tool results', async () => {
    const readTool = makeReadTool('balance_check');
    const writeTool = makeWriteTool('send_transfer');
    const internal = makeInternal();
    const mutable: StepFinishMutableState = { sessionSpendUsdLocal: 0 };
    const handler = buildStepFinishHandler([readTool, writeTool], internal, mutable);

    // Pre-state: balance tracker has never read.
    expect(internal.guardState.balanceTracker.hasEverRead()).toBe(false);

    const step = makeStep([
      {
        toolName: 'balance_check',
        toolCallId: 'call_r',
        input: {},
        output: { balance: 100 },
      },
      {
        toolName: 'send_transfer',
        toolCallId: 'call_w',
        input: { amount: 1, to: '0xabc' },
        output: { ok: true },
      },
    ]);

    await handler(step);

    // After step: balance_check fired recordRead. The exact `isStale()`
    // outcome depends on Date.now() resolution — both recordRead +
    // recordWrite happen in the same millisecond in this test, so
    // staleness is racy. We assert only the deterministic invariant
    // (hasEverRead) here; staleness is covered by guards.test in legacy.
    expect(internal.guardState.balanceTracker.hasEverRead()).toBe(true);
  });
});
