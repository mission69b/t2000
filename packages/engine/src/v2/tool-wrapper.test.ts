// ---------------------------------------------------------------------------
// v2/tool-wrapper.test.ts — unit tests for the legacy → AI SDK bridge
// ---------------------------------------------------------------------------
//
// SPEC 37 v0.7a Phase 2 Day 2 (2026-05-15).
//
// Verifies the bridge's behavior in isolation (no streamText, no real
// model). Companion to engine.test.ts which covers integration with
// the engine + real Anthropic API.
//
// Coverage:
//   - wrapLegacyTool returns an AI SDK Tool that defers to the legacy
//     tool's call() method
//   - experimental_context flows through to the legacy tool's ctx arg
//   - preflight failure throws (not silently caught)
//   - preflight needsInput throws with a "v2 doesn't support pending_input"
//     message
//   - permissionLevel=auto → needsApproval returns false unconditionally
//   - permissionLevel=confirm → needsApproval defers to USD resolver
//   - permissionLevel=explicit → needsApproval returns true unconditionally
//   - bulk wrapping preserves tool names
// ---------------------------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { defineTool } from './define-tool.js';
import type { Tool as LegacyTool, ToolContext, PermissionLevel } from '../types.js';
import { wrapLegacyTool, toAISDKTools } from './tool-wrapper.js';
import { DEFAULT_PERMISSION_CONFIG } from '../permission-rules.js';
import { createGuardRunnerState } from '../guards.js';
import type { InternalContext } from './internal-context.js';

function makeLegacyTool(overrides: Partial<LegacyTool> = {}): LegacyTool {
  const base: LegacyTool = defineTool({
    name: 'test_tool',
    description: 'A test tool.',
    inputSchema: z.object({ x: z.string() }),
    flags: {},
    permissionLevel: 'auto',
    isReadOnly: true,
    isConcurrencySafe: true,
    call: async (input: { x: string }) => ({
      data: { received: input.x },
      displayText: `received ${input.x}`,
    }),
  });
  return { ...base, ...overrides } as LegacyTool;
}

function makeCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    walletAddress: '0xtest',
    priceCache: new Map([['SUI', 1.5]]),
    permissionConfig: DEFAULT_PERMISSION_CONFIG,
    sessionSpendUsd: 0,
    retryStats: { attemptCount: 1 },
    // [Day 13.2 / 2026-05-16] Tests in this file exercise the USD-aware
    // resolver path. Audric (no agent) forces `needsApproval=true` for ALL
    // confirm-tier writes via the agent-absent guard in
    // `need-approval.ts`. Set a stub agent here so the resolver-path tests
    // can still assert sub-threshold writes resolve to `auto`. Audric's
    // no-agent behaviour has its own test in `need-approval.test.ts`.
    agent: { stub: true },
    ...overrides,
  };
}

/**
 * Day 3: wrapper expects InternalContext (which embeds ToolContext) as
 * `experimental_context`. This helper wraps a ToolContext into the
 * minimal InternalContext shape needed for the tool wrapper tests.
 */
function makeInternalCtx(overrides: Partial<ToolContext> = {}): InternalContext {
  return {
    toolContext: makeCtx(overrides),
    guardState: createGuardRunnerState(),
    guardConfig: undefined, // no guards run unless test opts in
    contacts: [],
    walletAddress: overrides.walletAddress ?? '0xtest',
    config: {
      onAutoExecuted: undefined,
      onGuardFired: undefined,
      postWriteRefresh: undefined,
      permissionConfig: overrides.permissionConfig ?? DEFAULT_PERMISSION_CONFIG,
      priceCache: overrides.priceCache ?? new Map([['SUI', 1.5]]),
    },
    getMessages: () => [],
  };
}

describe('wrapLegacyTool', () => {
  it('returns an AI SDK Tool with description + inputSchema preserved', () => {
    const legacy = makeLegacyTool();
    const wrapped = wrapLegacyTool(legacy);
    expect(wrapped.description).toBe('A test tool.');
    expect(wrapped.inputSchema).toBe(legacy.inputSchema);
  });

  it('execute() defers to legacy call() with input + ToolContext, returns UNWRAPPED data', async () => {
    const callSpy = vi.fn(async (input: { x: string }, _ctx: ToolContext) => ({
      data: { received: input.x },
      displayText: `received ${input.x}`,
    }));
    const legacy = makeLegacyTool({ call: callSpy });
    const wrapped = wrapLegacyTool(legacy);

    const result = await wrapped.execute!(
      { x: 'hello' },
      {
        toolCallId: 'call_1',
        messages: [],
        experimental_context: makeInternalCtx(),
      },
    );

    expect(callSpy).toHaveBeenCalledTimes(1);
    const callRecord = callSpy.mock.calls[0]!;
    expect(callRecord[0]).toEqual({ x: 'hello' });
    expect(callRecord[1].walletAddress).toBe('0xtest');
    // [Day 17b] Wrapper must unwrap `ToolResult<T>` → just `data`.
    // Returning `{ data, displayText }` (the wrapped shape) propagates a
    // one-level-too-deep result to AI SDK, the LLM, persistence, AND
    // the bridge's `__canvas` detection. Mirrors the legacy
    // `executeTool` contract exactly.
    expect(result).toEqual({ received: 'hello' });
  });

  it('execute() unwraps __canvas-shaped tool results so the signal lives at the top level', async () => {
    // [Day 17b] Regression test for the AISDKEngine canvas-render bug.
    // Pre-fix: render_canvas tools persisted as
    // `{ data: { __canvas: true, ... }, displayText: "..." }`, which
    // broke both the bridge's `canvas`-event emission AND audric's
    // rehydration check (`isCanvasShapedResult` looks for
    // `result.__canvas === true`, not `result.data.__canvas`).
    const callSpy = vi.fn(async () => ({
      data: {
        __canvas: true,
        template: 'portfolio_timeline',
        title: 'Net Worth Over Time',
        templateData: { available: true, address: '0xabc' },
      },
      displayText: 'Opened Portfolio Timeline.',
    }));
    const legacy = makeLegacyTool({ call: callSpy });
    const wrapped = wrapLegacyTool(legacy);

    const result = (await wrapped.execute!(
      { x: 'a' },
      {
        toolCallId: 'call_canvas',
        messages: [],
        experimental_context: makeInternalCtx(),
      },
    )) as Record<string, unknown>;

    // __canvas signal MUST sit at top level, not nested under .data.
    expect(result.__canvas).toBe(true);
    expect(result.template).toBe('portfolio_timeline');
    expect(result.title).toBe('Net Worth Over Time');
    expect(result.templateData).toEqual({ available: true, address: '0xabc' });
    // displayText is intentionally dropped — it's a host-UI hint, not
    // model-visible. Matches `executeTool` in orchestration.ts.
    expect(result).not.toHaveProperty('displayText');
    expect(result).not.toHaveProperty('data');
  });

  it('forwards AI SDK abortSignal into ToolContext.signal', async () => {
    const callSpy = vi.fn(async (_input: unknown, ctx: ToolContext) => {
      expect(ctx.signal).toBeDefined();
      return { data: null };
    });
    const legacy = makeLegacyTool({ call: callSpy });
    const wrapped = wrapLegacyTool(legacy);
    const controller = new AbortController();

    await wrapped.execute!(
      { x: 'a' },
      {
        toolCallId: 'call_2',
        messages: [],
        abortSignal: controller.signal,
        experimental_context: makeInternalCtx(),
      },
    );

    expect(callSpy).toHaveBeenCalled();
    const passedCtx = callSpy.mock.calls[0][1];
    expect(passedCtx.signal).toBe(controller.signal);
  });

  it('preflight failure throws (does not silently call())', async () => {
    const callSpy = vi.fn();
    const legacy = makeLegacyTool({
      preflight: () => ({ valid: false, error: 'amount must be positive' }),
      call: callSpy,
    });
    const wrapped = wrapLegacyTool(legacy);

    await expect(
      wrapped.execute!(
        { x: 'a' },
        {
          toolCallId: 'call_3',
          messages: [],
          experimental_context: makeInternalCtx(),
        },
      ),
    ).rejects.toThrow('amount must be positive');
    expect(callSpy).not.toHaveBeenCalled();
  });

  it('preflight needsInput throws with v2-not-supported message', async () => {
    const legacy = makeLegacyTool({
      preflight: () =>
        ({
          valid: false,
          needsInput: { schema: { fields: [] }, description: 'need a name' },
        }) as ReturnType<NonNullable<LegacyTool['preflight']>>,
    });
    const wrapped = wrapLegacyTool(legacy);

    await expect(
      wrapped.execute!(
        { x: 'a' },
        {
          toolCallId: 'call_4',
          messages: [],
          experimental_context: makeInternalCtx(),
        },
      ),
    ).rejects.toThrow(/pending_input pattern/);
  });
});

describe('wrapLegacyTool needsApproval (USD-aware permission resolver)', () => {
  function makeWrappedWithLevel(level: PermissionLevel) {
    return wrapLegacyTool(
      makeLegacyTool({
        name: 'save_deposit', // matches a TOOL_POLICY entry; used by the resolver
        permissionLevel: level,
        isReadOnly: false,
        isConcurrencySafe: false,
      }),
    );
  }

  // Helper: needsApproval can be either a boolean or a function per AI SDK
  // typings. wrapLegacyTool always installs the function form (because the
  // USD resolver runs per call), but the TS compiler can't narrow that —
  // assert + invoke explicitly.
  function callApproval(
    wrapped: ReturnType<typeof wrapLegacyTool>,
    input: unknown,
    internal: InternalContext,
  ): Promise<boolean> {
    const fn = wrapped.needsApproval;
    expect(typeof fn).toBe('function');
    return Promise.resolve(
      (
        fn as (
          i: unknown,
          o: { toolCallId: string; messages: unknown[]; experimental_context?: unknown },
        ) => boolean | PromiseLike<boolean>
      )(input, { toolCallId: 'c', messages: [], experimental_context: internal }),
    );
  }

  it('auto-tier tool: needsApproval always returns false', async () => {
    const wrapped = wrapLegacyTool(makeLegacyTool({ name: 'rates_info' })); // auto in TOOL_POLICY
    const result = await callApproval(wrapped, { x: 'a' }, makeInternalCtx());
    expect(result).toBe(false);
  });

  it('confirm-tier tool: large USD amount → needsApproval returns true', async () => {
    const wrapped = makeWrappedWithLevel('confirm');
    // save_deposit autoBelow=50; amount=500 → confirm
    const result = await callApproval(wrapped, { amount: 500 }, makeInternalCtx());
    expect(result).toBe(true);
  });

  it('confirm-tier tool: small USD amount under autoBelow → needsApproval returns false', async () => {
    const wrapped = makeWrappedWithLevel('confirm');
    // save_deposit autoBelow=50; amount=10 → auto (no approval needed)
    const result = await callApproval(wrapped, { amount: 10 }, makeInternalCtx());
    expect(result).toBe(false);
  });

  it('confirm-tier tool: missing permissionConfig → fail closed (returns true)', async () => {
    const wrapped = makeWrappedWithLevel('confirm');
    const result = await callApproval(
      wrapped,
      { amount: 10 },
      makeInternalCtx({ permissionConfig: undefined }),
    );
    expect(result).toBe(true);
  });
});

describe('toAISDKTools (bulk wrapping)', () => {
  it('preserves tool names as keys for the LLM', () => {
    const tools = [
      makeLegacyTool({ name: 'tool_a' }),
      makeLegacyTool({ name: 'tool_b' }),
      makeLegacyTool({ name: 'tool_c' }),
    ];
    const wrapped = toAISDKTools(tools);
    expect(Object.keys(wrapped).sort()).toEqual(['tool_a', 'tool_b', 'tool_c']);
  });

  it('returns an empty object for empty input', () => {
    expect(toAISDKTools([])).toEqual({});
  });
});
